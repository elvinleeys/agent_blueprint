// OpenAI 구조 초안 생성 사전 검증 (F-004). 사용법은 SPEC-draft-test.md 참조.
//   npm run test:draft -- --screen product-detail --runs 1
// 키는 환경변수 OPENAI_API_KEY에서만 읽는다(.env.local은 npm script의 --env-file이 로드). 키·응답 원문은 출력하지 않는다.
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import OpenAI from "openai";
import { buildDraftPrompt } from "../core/prompt/draft-prompt";
import { stripOptionalNulls, toStrictJsonSchema } from "../core/prompt/strict-json-schema";
import { BlueprintSchema } from "../core/schema/blueprint";
import { SpecInputSchema, type SpecInput } from "../core/schema/spec-input";

// 가격: 1M 토큰당 USD (표준 티어, ≤272K 입력). developers.openai.com/api/docs/models/<id>, 2026-10-29 확인
const PRICES: Record<string, { in: number; out: number }> = {
  "gpt-6.1-terra": { in: 1, out: 5 },
  "gpt-6-luna": { in: 0.1, out: 0.5 },
  "gpt-6.1-sol": { in: 2, out: 10 },
};
const PRIMARY = "gpt-6.1-terra";
const FALLBACK = "gpt-6.1-sol";
const MODES = ["text", "image", "both"] as const;
type Mode = (typeof MODES)[number];
const EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"];
const IMAGE_EXTS: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const RESULT_FILE = "tasks/draft-test-result.md";

type Row = {
  model: string;
  mode: Mode;
  run: number;
  pass: boolean;
  failures: string;
  seconds: number;
  inTok: number;
  outTok: number;
  reasonTok: number;
  cost: number;
};

const { values } = parseArgs({
  options: {
    screen: { type: "string", default: "product-detail" },
    runs: { type: "string", default: "1" },
    models: { type: "string", default: `${PRIMARY},gpt-6-luna` },
    modes: { type: "string", default: MODES.join(",") },
    effort: { type: "string", default: "low" },
    "max-cost": { type: "string", default: "1" },
    "max-output": { type: "string", default: "16000" },
    "no-sol": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const screen = values.screen!;
const runs = Number(values.runs);
const maxCost = Number(values["max-cost"]);
const maxOutput = Number(values["max-output"]);
const effort = values.effort!;
const models = values.models!.split(",").map((s) => s.trim());
const modes = values.modes!.split(",").map((s) => s.trim()) as Mode[];
if (!Number.isInteger(runs) || runs < 1) fail("--runs는 1 이상의 정수여야 합니다");
if (!(maxCost > 0)) fail("--max-cost는 0보다 커야 합니다");
if (!Number.isInteger(maxOutput) || maxOutput < 1) fail("--max-output은 1 이상의 정수여야 합니다");
if (!EFFORTS.includes(effort)) fail(`--effort는 ${EFFORTS.join("|")} 중 하나여야 합니다`);
for (const m of models) if (!PRICES[m]) fail(`단가를 모르는 모델입니다: ${m} (PRICES에 추가 필요)`);
for (const m of modes) if (!MODES.includes(m)) fail(`--modes는 ${MODES.join("|")} 중에서 고르세요`);

// 픽스처 로드: spec.json = { stack, ...SpecInput 텍스트 항목 }
const dir = join("fixtures", "wireframes", screen);
if (!existsSync(join(dir, "spec.json"))) fail(`픽스처가 없습니다: ${dir}/spec.json`);
const { stack: rawStack, ...specText } = JSON.parse(readFileSync(join(dir, "spec.json"), "utf-8"));
const stack = BlueprintSchema.shape.stack.parse(rawStack);

const imageExt = Object.keys(IMAGE_EXTS).find((e) => existsSync(join(dir, `wireframe.${e}`)));
let imageUrl: string | null = null;
if (imageExt) {
  const file = join(dir, `wireframe.${imageExt}`);
  if (statSync(file).size > MAX_IMAGE_BYTES) fail(`이미지가 5MB를 넘습니다: ${file}`);
  imageUrl = `data:${IMAGE_EXTS[imageExt]};base64,${readFileSync(file).toString("base64")}`;
}
const needsImage = modes.some((m) => m !== "text");
if (needsImage && !imageUrl && !values["dry-run"]) {
  fail(`${dir}/wireframe.(png|jpg|webp)가 없어 image·both 모드를 실행할 수 없습니다. 이미지를 넣거나 --modes text 로 실행하세요.`);
}

function specFor(mode: Mode): SpecInput {
  if (mode === "text") return SpecInputSchema.parse({ ...specText, imageCount: 0 });
  if (mode === "image") return SpecInputSchema.parse({ version: "1.2", imageCount: 1 });
  return SpecInputSchema.parse({ ...specText, imageCount: 1 });
}

const schema = toStrictJsonSchema(BlueprintSchema);

// 응답 원문 저장 위치: tasks/draft-outputs/<실행시각>/<화면>-<모드>-<모델>-<회차>.json (Windows 파일명 때문에 시각의 : 와 . 는 - 로)
const startedAt = new Date();
const outDir = join("tasks", "draft-outputs", startedAt.toISOString().replace(/[:.]/g, "-"));
const outputPath = (mode: Mode, model: string, run: number) => join(outDir, `${screen}-${mode}-${model}-${run}.json`);

// 한도(프로퍼티 5000, 중첩 10단계) 확인용
function schemaStats(node: unknown, depth = 0): { props: number; depth: number } {
  if (typeof node !== "object" || node === null) return { props: 0, depth };
  const n = node as Record<string, unknown>;
  let props = 0;
  let maxDepth = depth;
  const visit = (child: unknown, d: number) => {
    const s = schemaStats(child, d);
    props += s.props;
    maxDepth = Math.max(maxDepth, s.depth);
  };
  if (typeof n.properties === "object" && n.properties) {
    props += Object.keys(n.properties).length;
    Object.values(n.properties).forEach((c) => visit(c, depth + 1));
  }
  if (n.items) visit(n.items, depth);
  if (Array.isArray(n.anyOf)) n.anyOf.forEach((c) => visit(c, depth));
  return { props, depth: maxDepth };
}

const redact = (s: string) => s.replace(/sk-[A-Za-z0-9_\-*.]{6,}/g, "sk-***");
const cost = (model: string, inTok: number, outTok: number) =>
  (inTok * PRICES[model].in + outTok * PRICES[model].out) / 1e6; // output_tokens가 reasoning_tokens를 이미 포함한다(Reasoning guide usage 예시). 추론 토큰을 따로 더하면 이중 계산

if (values["dry-run"]) {
  const stats = schemaStats(schema);
  console.log(`[dry-run] schema ${JSON.stringify(schema).length}B, object properties ${stats.props}/5000, depth ${stats.depth}/10`);
  console.log(`[dry-run] models ${models.join(", ")} / effort ${effort} / max-output ${maxOutput} / max-cost $${maxCost}`);
  for (const mode of modes) {
    const p = buildDraftPrompt({ spec: specFor(mode), stack });
    const image = mode === "text" ? "-" : imageUrl ? `${Math.round(imageUrl.length * 0.75)}B` : "(이미지 없음)";
    console.log(`[dry-run] ${mode}: instructions ${p.instructions.length}자, userText ${p.userText.length}자, image ${image}`);
  }
  console.log(`[dry-run] 응답 원문 저장 예: ${outputPath(modes[0], models[0], 1)}`);
  for (const m of models) {
    console.log(`[dry-run] ${m}: 호출당 출력 비용 상한 $${((maxOutput * PRICES[m].out) / 1e6).toFixed(4)}`);
  }
  process.exit(0);
}

if (!process.env.OPENAI_API_KEY) fail("OPENAI_API_KEY가 없습니다. `npm run test:draft`는 .env.local에서 읽습니다.");
const client = new OpenAI({ timeout: 90_000, maxRetries: 0 }); // 30초 초과 여부를 재려고 타임아웃을 넉넉히 둔다

async function runCase(model: string, mode: Mode, run: number): Promise<Row> {
  const { instructions, userText } = buildDraftPrompt({ spec: specFor(mode), stack });
  const content: OpenAI.Responses.ResponseInputContent[] = [{ type: "input_text", text: userText }];
  if (mode !== "text" && imageUrl) content.push({ type: "input_image", image_url: imageUrl, detail: "auto" });

  const row: Row = { model, mode, run, pass: false, failures: "", seconds: 0, inTok: 0, outTok: 0, reasonTok: 0, cost: 0 };
  const t0 = performance.now();
  try {
    const res = await client.responses.create({
      model,
      instructions,
      input: [{ role: "user", content }],
      reasoning: { effort: effort as OpenAI.ReasoningEffort },
      max_output_tokens: maxOutput,
      store: false,
      text: { format: { type: "json_schema", name: "blueprint", schema, strict: true } },
    });
    row.seconds = (performance.now() - t0) / 1000;
    row.inTok = res.usage?.input_tokens ?? 0;
    row.outTok = res.usage?.output_tokens ?? 0;
    row.reasonTok = res.usage?.output_tokens_details?.reasoning_tokens ?? 0;
    row.cost = cost(model, row.inTok, row.outTok);
    // 파싱·검증 전에 원문 그대로 저장한다(검증 실패·incomplete 응답 포함). 저장 실패가 실행을 막지 않게 한다
    if (res.output_text) {
      try {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(outputPath(mode, model, run), res.output_text);
      } catch (e) {
        console.warn(`경고: 응답 원문 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (row.reasonTok > row.outTok) console.warn(`경고: 추론 토큰(${row.reasonTok})이 출력 토큰(${row.outTok})보다 큽니다. 비용 계산 방식을 재검토하세요`);

    if (res.status === "incomplete") {
      row.failures = `incomplete: ${res.incomplete_details?.reason ?? "unknown"}`;
      return row;
    }
    const refusal = res.output.flatMap((o) => (o.type === "message" ? o.content : [])).find((c) => c.type === "refusal");
    if (refusal) {
      row.failures = "refusal";
      return row;
    }
    let json: unknown;
    try {
      json = JSON.parse(res.output_text);
    } catch {
      row.failures = "응답이 JSON이 아님";
      return row;
    }
    const parsed = BlueprintSchema.safeParse(stripOptionalNulls(BlueprintSchema, json));
    row.pass = parsed.success;
    if (!parsed.success) {
      row.failures = parsed.error.issues
        .slice(0, 10)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
    }
  } catch (e) {
    row.seconds = (performance.now() - t0) / 1000;
    row.failures = `API 오류: ${redact(e instanceof Error ? e.message : String(e)).slice(0, 300)}`;
  }
  return row;
}

const rows: Row[] = [];
let spent = 0;
let stoppedByBudget = false;

async function execute(model: string, mode: Mode, run: number) {
  // 호출 전에 "누적 + 이번 호출의 출력 상한"이 한도를 넘는지 본다
  if (spent + (maxOutput * PRICES[model].out) / 1e6 > maxCost) {
    stoppedByBudget = true;
    return;
  }
  const row = await runCase(model, mode, run);
  spent += row.cost;
  rows.push(row);
  console.log(`${model} ${mode} #${run}: ${row.pass ? "통과" : "실패"} ${row.seconds.toFixed(1)}s $${row.cost.toFixed(4)} (누적 $${spent.toFixed(4)})`);
}

async function runAll() {
  for (const model of models) {
    for (let run = 1; run <= runs && !stoppedByBudget; run++) {
      for (const mode of modes) {
        if (!stoppedByBudget) await execute(model, mode, run);
      }
    }
  }

  // Terra가 실패한 모드에 한해 Sol을 1회씩 실행
  if (!values["no-sol"] && !stoppedByBudget && models.includes(PRIMARY) && !models.includes(FALLBACK)) {
    const failedModes = [...new Set(rows.filter((r) => r.model === PRIMARY && !r.pass).map((r) => r.mode))];
    for (const mode of failedModes) if (!stoppedByBudget) await execute(FALLBACK, mode, 1);
  }

}

function report() {
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const table = [
    "| 화면 | 모드 | 모델 | 회차 | 스키마 통과 | 실패 필드 | 응답 시간(초) | 입력 토큰 | 출력 토큰 | 추론 토큰(출력에 포함) | 예상 비용($) | 30초 초과 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${screen} | ${r.mode} | ${r.model} | ${r.run} | ${r.pass ? "O" : "X"} | ${cell(r.failures) || "-"} | ${r.seconds.toFixed(1)} | ${r.inTok} | ${r.outTok} | ${r.reasonTok} | ${r.cost.toFixed(4)} | ${r.seconds > 30 ? "초과" : "-"} |`,
    ),
  ];
  const prices = Object.entries(PRICES)
    .map(([m, p]) => `${m} $${p.in}/$${p.out}`)
    .join(", ");
  const section = [
    `## 실행 ${startedAt.toISOString()} — ${screen}`,
    "",
    `- 응답 원문: ${outDir.replaceAll("\\", "/")}/`,
    `- 설정: effort ${effort}, max-output ${maxOutput}, runs ${runs}, 모델 ${models.join(", ")}${values["no-sol"] ? "" : ` (+${FALLBACK}은 ${PRIMARY} 실패 모드에만 1회)`}`,
    `- 단가(1M 토큰당 입력/출력, 2026-10-29 공식 문서): ${prices}. 추론 토큰은 출력 토큰으로 과금되며 \`출력 토큰\`에 이미 포함됨(공식 Reasoning guide, 합산 안 함), 캐시 할인은 반영하지 않음(보수적)`,
    `- 누적 예상 비용: $${spent.toFixed(4)} / 한도 $${maxCost}${stoppedByBudget ? " — **한도 도달로 중단**" : ""}`,
    "",
    ...table,
    "",
  ].join("\n");

  mkdirSync(dirname(RESULT_FILE), { recursive: true });
  if (!existsSync(RESULT_FILE)) appendFileSync(RESULT_FILE, "# 초안 생성 테스트 결과\n\n");
  appendFileSync(RESULT_FILE, `${section}\n`);
  console.log(`\n${section}\n기록: ${RESULT_FILE}`);
  process.exit(rows.length > 0 && rows.every((r) => r.pass) ? 0 : 1);
}

runAll()
  .then(report)
  .catch((e) => fail(redact(e instanceof Error ? e.message : String(e))));

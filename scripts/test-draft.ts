// 초안 생성 검증 스크립트 (F-004). /api/draft와 같은 lib/ai/draft-blueprint.ts를 호출한다. 사용법은 SPEC-draft-test.md, SPEC-draft-route.md 참조.
//   npm run test:draft -- --screen product-detail --runs 1
// 키는 환경변수 OPENAI_API_KEY에서만 읽는다(.env.local은 npm script의 --env-file이 로드). 키는 출력하지 않는다.
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { buildDraftPrompt, DRAFT_PROMPT_VERSION } from "../core/prompt/draft-prompt";
import { toStrictJsonSchema } from "../core/prompt/strict-json-schema";
import { BlueprintSchema } from "../core/schema/blueprint";
import { SpecInputSchema, type SpecInput } from "../core/schema/spec-input";
import {
  BUDGET_IMAGE_MS,
  BUDGET_TEXT_MS,
  draftBlueprint,
  PRICES,
  worstCaseCallCostUsd,
  type DraftImage,
  type DraftModel,
  type DraftOptions,
  type DraftProgress,
  type DraftResult,
} from "../lib/ai/draft-blueprint";

const PRIMARY: DraftModel = "gpt-6.1-terra";
const FALLBACK: DraftModel = "gpt-6.1-sol";
const MODES = ["text", "image", "both"] as const;
type Mode = (typeof MODES)[number];
const EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"];
const IMAGE_EXTS: Record<string, DraftImage["mediaType"]> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const RESULT_FILE = "tasks/draft-test-result.md";
// 결과 표는 항상 이 14열이다(열이 바뀌면 이전 섹션과 열 위치가 달라져 읽기 어려워진다)
const TABLE_COLUMNS = [
  "화면", "모드", "모델", "회차", "스키마 통과", "시도", "실패 필드", "응답 시간(초)", "입력 토큰", "출력 토큰",
  "추론 토큰(출력에 포함)", "예상 비용($)", "마감 초과", "비고",
] as const;

type Row = {
  model: DraftModel;
  mode: Mode;
  run: number;
  pass: boolean;
  failures: string;
  note: string;
  attempts: number;
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
const effort = values.effort as NonNullable<DraftOptions["effort"]>;
const modelNames = values.models!.split(",").map((s) => s.trim());
const modes = values.modes!.split(",").map((s) => s.trim()) as Mode[];
if (!Number.isInteger(runs) || runs < 1) fail("--runs는 1 이상의 정수여야 합니다");
if (!(maxCost > 0)) fail("--max-cost는 0보다 커야 합니다");
if (!Number.isInteger(maxOutput) || maxOutput < 1) fail("--max-output은 1 이상의 정수여야 합니다");
if (!EFFORTS.includes(effort as string)) fail(`--effort는 ${EFFORTS.join("|")} 중 하나여야 합니다`);
for (const m of modelNames) if (!(m in PRICES)) fail(`단가를 모르는 모델입니다: ${m} (lib/ai/draft-blueprint.ts의 PRICES에 추가 필요)`);
const models = modelNames as DraftModel[];
for (const m of modes) if (!MODES.includes(m)) fail(`--modes는 ${MODES.join("|")} 중에서 고르세요`);

// 픽스처 로드: spec.json = { stack, route?, imageOriginalWidth?, ...SpecInput 텍스트 항목 }
const dir = join("fixtures", "wireframes", screen);
if (!existsSync(join(dir, "spec.json"))) fail(`픽스처가 없습니다: ${dir}/spec.json`);
const { stack: rawStack, route: rawRoute, imageOriginalWidth, ...specText } = JSON.parse(readFileSync(join(dir, "spec.json"), "utf-8"));
const stack = BlueprintSchema.shape.stack.parse(rawStack);
const route: string | null = typeof rawRoute === "string" ? rawRoute : null;

const imageExt = Object.keys(IMAGE_EXTS).find((e) => existsSync(join(dir, `wireframe.${e}`)));
let image: DraftImage | null = null;
if (imageExt) {
  const file = join(dir, `wireframe.${imageExt}`);
  if (statSync(file).size > MAX_IMAGE_BYTES) fail(`이미지가 5MB를 넘습니다: ${file}`);
  image = {
    mediaType: IMAGE_EXTS[imageExt],
    base64: readFileSync(file).toString("base64"),
    ...(typeof imageOriginalWidth === "number" ? { originalWidth: imageOriginalWidth } : {}),
  };
}
const needsImage = modes.some((m) => m !== "text");
if (needsImage && !image && !values["dry-run"]) {
  fail(`${dir}/wireframe.(png|jpg|webp)가 없어 image·both 모드를 실행할 수 없습니다. 이미지를 넣거나 --modes text 로 실행하세요.`);
}

function specFor(mode: Mode): SpecInput {
  if (mode === "text") return SpecInputSchema.parse({ ...specText, imageCount: 0 });
  if (mode === "image") return SpecInputSchema.parse({ version: "1.2", imageCount: 1 });
  return SpecInputSchema.parse({ ...specText, imageCount: 1 });
}
const imagesFor = (mode: Mode): DraftImage[] => (mode !== "text" && image ? [image] : []);
const budgetSec = (mode: Mode) => (mode === "text" ? BUDGET_TEXT_MS : BUDGET_IMAGE_MS) / 1000;

// 응답 원문 저장 위치: tasks/draft-outputs/<실행시각>/<화면>-<모드>-<모델>-<회차>.json, 재시도 응답은 -retry 접미사 (Windows 파일명 때문에 시각의 : 와 . 는 - 로)
const startedAt = new Date();
const outDir = join("tasks", "draft-outputs", startedAt.toISOString().replace(/[:.]/g, "-"));
const outputPath = (mode: Mode, model: string, run: number, attempt = 0) =>
  join(outDir, `${screen}-${mode}-${model}-${run}${attempt > 0 ? "-retry" : ""}.json`);

const normalizedPath = (mode: Mode, model: string, run: number) => join(outDir, `${screen}-${mode}-${model}-${run}-normalized.json`);

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
// 재시도가 일어날 수 있으므로 한 케이스의 최악 비용은 호출당 출력 상한 × 2로 본다
const worstCaseCaseCost = (model: DraftModel) => 2 * worstCaseCallCostUsd(model, maxOutput);

if (values["dry-run"]) {
  const stats = schemaStats(toStrictJsonSchema(BlueprintSchema));
  console.log(`[dry-run] prompt ${DRAFT_PROMPT_VERSION}, schema object properties ${stats.props}/5000, depth ${stats.depth}/10`);
  console.log(`[dry-run] models ${models.join(", ")} / effort ${effort} / max-output ${maxOutput} / max-cost $${maxCost}`);
  for (const mode of modes) {
    const p = buildDraftPrompt({ spec: specFor(mode), stack, route, images: imagesFor(mode) });
    const img = mode === "text" ? "-" : image ? `${Math.round((image.base64.length * 3) / 4)}B` : "(이미지 없음)";
    console.log(`[dry-run] ${mode}: instructions ${p.instructions.length}자, userText ${p.userText.length}자, image ${img}, 마감 ${budgetSec(mode)}초`);
  }
  console.log(`[dry-run] 응답 원문 저장 예: ${outputPath(modes[0], models[0], 1)}`);
  for (const m of models) console.log(`[dry-run] ${m}: 한 케이스 출력 비용 상한(재시도 포함) $${worstCaseCaseCost(m).toFixed(4)}`);
  process.exit(0);
}

if (!process.env.OPENAI_API_KEY) fail("OPENAI_API_KEY가 없습니다. `npm run test:draft`는 .env.local에서 읽습니다.");

function describeFailure(r: Extract<DraftResult, { ok: false }>): string {
  const fields = r.fields?.map((f) => `${f.path}: ${f.message}`).join("; ");
  if (r.kind === "invalid_output") return fields ?? "invalid_output";
  const detail = [r.upstreamStatus, r.errorName].filter(Boolean).join(" ");
  return `${r.kind}${detail ? ` (${detail})` : ""}${fields ? ` / 첫 시도 실패: ${fields}` : ""}`;
}

// /api/draft 스트림이 보내는 단계와 같은 이름·순서(draftBlueprint의 onProgress)를 터미널에 보여 준다
function describeStage(e: DraftProgress): string {
  switch (e.stage) {
    case "generating": return `AI 생성 중 (시도 ${e.attempt})`;
    case "validating": return `검증 중 (시도 ${e.attempt})`;
    case "normalizing": return `자동 보정 ${e.changes}건`;
    case "regenerating": return `다시 생성 중 (시도 ${e.attempt})`;
  }
}

async function runCase(model: DraftModel, mode: Mode, run: number): Promise<Row> {
  const row: Row = { model, mode, run, pass: false, failures: "", note: "", attempts: 0, seconds: 0, inTok: 0, outTok: 0, reasonTok: 0, cost: 0 };
  const t0 = Date.now();
  try {
    const result = await draftBlueprint(
      { spec: specFor(mode), stack, route, images: imagesFor(mode) },
      { model, effort, maxOutputTokens: maxOutput, onProgress: (e) => console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}초] ${describeStage(e)}`) },
    );
    row.pass = result.ok;
    row.attempts = result.attempts;
    row.seconds = result.elapsedMs / 1000;
    row.inTok = result.usage.inputTokens;
    row.outTok = result.usage.outputTokens;
    row.reasonTok = result.usage.reasoningTokens;
    row.cost = result.costUsd;
    const notes: string[] = [];
    if (!result.ok) {
      row.failures = describeFailure(result);
      if (result.retrySkipped) notes.push("남은 시간 부족으로 재시도 생략");
    } else if (result.attempts > 1) {
      notes.push("재시도 후 통과");
    }
    if (result.normalized.length > 0) notes.push(`자동 보정 ${result.normalized.length}건`);
    row.note = notes.join(", ");
    if (row.reasonTok > row.outTok) console.warn(`경고: 추론 토큰(${row.reasonTok})이 출력 토큰(${row.outTok})보다 큽니다. 비용 계산 방식을 재검토하세요`);
    // 응답 원문은 파싱·검증 전 그대로 저장한다(검증 실패·incomplete 응답 포함). 저장 실패가 실행을 막지 않게 한다
    result.log.forEach((entry, i) => {
      if (!entry.rawText) return;
      try {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(outputPath(mode, model, run, i), entry.rawText);
      } catch (e) {
        console.warn(`경고: 응답 원문 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    if (result.normalized.length > 0) {
      try {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(normalizedPath(mode, model, run), JSON.stringify(result.normalized, null, 2));
      } catch (e) {
        console.warn(`경고: 보정 내역 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    row.failures = `예외: ${redact(e instanceof Error ? e.message : String(e)).slice(0, 300)}`;
  }
  return row;
}

const rows: Row[] = [];
let spent = 0;
let stoppedByBudget = false;

async function execute(model: DraftModel, mode: Mode, run: number) {
  // 호출 전에 "누적 + 이번 케이스의 최악 출력 비용"이 한도를 넘는지 본다
  if (spent + worstCaseCaseCost(model) > maxCost) {
    stoppedByBudget = true;
    return;
  }
  const row = await runCase(model, mode, run);
  spent += row.cost;
  rows.push(row);
  console.log(
    `${model} ${mode} #${run}: ${row.pass ? "통과" : "실패"} 시도 ${row.attempts} ${row.seconds.toFixed(1)}s $${row.cost.toFixed(4)} (누적 $${spent.toFixed(4)})`,
  );
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
    `| ${TABLE_COLUMNS.join(" | ")} |`,
    `| ${TABLE_COLUMNS.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => {
      const cells = [
        screen,
        r.mode,
        r.model,
        r.run,
        r.pass ? "O" : "X",
        r.attempts,
        cell(r.failures) || "-",
        r.seconds.toFixed(1),
        r.inTok,
        r.outTok,
        r.reasonTok,
        r.cost.toFixed(4),
        r.seconds > budgetSec(r.mode) ? "초과" : "-",
        cell(r.note) || "-",
      ];
      if (cells.length !== TABLE_COLUMNS.length) throw new Error("결과 표의 열 수가 맞지 않습니다");
      return `| ${cells.join(" | ")} |`;
    }),
  ];
  const prices = Object.entries(PRICES)
    .map(([m, p]) => `${m} $${p.in}/$${p.out}`)
    .join(", ");
  const section = [
    `## 실행 ${startedAt.toISOString()} — ${screen} (프롬프트 ${DRAFT_PROMPT_VERSION}, lib/ai/draft-blueprint.ts 경유)`,
    "",
    `- 응답 원문: ${outDir.replaceAll("\\", "/")}/ (재시도 응답은 -retry 접미사)`,
    `- 설정: effort ${effort}, max-output ${maxOutput}, runs ${runs}, 모델 ${models.join(", ")}${values["no-sol"] ? "" : ` (+${FALLBACK}은 ${PRIMARY} 실패 모드에만 1회)`}`,
    `- 마감(재시도 포함 전체): 텍스트만 ${BUDGET_TEXT_MS / 1000}초, 이미지 포함 ${BUDGET_IMAGE_MS / 1000}초. 검증 실패 시 1회 재시도, 남은 시간이 max(첫 시도 시간, 15초) 미만이면 생략`,
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

// 구현 검사 변이 실험 러너.
//   npm run verify:mutation                 # 전체(3a·3b·3c 코드 변이 + 중립 변이)
//   npm run verify:mutation -- --stage 3c   # 한 단계만(3a | 3b | 3c | neutral)
//   npm run verify:mutation -- --only C02,E01   # 변이 번호만
// 원본 소스는 건드리지 않는다: core·fixtures를 임시 폴더로 복사하고, 변이는 그 복사본에서만 적용한 뒤 테스트를 돌린다.
// 코드 변이는 테스트가 실패해야 "잡힘", 모두 통과하면 "살아남음"이다. 중립 변이(입력만 바꿈)는 검사 결과가 같아야 한다.
// 결과는 tasks/mutation-result-implementation-check.md에 쓴다. 살아남은 변이가 있으면 종료 코드 1.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MUTATIONS, type Mutation } from "./mutation/mutations";
import { runNeutral } from "./mutation/neutral";

const ROOT = process.cwd();
const REPORT = "tasks/mutation-result-implementation-check.md";
const TEST_DIRS = ["core/impl-check", "core/code-model"];
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const stageArg = arg("--stage");
const only = arg("--only")?.split(",");

type Outcome = { id: string; status: "잡힘" | "살아남음" | "적용 실패" | "기준 실패"; failed: string[]; failedCount: number; note?: string };

const work = mkdtempSync(join(tmpdir(), "mutation-"));
// 대상 테스트가 가져오는 것까지 복사한다: 채점·시연 스크립트(scripts), 저장소·폴더 읽기와 시험용 tar(lib/code-source), 채점 문구(components/implementation-check/result-view)
for (const p of ["core", "fixtures", "scripts", "lib/code-source", "components/implementation-check"]) cpSync(join(ROOT, p), join(work, p), { recursive: true });
for (const p of ["package.json", "tsconfig.json", "vitest.config.mts"]) cpSync(join(ROOT, p), join(work, p));
symlinkSync(join(ROOT, "node_modules"), join(work, "node_modules"), "junction");

/** 복사본에서 테스트를 돌려 실패한 테스트 이름을 돌려준다 */
function runTests(): { failed: string[]; fileErrors: string[]; total: number } {
  const out = join(work, "result.json");
  rmSync(out, { force: true });
  spawnSync(process.execPath, [join(ROOT, "node_modules/vitest/vitest.mjs"), "run", ...TEST_DIRS, "--reporter=json", `--outputFile=${out}`], { cwd: work, encoding: "utf8", timeout: 300_000 });
  if (!existsSync(out)) return { failed: [], fileErrors: ["테스트 결과 파일이 없음"], total: 0 };
  const json = JSON.parse(readFileSync(out, "utf8")) as { numTotalTests: number; testResults: { name: string; status: string; message?: string; assertionResults: { status: string; fullName: string }[] }[] };
  const failed = json.testResults.flatMap((f) => f.assertionResults.filter((a) => a.status === "failed").map((a) => `${f.name.slice(work.length + 1).replaceAll("\\", "/")} › ${a.fullName}`));
  const fileErrors = json.testResults.filter((f) => f.status === "failed" && !f.assertionResults.some((a) => a.status === "failed")).map((f) => `${f.name.slice(work.length + 1).replaceAll("\\", "/")}: ${(f.message ?? "").split("\n")[0]}`);
  return { failed, fileErrors, total: json.numTotalTests };
}

function runMutation(mu: Mutation): Outcome {
  const path = join(work, mu.file);
  const original = readFileSync(path, "utf8");
  const normalized = original.replaceAll("\r\n", "\n");
  let text = normalized;
  for (const e of mu.edits) {
    const count = text.split(e.find).length - 1;
    if (count !== 1) return { id: mu.id, status: "적용 실패", failed: [], failedCount: 0, note: `바꿀 문장이 ${count}번 나옴(정확히 1번이어야 함): ${e.find.slice(0, 60)}` };
    text = text.replace(e.find, () => e.replace);
  }
  writeFileSync(path, text);
  try {
    const r = runTests();
    const failed = [...r.failed, ...r.fileErrors.map((x) => `(파일 오류) ${x}`)];
    return { id: mu.id, status: failed.length ? "잡힘" : "살아남음", failed, failedCount: failed.length, note: r.fileErrors.length && !r.failed.length ? "테스트가 아니라 파일 불러오기에서 실패(변이 문장 오류일 수 있음)" : undefined };
  } finally {
    writeFileSync(path, original);
  }
}

const selected = MUTATIONS.filter((x) => (!stageArg || stageArg === x.stage) && (!only || only.includes(x.id)));
const results: { mu: Mutation; out: Outcome }[] = [];
let baselineOk = true;
try {
  const base = runTests();
  baselineOk = base.failed.length === 0 && base.fileErrors.length === 0 && base.total > 0;
  console.log(`기준(변이 없음): 테스트 ${base.total}개 중 실패 ${base.failed.length}개 · 불러오지 못한 테스트 파일 ${base.fileErrors.length}개${baselineOk ? "" : " — 기준이 통과해야 변이 결과를 믿을 수 있어 중단합니다"}`);
  for (const e of base.fileErrors) console.log(`  불러오기 실패: ${e}`);
  if (!baselineOk) {
    console.log([...base.failed, ...base.fileErrors].join("\n"));
    process.exitCode = 1;
  } else {
    for (const mu of selected) {
      const out = runMutation(mu);
      results.push({ mu, out });
      console.log(`${mu.id} [${mu.stage}] ${out.status}${out.failedCount ? ` (실패 ${out.failedCount}개)` : ""}${out.note ? ` — ${out.note}` : ""}`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

const wantNeutral = !stageArg || stageArg === "neutral";
const neutral = baselineOk && wantNeutral && !only ? runNeutral() : [];
for (const n of neutral) console.log(`${n.id} ${n.name}: ${n.same ? "결과 같음" : "결과가 달라짐"} (사례 ${n.cases}개, 바뀐 파일 ${n.changedFiles}개)${n.diff ? ` — ${n.diff}` : ""}`);

const survived = results.filter((r) => r.out.status !== "잡힘" && !(r.mu.equivalent && r.out.status === "살아남음"));
const neutralBad = neutral.filter((n) => !n.same);
const equivalent = results.filter((r) => r.mu.equivalent && r.out.status === "살아남음").length;
const summaryLine = `요약: 코드 변이 ${results.length}개 중 잡힘 ${results.filter((r) => r.out.status === "잡힘").length}, 동등 변이 ${equivalent}, 살아남음·적용 실패 ${survived.length}${survived.length ? ` (${survived.map((r) => r.mu.id).join(", ")})` : ""} · 중립 변이 ${neutral.length}개 중 결과가 달라진 것 ${neutralBad.length}${neutralBad.length ? ` (${neutralBad.map((n) => n.id).join(", ")})` : ""}`;

if (baselineOk && !stageArg && !only) {
  const lines: string[] = ["# 구현 검사 변이 실험 결과", "", "`npm run verify:mutation`이 만든다(원본 소스는 건드리지 않고 임시 복사본에서 변이를 적용). 손으로 고치지 않는다.", "", summaryLine, ""];
  for (const stage of ["3a", "3b", "3c"] as const) {
    const rows = results.filter((r) => r.mu.stage === stage);
    lines.push(`## ${stage}: ${{ "3a": "설계 노드와 코드의 짝짓기 판정", "3b": "구현 규칙 및 결과 집계 판정", "3c": "핵심 규칙 및 근거 원칙 판정" }[stage]}`, "", "| 번호 | 규칙 | 잘못된 판정 | 결과 | 실패한 테스트 수 | 처음 실패한 테스트 |", "| --- | --- | --- | --- | --- | --- |");
    for (const { mu, out } of rows) lines.push(`| ${mu.id} | ${mu.rule} | ${mu.wrong} | ${out.status === "살아남음" && mu.equivalent ? "동등 변이" : out.status} | ${out.failedCount} | ${out.failed[0]?.replaceAll("|", "\\|") ?? out.note ?? "-"} |`);
    lines.push("");
  }
  const eq = results.filter((r) => r.mu.equivalent && r.out.status === "살아남음");
  if (eq.length) {
    lines.push("## 동등 변이(바꿔도 동작이 같아 테스트가 잡을 수 없음)와 근거", "");
    for (const { mu } of eq) lines.push(`- **${mu.id}** (${mu.rule}): ${mu.equivalent}`);
    lines.push("");
  }
  lines.push("## 중립 변이(입력만 바꿔 결과가 같아야 함)", "", "| 번호 | 바꾼 것 | 결과 | 사례 수 | 바뀐 파일 수 | 처음 다른 곳 |", "| --- | --- | --- | --- | --- | --- |");
  for (const n of neutral) lines.push(`| ${n.id} | ${n.name} | ${n.same ? "같음" : "달라짐"} | ${n.cases} | ${n.changedFiles} | ${n.diff ?? "-"} |`);
  lines.push("");
  writeFileSync(REPORT, lines.join("\n"));
  console.log(`결과를 ${REPORT}에 썼습니다.`);
}

console.log(`\n${summaryLine}`);
if (survived.length || neutralBad.length) process.exitCode = 1;

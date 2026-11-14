// 디자인 시스템 정리 회귀 확인: 정리 분석(core/cleanup)의 결과가 저장소에 둔 기준 스냅샷과 같은지 비교한다.
//   npm run verify:regression              # 비교(같으면 종료 코드 0, 다르면 1과 처음 달라진 위치)
//   npm run verify:regression -- --update  # 기준 스냅샷을 지금 결과로 다시 만든다(결과가 의도적으로 바뀐 경우에만, 사용자 승인 뒤)
// 입력은 fixtures/demo-cleanup(일부러 문제를 넣은 디자인 시스템·앱)이다. 세 가지 입력 방식을 모두 돌린다:
//   files  = 디자인 시스템 폴더를 올린 경우
//   json   = 붙여넣은 스펙 JSON(fixtures/demo-cleanup/design-system.json)인 경우
//   sample = 샘플 디자인 시스템 스펙(core/schema/sample-design-system.json)인 경우
// 기준 스냅샷: fixtures/regression/cleanup-demo.snapshot.json. AI 호출·DB·네트워크를 쓰지 않는다.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { analyzeCode } from "../core/cleanup/analyze";
import { summarizeUpload } from "../core/cleanup/upload-summary";

const SNAPSHOT = "fixtures/regression/cleanup-demo.snapshot.json";
const DEMO = "fixtures/demo-cleanup";
const SAMPLE_SPEC = "core/schema/sample-design-system.json";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(`${dir}/${n}`).isDirectory() ? walk(`${dir}/${n}`) : [`${dir}/${n}`]));

/** 화면에서 폴더를 올린 것과 같게 만든다: 경로는 선택한 폴더 이름부터, 거르기·상한 검사를 거친다 */
function upload(folder: string) {
  const entries = walk(`${DEMO}/${folder}`).map((p) => ({ path: p.slice(DEMO.length + 1), size: statSync(p).size, abs: p }));
  const summary = summarizeUpload(entries, new Set());
  if (summary.problems.length) throw new Error(`${folder} 업로드 상한 문제: ${JSON.stringify(summary.problems)}`);
  return summary.selected.map((e) => ({ path: e.path, content: readFileSync(e.abs, "utf-8") }));
}

function compute() {
  const code = upload("app");
  return {
    files: analyzeCode({ code, designSystem: { kind: "files", files: upload("design-system") } }),
    json: analyzeCode({ code, designSystem: { kind: "json", text: readFileSync(`${DEMO}/design-system.json`, "utf-8") } }),
    sample: analyzeCode({ code, designSystem: { kind: "json", text: readFileSync(SAMPLE_SPEC, "utf-8") } }),
  };
}

/** 두 값을 깊이 비교해 처음 다른 위치를 돌려준다. 같으면 null */
function firstDiff(a: unknown, b: unknown, path = "$"): string | null {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of keys) {
      const d = firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`);
      if (d) return d;
    }
  }
  return `${path}: 기준 ${JSON.stringify(b)?.slice(0, 120)} ← 지금 ${JSON.stringify(a)?.slice(0, 120)}`;
}

const text = (v: unknown) => `${JSON.stringify(v, null, 1)}\n`;
const now = compute();

if (process.argv.includes("--update")) {
  mkdirSync(dirname(SNAPSHOT), { recursive: true });
  writeFileSync(SNAPSHOT, text(now));
  console.log(`기준 스냅샷을 새로 썼습니다: ${SNAPSHOT}`);
  process.exit(0);
}

if (!existsSync(SNAPSHOT)) {
  console.error(`기준 스냅샷이 없습니다: ${SNAPSHOT} (처음에는 --update로 만든다)`);
  process.exit(1);
}
const base = JSON.parse(readFileSync(SNAPSHOT, "utf-8")) as unknown;
const diff = firstDiff(JSON.parse(text(now)), base);
if (diff) {
  console.error(`회귀 확인 실패: 정리 결과가 기준 스냅샷과 다릅니다.\n  처음 다른 위치 ${diff}`);
  process.exit(1);
}
const counts = Object.entries(now).map(([k, v]) => `${k}: ${v.ok ? `찾은 항목 ${v.result.findings.length}건` : "분석 실패 응답"}`);
console.log(`회귀 확인 통과: 정리 결과가 기준 스냅샷과 같습니다 (${counts.join(" · ")})`);

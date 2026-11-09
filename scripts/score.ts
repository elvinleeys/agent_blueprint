// 구현 검사 채점(화면 없이, 지시서 효과 측정용). AI를 부르지 않고 DB도 쓰지 않는다. 사용법은 docs/score.md
//   npm run score -- --blueprint <설계도 JSON> --code <코드 폴더> [--tsconfig <파일>] [--json] [--all] [--max-files N] [--max-file-kb N] [--max-total-mb N]
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { LOCAL_LIMITS, scoreImplementation, scoreJson, scoreText } from "../core/impl-check/score";
import { BlueprintSchema } from "../core/schema/blueprint";
import { readLocalFolder } from "../lib/score/read-local";

export type ScoreRun = { code: 0 | 1; out: string; err: string };

const USAGE = "사용법: npm run score -- --blueprint <설계도 JSON 파일> --code <코드 폴더> [--tsconfig <파일>] [--json] [--all] [--max-files N] [--max-file-kb N] [--max-total-mb N]";
const fail = (err: string): ScoreRun => ({ code: 1, out: "", err });

function positive(name: string, raw: string | undefined, fallback: number): number | string {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : `--${name}는 0보다 큰 숫자여야 합니다.`;
}

/** 인자를 받아 채점한다(테스트하기 쉽게 출력을 돌려준다). 채점이 끝나면 위반이 있어도 0, 입력 오류·상한 초과는 1 */
export function runScore(argv: string[]): ScoreRun {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        blueprint: { type: "string" },
        code: { type: "string" },
        tsconfig: { type: "string" },
        json: { type: "boolean", default: false },
        all: { type: "boolean", default: false },
        "max-files": { type: "string" },
        "max-file-kb": { type: "string" },
        "max-total-mb": { type: "string" },
      },
    }));
  } catch (e) {
    return fail(`${e instanceof Error ? e.message : "인자를 읽지 못했습니다."}\n${USAGE}`);
  }
  if (!values.blueprint || !values.code) return fail(USAGE);
  if (!existsSync(values.blueprint)) return fail(`설계도 파일이 없습니다: ${values.blueprint}`);
  if (!existsSync(values.code) || !statSync(values.code).isDirectory()) return fail(`코드 폴더가 없습니다: ${values.code}`);
  if (values.tsconfig && !existsSync(values.tsconfig)) return fail(`tsconfig 파일이 없습니다: ${values.tsconfig}`);

  const maxFiles = positive("max-files", values["max-files"], LOCAL_LIMITS.maxFiles);
  const fileKb = positive("max-file-kb", values["max-file-kb"], LOCAL_LIMITS.maxFileBytes / 1024);
  const totalMb = positive("max-total-mb", values["max-total-mb"], LOCAL_LIMITS.maxTotalBytes / (1024 * 1024));
  for (const v of [maxFiles, fileKb, totalMb]) if (typeof v === "string") return fail(v);
  const limits = { maxFiles: maxFiles as number, maxFileBytes: (fileKb as number) * 1024, maxTotalBytes: (totalMb as number) * 1024 * 1024 };

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(values.blueprint, "utf8"));
  } catch {
    return fail(`설계도 파일이 JSON이 아닙니다: ${values.blueprint}`);
  }
  const parsed = BlueprintSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `  - ${i.path.join(".") || "(전체)"}: ${i.message}`);
    return fail(`설계도 형식이 올바르지 않습니다.\n${issues.join("\n")}`);
  }

  const files = readLocalFolder(values.code, values.tsconfig);
  const outcome = scoreImplementation(parsed.data, files, values.all ? "all" : "blueprint-locations", limits);
  if (!outcome.ok) return fail(outcome.message);
  const out = values.json ? `${scoreJson(outcome.report, values.blueprint, values.code)}\n` : scoreText(outcome.report, basename(resolve(values.code)));
  return { code: 0, out, err: "" };
}

if (process.argv[1]?.endsWith("score.ts")) {
  const r = runScore(process.argv.slice(2));
  if (r.out) process.stdout.write(r.out);
  if (r.err) console.error(r.err);
  process.exit(r.code);
}

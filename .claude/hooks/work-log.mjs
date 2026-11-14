// PostToolUse(Edit|Write) 훅: 파일을 저장한 뒤 작업 일지에 한 줄을 덧붙인다. 아무것도 막지 않는다(항상 종료 코드 0).
// 한 줄: 날짜 시각 | 도구 | 프로젝트 기준 상대 경로 | git 브랜치
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const pad = (n) => String(n).padStart(2, "0");
const now = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// git 명령을 실행하지 않고 .git/HEAD만 읽는다(빠르고 실패해도 안전). 브랜치가 아니면 짧은 커밋 번호
const branchOf = (root) => {
  try {
    const head = readFileSync(join(root, ".git", "HEAD"), "utf8").trim();
    return head.startsWith("ref: refs/heads/") ? head.slice("ref: refs/heads/".length) : head.slice(0, 7);
  } catch {
    return "-";
  }
};

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
    const file = input.tool_input?.file_path;
    if (typeof file !== "string") return;
    const abs = isAbsolute(file) ? file : resolve(root, file);
    const rel = relative(root, abs).split("\\").join("/"); // 프로젝트 밖 파일이면 ../ 로 시작해 그대로 드러난다
    const line = `${now()} | ${input.tool_name ?? "?"} | ${rel} | ${branchOf(root)}\n`;
    const log = join(root, ".claude", "logs", "work-log.txt");
    mkdirSync(dirname(log), { recursive: true });
    appendFileSync(log, line, "utf8"); // 덧붙이기만. 기존 내용은 건드리지 않는다
  } catch {
    // 일지를 못 써도 조용히 넘어간다
  }
});

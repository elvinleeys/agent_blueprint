import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// guard.mjs 훅을 실제 훅처럼(표준 입력 JSON) 실행해 막는지(종료 코드 2) 통과하는지(0) 본다.
// .env 규칙: .env.example 한 파일만 읽기·편집·git add를 허용하고, 그 밖의 .env 파일은 읽기·쓰기 모두 막는다.

const ROOT = resolve(".");
const HOOK = resolve(".claude/hooks/guard.mjs");

function run(tool, input) {
  const r = spawnSync("node", [HOOK], { input: JSON.stringify({ tool_name: tool, tool_input: input, cwd: ROOT }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT } });
  return { code: r.status, err: r.stderr };
}
const bash = (command) => run("Bash", { command });
const at = (p) => resolve(ROOT, p);

describe(".env 파일: 막아야 하는 것", () => {
  it.each([
    ["Read", { file_path: at(".env.local") }],
    ["Read", { file_path: at(".env") }],
    ["Read", { file_path: at(".env.production.local") }],
    ["Grep", { pattern: "KEY", path: at(".env.local") }],
    ["Grep", { pattern: "KEY", glob: ".env*" }],
    ["Edit", { file_path: at(".env.local"), old_string: "a", new_string: "b" }],
    ["Write", { file_path: at(".env.local"), content: "x" }],
    ["Write", { file_path: at(".env"), content: "x" }],
  ])("%s %j", (tool, input) => {
    const r = run(tool, input);
    expect(r.code).toBe(2);
    expect(r.err).toContain("2-env-수정");
  });

  it.each([
    "git add .env.local",
    "git add -f .env.local",
    "git add src/a.ts .env.local",
    "cat .env",
    "cat .env.local",
    "type .env",
    "head -5 ./.env.local",
    "grep KEY .env.local",
    "cat .env*",
    "less .env.development.local",
    'node -e "console.log(require(\'fs\').readFileSync(\'.env.local\',\'utf8\'))"',
    "echo X=1 >> .env.local",
    "cp .env.example .env.local",
  ])("Bash: %s", (command) => {
    expect(bash(command)).toMatchObject({ code: 2, err: expect.stringContaining("2-env-수정") });
  });

  it("PowerShell: Get-Content .env.local", () => {
    expect(run("PowerShell", { command: "Get-Content .env.local" }).code).toBe(2);
  });
});

describe(".env.example: 허용", () => {
  it.each([
    ["Read", { file_path: at(".env.example") }],
    ["Edit", { file_path: at(".env.example"), old_string: "a", new_string: "b" }],
    ["Write", { file_path: at(".env.example"), content: "X=" }],
  ])("%s %j", (tool, input) => {
    expect(run(tool, input).code).toBe(0);
  });

  it.each([
    "git add .env.example",
    "git diff .env.example",
    "git add core/a.ts .env.example docs/deploy-checklist.md",
    // 커밋 메시지의 ".env.example·deploy-checklist·CLAUDE.md"가 한 단어로 붙어 막혔던 명령(2026-11-14)
    'git add .env.example CLAUDE.md && git commit -q -m "feat: x\n\n- .env.example·deploy-checklist·CLAUDE.md 설명" && git log --oneline -1',
  ])("Bash: %s", (command) => {
    expect(bash(command).code).toBe(0);
  });

  it(".env가 들어간 다른 단어(process.env, 파일 이름 일부)는 막지 않는다", () => {
    expect(bash('node -e "console.log(process.env.HOME)"').code).toBe(0);
    expect(bash("grep -n env .gitignore").code).toBe(0);
  });
});

describe(".gitignore", () => {
  const ignored = (p) => spawnSync("git", ["check-ignore", "-q", p], { cwd: ROOT }).status === 0;

  it(".env.local·.env는 무시되고 .env.example은 추적된다", () => {
    expect(ignored(".env.local")).toBe(true);
    expect(ignored(".env")).toBe(true);
    expect(ignored(".env.production.local")).toBe(true);
    expect(ignored(".env.example")).toBe(false);
    expect(readFileSync(".gitignore", "utf8")).toMatch(/^\.env\*$/m);
  });
});

describe("다른 규칙은 그대로", () => {
  it("docs/prompts.md git add는 막는다", () => {
    expect(bash("git add docs/prompts.md").code).toBe(2);
  });
});

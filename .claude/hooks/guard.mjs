// PreToolUse(Bash|PowerShell|Write|Edit|Read|Grep) 훅: 이 프로젝트에서 문제가 됐던 행동을 실행 전에 막거나(종료 코드 2) 사용자에게 묻는다(JSON + 종료 코드 0).
// Read·Grep은 .env 파일 규칙만 본다. 훅 자신이 고장 나면 막지 않고 통과시킨다(종료 코드 0). 시험: .claude/hooks/guard.test.mjs
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const slash = (p) => p.split("\\").join("/");
const pad = (n) => String(n).padStart(2, "0");
const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// ── 규칙에 쓰는 도우미 ─────────────────────────────────────────────
const branchOf = (root) => {
  try {
    const head = readFileSync(join(root, ".git", "HEAD"), "utf8").trim();
    return head.startsWith("ref: refs/heads/") ? head.slice("ref: refs/heads/".length) : "";
  } catch {
    return ""; // 알 수 없으면 main이라고 단정하지 않는다
  }
};

const isTracked = (root, rel) => {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", rel], { cwd: root, stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

// 셸 명령을 문장(; && || |)으로 나누고, 각 문장을 단어로 쪼갠다(따옴표 제거). 완벽한 셸 해석이 아니라 "글자 보고 추측"이다
const statements = (cmd) =>
  cmd
    .split(/&&|\|\||;|\||\n/)
    .map((s) => s.trim().split(/\s+/).map((t) => t.replace(/^["'`]+|["'`]+$/g, "")).filter(Boolean))
    .filter((t) => t.length);

// git 하위 명령 찾기: `git -C dir commit -m x` → { sub: "commit", args: ["-m","x"] }
const gitCommand = (tokens) => {
  if (tokens[0] !== "git") return null;
  let i = 1;
  while (i < tokens.length && tokens[i].startsWith("-")) i += /^(-C|-c|--git-dir|--work-tree|--namespace)$/.test(tokens[i]) ? 2 : 1;
  return i < tokens.length ? { sub: tokens[i], args: tokens.slice(i + 1) } : null;
};

// 파일에 쓰는 명령처럼 보이는가(리다이렉트, sed -i, tee, mv, cp, rm …). 읽기 명령(cat, grep, git add)은 해당하지 않는다
const WRITES = /(^|[^<>0-9&])>{1,2}|\bsed\s+(-\w*i|--in-place)|\btee\b|\b(mv|cp|rm|truncate|dd)\b|\bperl\s+-\w*i/;
// 경로에 쓰이지 않는 글자(공백·따옴표·한글·가운뎃점 등)에서 끊는다. 커밋 메시지의 ".env.example·문서.md"가 한 단어로 붙어 오판한 적이 있다
const words = (cmd) => cmd.split(/[^A-Za-z0-9_./\\:@~+*?-]+/).filter(Boolean).map(slash);

// ── 규칙 ───────────────────────────────────────────────────────────
// 각 규칙은 걸리면 { id, action: "block"|"ask", target, why, instead }를 돌려준다.
// target은 일지에 남기는 값이라 명령 전체가 아니라 파일 이름·브랜치만 적는다(비밀값이 일지에 남지 않게)
// .env로 시작하는 파일은 모두 비밀 파일로 본다(.env, .env.local, .env.production.local, .env* 같은 글롭 포함). 예외는 이름만 적는 .env.example 하나
const ENV_FILE = (name) => name.startsWith(".env") && name !== ".env.example";
const MIGRATION = /^supabase\/migrations\/[^/]+$/;
const EXPECTED = /^fixtures\/.+\/expected\.(json|md)$/;

const MIGRATION_RULE = (target) => ({
  id: "1-적용한-마이그레이션-수정",
  action: "block",
  target,
  why: "이미 만든 마이그레이션 파일은 DB에 적용됐을 수 있습니다(적용은 대시보드에서 직접 하고 기록이 없습니다). 고치면 파일과 실제 DB가 서로 어긋납니다.",
  instead: "바뀐 내용을 담은 새 .sql 파일을 번호를 이어 새로 만들고, docs/db-migration.md 절차대로 적용하세요.",
});
const ENV_RULE = (target) => ({
  id: "2-env-수정",
  action: "block",
  target,
  why: ".env 파일에는 비밀 키가 들어 있습니다. 읽거나 쓰면 키가 노출되거나 개발 환경이 깨집니다(.env.example만 읽기·편집·git add 가능).",
  instead: "새 변수가 필요하면 .env.example에 이름만 추가하고, 값은 사용자가 직접 .env.local에 넣도록 안내하세요.",
});
const EXPECTED_RULE = (target) => ({
  id: "6-기대결과-수정",
  action: "ask",
  target,
  why: "기대 결과 표(expected)는 코드가 맞는지 재는 기준입니다. 테스트를 통과시키려고 기준을 고치면 검사가 의미 없어집니다.",
  instead: "사용자가 이 기대 결과 변경을 승인했다면 허용하세요. 아니라면 코드를 고치세요.",
});

function fileRules({ rel, abs }) {
  const lower = rel.toLowerCase();
  const name = lower.split("/").pop();
  const out = [];
  if (MIGRATION.test(lower) && existsSync(abs)) out.push(MIGRATION_RULE(rel));
  if (ENV_FILE(name)) out.push(ENV_RULE(rel));
  if (EXPECTED.test(lower)) out.push(EXPECTED_RULE(rel));
  return out;
}

function bashRules({ root, cmd }) {
  const out = [];

  // 2: .env 파일은 읽기(cat·Get-Content·git add …)도 쓰기도 막는다. 프로젝트 밖 경로라도 이름으로 막는다
  for (const w of words(cmd)) {
    const name = w.split("/").pop().toLowerCase();
    if (ENV_FILE(name)) out.push(ENV_RULE(name));
  }

  // 1·6: 파일에 쓰는 명령이 이 파일들을 가리키면
  if (WRITES.test(cmd)) {
    for (const w of words(cmd)) {
      const rel = slash(relative(root, resolve(root, w))).toLowerCase();
      if (rel.startsWith("..")) continue;
      if (MIGRATION.test(rel) && existsSync(resolve(root, w))) out.push(MIGRATION_RULE(rel));
      if (EXPECTED.test(rel)) out.push(EXPECTED_RULE(rel));
    }
  }

  for (const tokens of statements(cmd)) {
    const g = gitCommand(tokens);
    if (!g) continue;
    // 3: main(master)에서 커밋
    if (g.sub === "commit") {
      const branch = branchOf(root);
      if (branch === "main" || branch === "master") {
        out.push({
          id: "3-main에서-커밋",
          action: "block",
          target: branch,
          why: "main 브랜치에는 직접 커밋하지 않기로 했습니다(동작 확인 전 커밋을 막으려는 약속).",
          instead: "`git switch -c feat/작업이름`으로 새 브랜치를 만든 뒤 그 브랜치에서 커밋하세요.",
        });
      }
    }
    // 5: docs/prompts.md를 git에 추가
    if (g.sub === "add") {
      const PROMPTS = "docs/prompts.md";
      const args = g.args.map(slash);
      const explicit = args.find((a) => /(^|\/)prompts\.md$/i.test(a));
      const broad = args.find((a) => [".", "./", "*", "-A", "--all", "docs", "docs/", "./docs", "./docs/"].includes(a));
      const exists = existsSync(join(root, PROMPTS));
      if (explicit || (broad && exists && !isTracked(root, PROMPTS))) {
        out.push({
          id: "5-prompts-git-추가",
          action: "block",
          target: explicit ?? broad,
          why: "docs/prompts.md는 개인 작업 메모라 GitHub에 올리지 않기로 했습니다. `git add .`·`-A`·폴더 통째 추가는 이 파일까지 함께 담습니다.",
          instead: "`git add 파일1 파일2`처럼 올릴 파일 이름을 하나씩 적으세요.",
        });
      }
    }
  }
  return out;
}

// ── 기록과 응답 ─────────────────────────────────────────────────────
function log(root, hit, tool) {
  try {
    const file = join(root, ".claude", "logs", "blocked.txt");
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${stamp()} | ${hit.action === "block" ? "막음" : "물음"} | ${hit.id} | ${tool} | ${hit.target}\n`, "utf8");
  } catch {
    // 일지를 못 써도 조용히 넘어간다
  }
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let hits = [];
  let root = process.cwd();
  let tool = "?";
  try {
    const input = JSON.parse(raw);
    root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
    tool = input.tool_name ?? "?";
    const ti = input.tool_input ?? {};
    if ((tool === "Bash" || tool === "PowerShell") && typeof ti.command === "string") hits = bashRules({ root, cmd: ti.command });
    else if ((tool === "Write" || tool === "Edit") && typeof ti.file_path === "string") {
      const abs = isAbsolute(ti.file_path) ? ti.file_path : resolve(root, ti.file_path);
      const rel = slash(relative(root, abs));
      if (!rel.startsWith("..")) hits = fileRules({ rel, abs });
      else if (ENV_FILE(slash(abs).split("/").pop().toLowerCase())) hits = [ENV_RULE(slash(abs).split("/").pop())];
    } else if (tool === "Read" || tool === "Grep") {
      // 읽기 도구는 .env 규칙만. Grep은 path(파일·폴더)와 glob을 본다
      const name = (p) => (typeof p === "string" ? slash(p).split("/").pop().toLowerCase() : "");
      const hit = [ti.file_path, ti.path, ti.glob].map(name).find(ENV_FILE);
      if (hit) hits = [ENV_RULE(hit)];
    }
  } catch {
    process.exit(0); // 읽지 못하면 막지 않는다
  }
  if (!hits.length) process.exit(0);

  const blocked = hits.filter((h) => h.action === "block");
  const hit = blocked[0] ?? hits[0];
  log(root, hit, tool);
  const text = `[${hit.action === "block" ? "막음" : "확인 필요"}: ${hit.id}] ${hit.why}\n대신: ${hit.instead}`;
  if (hit.action === "block") {
    console.error(text);
    process.exit(2); // 도구를 실행하지 않고, stderr 글을 Claude에게 알려 준다
  }
  // 묻기: 사용자에게 허용 여부를 묻는 창을 띄운다. 승인하면 그대로 실행된다
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: text } }));
  process.exit(0);
});

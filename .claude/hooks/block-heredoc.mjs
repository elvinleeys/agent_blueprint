// PreToolUse(Bash) 훅: 명령에 "<<"(heredoc)가 있으면 실행 전에 막는다. 종료 코드 2 + stderr = 차단 이유
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let command = "";
  try {
    command = JSON.parse(raw).tool_input?.command ?? "";
  } catch {
    process.exit(0); // 읽지 못하면 막지 않는다
  }
  if (typeof command === "string" && command.includes("<<")) {
    console.error("셸 heredoc(<<)로 파일을 쓰지 마세요. 파일은 Write·Edit 도구로 만들고 고치세요. 셸은 실행·검사 명령에만 씁니다.");
    process.exit(2);
  }
});

import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// tsconfig의 "@/*" 경로 별칭을 테스트에서도 쓴다(컴포넌트 렌더링 스모크 테스트가 "@/..." import를 따라간다)
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // .claude/hooks의 보호 훅 시험도 함께 돌린다(점으로 시작하는 폴더라 기본 대상에서 빠진다)
  test: { include: [...configDefaults.include, ".claude/hooks/**/*.test.mjs"] },
});

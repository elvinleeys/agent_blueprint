import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// tsconfig의 "@/*" 경로 별칭을 테스트에서도 쓴다(컴포넌트 렌더링 스모크 테스트가 "@/..." import를 따라간다)
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});

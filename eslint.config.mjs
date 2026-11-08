import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 구현 검사 시험 코드: 일부러 틀린 코드가 들어 있고 자체 별칭(@/)을 쓴다
    "fixtures/implementation-check/**",
    // 구현 검사 화면 시연 코드(시험 데이터에서 만든 완성 코드 폴더)
    "fixtures/demo-implementation-check/**",
  ]),
]);

export default eslintConfig;

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // 내 컴퓨터 폴더 읽기(경로 제한·크기 상한 없음)와 테스트용 tar 만들기는 서버·화면 코드에서 쓰지 않는다
  {
    files: ["app/**", "lib/api/**", "components/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: "code-source/(local|tar-builder)$", message: "채점 스크립트·테스트 전용 모듈입니다(서버·화면에서 import 금지)." }] }],
    },
  },
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
    // 채점 스크립트 시험 코드(구현 검사 시험 데이터를 복사해 만든 폴더, 자체 별칭(@/)을 쓴다)
    "fixtures/score/**",
  ]),
]);

export default eslintConfig;

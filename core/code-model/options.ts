/**
 * readCodeModel의 기능별 설정. 같은 코드 분석기를 기능마다 다르게 쓰기 위한 스위치다.
 *
 * aliases(경로 별칭 해석):
 * - "tsconfig": 올린 tsconfig.json·jsconfig.json의 paths를 먼저 읽고, paths를 정의한 설정이 없으면 기본 규칙(`@/` → src/ 또는 프로젝트 루트)
 * - "default": 설정 파일을 읽지 않고 기본 규칙만
 * - "off": 별칭을 풀지 않는다. 상대 경로 import만 따라간다
 */
export type AliasMode = "tsconfig" | "default" | "off";
export type CodeModelOptions = { aliases: AliasMode };

/** 구현 검사: 설정 파일을 읽어 별칭을 푼다 */
export const IMPL_CHECK_OPTIONS: CodeModelOptions = { aliases: "tsconfig" };

/** 디자인 시스템 정리: 지금 결과를 그대로 두는 설정(별칭을 풀지 않음, 상대 경로만). 정리와 구현 검사의 기준 통일은 고도화 목록 */
export const CLEANUP_OPTIONS: CodeModelOptions = { aliases: "off" };

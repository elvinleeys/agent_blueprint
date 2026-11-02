/** 분석의 유일한 입력. 업로드·GitHub 어느 쪽이든 이 모양으로 만들어 넘긴다 */
export type SourceFile = { path: string; content: string };

export type ExtractedProp = { name: string; type: string; required: boolean };

export type AnalyzedComponent = {
  name: string;
  /** 컴포넌트가 선언된 파일 경로 */
  path: string;
  props: ExtractedProp[];
  /** `variant` prop의 문자열 값(유니온 또는 같은 파일의 cva 정의). 형식 검사는 하지 않은 원문 */
  variants: string[];
  /** 읽지 못한 props 타입 조각(import한 타입, Omit<…> 등). 비어 있지 않으면 props 목록이 일부일 수 있다 */
  unresolved: string[];
};

/** 분석의 유일한 입력. 업로드·GitHub 어느 쪽이든 이 모양으로 만들어 넘긴다 */
export type SourceFile = { path: string; content: string };

export type ExtractedProp = { name: string; type: string; required: boolean };

export type AnalyzedComponent = {
  name: string;
  /** 컴포넌트가 선언된 파일 경로 */
  path: string;
  props: ExtractedProp[];
  /** `variant` prop의 문자열 값(유니온, 같은 파일·올린 파일의 타입 별칭, cva 정의). 형식 검사는 하지 않은 원문 */
  variants: string[];
  /** 상속한 HTML 요소(React.ComponentProps<"button">, ButtonHTMLAttributes<…> 등) 예: ["button"]. 읽지 못한 것이 아니다 */
  inherits: string[];
  /** 상속한 컴포넌트: ComponentProps<typeof DialogPrimitive.Root>의 감싼 대상을 글자 그대로("DialogPrimitive.Root"). props는 읽지 못해도 읽지 못한 것으로 세지 않는다 */
  inheritsComponents: string[];
  /** 정말 읽지 못한 props 타입 조각(패키지 import, 올리지 않은 파일의 타입, Omit<…> 등). 비어 있지 않으면 props 목록이 일부일 수 있다 */
  unresolved: string[];
  /** 파일 밖으로 내보내는 컴포넌트인가. false면 파일 안에서만 쓰는 "내부용"(비교 대상 아님) */
  exported: boolean;
};

/** TypeScript 파서가 알려 준 문법 오류가 있어 일부만 분석된 파일 */
export type PartialFile = { path: string; errors: { line: number; message: string }[] };

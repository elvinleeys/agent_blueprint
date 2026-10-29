// 스택 값(저장값)과 화면 라벨. 클라이언트에서도 쓰므로 zod를 가져오지 않고 문자열 리터럴만 둔다
export const FRAMEWORKS = [
  { value: "html", label: "HTML" },
  { value: "react", label: "React" },
  { value: "next", label: "Next.js" },
] as const;

export const STYLINGS = [
  { value: "css", label: "CSS" },
  { value: "css-modules", label: "CSS Modules" },
  { value: "tailwind", label: "Tailwind CSS" },
] as const;

export const ARCHITECTURES = [
  { value: "type-based", label: "유형 중심" },
  { value: "feature-based", label: "기능 중심" },
  { value: "fsd", label: "FSD" },
] as const;

type Stack = { framework: string; styling: string; architecture: string };

export const labelOf = (list: readonly { value: string; label: string }[], value: string) => list.find((o) => o.value === value)?.label ?? value;

export const stackSummary = (s: Stack) => [labelOf(FRAMEWORKS, s.framework), labelOf(STYLINGS, s.styling), labelOf(ARCHITECTURES, s.architecture)].join(" · ");

// 이름을 단어로 쪼개고 단어 묶음이 얼마나 겹치는지 재는 함수. 디자인 시스템 정리(core/cleanup/compare.ts)에 있던 구현을 그대로 옮긴 것이다.
// 정리(C-02)와 구현 검사가 함께 쓴다. 구조 검사 R-05는 자기 쪽 계산을 그대로 쓴다(단어 쪼개기 방식이 달라, 통합은 고도화 목록).

/** PascalCase·camelCase 이름을 소문자 단어 묶음으로 쪼갠다. 약어(`URLParser` → {url, parser})와 숫자를 한 단어로 읽고 `_`·`-`는 단어 경계로 본다 */
export const words = (name: string) => new Set((name.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+/g) ?? []).map((w) => w.toLowerCase()));

export const common = <T>(a: Set<T>, b: Set<T>) => [...a].filter((x) => b.has(x));

/** 두 묶음의 Jaccard 유사도: 겹치는 수 ÷ 합집합 수(0~1). 둘 다 비어 있으면 0 */
export const jaccard = <T>(a: Set<T>, b: Set<T>) => {
  const inter = common(a, b).length;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
};

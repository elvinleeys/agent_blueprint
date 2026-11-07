import { common, jaccard, words } from "../similarity/name-similarity";
import { NAME_JACCARD_MIN, PROPS_JACCARD_MIN } from "../similarity/thresholds";

// 짝짓기 후보에 쓰는 이름·props 유사도. 단어 쪼개기·Jaccard·기준값은 core/similarity의 공용 구현을 그대로 쓴다(새 계산 방식을 만들지 않는다).

/** 훅 이름은 `use` 접두사를 뗀 뒤 비교한다(`useCart` → `Cart`) */
const stripUse = (name: string) => name.replace(/^use(?=[A-Z0-9])/, "");
const wordsOf = (name: string, hook: boolean) => words(hook ? stripUse(name) : name);

/** 이름 단어 Jaccard(0~1) */
export const nameScore = (a: string, b: string, hook: boolean): number => jaccard(wordsOf(a, hook), wordsOf(b, hook));

/** 이름 단어가 하나라도 겹치는가 */
export const sharesWord = (a: string, b: string, hook: boolean): boolean => common(wordsOf(a, hook), wordsOf(b, hook)).length >= 1;

/** props 이름 Jaccard. 양쪽 props가 하나 이상일 때만 비교한다(아니면 0) */
export const propsScore = (a: string[], b: string[]): number => (a.length && b.length ? jaccard(new Set(a), new Set(b)) : 0);

export const isNameSimilar = (score: number) => score >= NAME_JACCARD_MIN;
export const isPropsSimilar = (score: number) => score >= PROPS_JACCARD_MIN;

/** 코드 포인트 순 비교(로케일에 따라 달라지지 않는다). 같은 입력이면 같은 순서를 내기 위해 정렬에 쓴다 */
export const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

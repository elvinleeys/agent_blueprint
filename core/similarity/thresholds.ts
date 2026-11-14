// 이름 유사도 기준값. 구조 검사(R-05)·디자인 시스템 정리(C-02)·구현 검사(짝짓기 후보)가 모두 이 파일의 값을 가져다 쓴다.
// 값을 바꾸면 세 기능의 결과가 함께 바뀐다. 바꾸기 전에 세 기능의 테스트를 함께 돌린다.

/** 이름 단어 Jaccard(겹치는 단어 수 ÷ 전체 단어 수) 최소값. 이 값 이상이면 "비슷한 이름" */
export const NAME_JACCARD_MIN = 0.5;

/** props 이름 Jaccard 최소값(양쪽 props가 1개 이상일 때만 비교) */
export const PROPS_JACCARD_MIN = 0.5;

// 화면 주소(라우트)의 공통 형식과 라우터별 해석기가 함께 쓰는 도우미.
//
// 공통 형식: `/products/:id`
// - 동적 구간은 `:이름`, 나머지 전부 받는 구간은 `*`, 있어도 없어도 되는 `*`는 `*?`
// - 앞에 `/`가 있고 끝에 `/`가 없다(루트만 `/`)
// 라우터별 해석기: route-react-router.ts(React Router), route-next-app.ts(Next.js App Router). 그 밖의 라우터는 "읽지 못함"으로 기록한다.

export type RouterKind = "react-router" | "next-app";

export type RouteFact = {
  router: RouterKind;
  /** 공통 형식으로 바꾼 전체 주소 */
  path: string;
  /** 코드에 적힌 그대로(React Router는 이 라우트 자신의 path, Next는 파일 경로) */
  raw: string;
  /** 이 주소가 보여 주는 컴포넌트 이름. 읽지 못하면 null */
  component: string | null;
  /** true면 자식 라우트를 감싸는 레이아웃이라 화면 주소 하나로 세지 않는다 */
  layout: boolean;
  line: number;
};

/** 공통 형식으로 다듬는다: 앞에 `/`, 겹친 `/` 정리, 끝 `/` 제거(루트 제외) */
export function normalizeRoute(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return `/${parts.join("/")}`;
}

/** 부모 주소에 자식 구간을 붙인다. 자식이 `/`로 시작하면 절대 경로라 부모를 버리고, 비어 있으면(index·경로 없는 레이아웃) 부모 그대로 */
export function joinRoute(parent: string, segment: string | null | undefined): string {
  if (!segment) return normalizeRoute(parent);
  if (segment.startsWith("/")) return normalizeRoute(segment);
  return normalizeRoute(`${parent}/${segment}`);
}

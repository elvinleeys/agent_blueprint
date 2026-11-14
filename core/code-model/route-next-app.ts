import { normalizeRoute, type RouteFact } from "./routes";

// Next.js App Router 해석기: `app/**/page.tsx`의 폴더 이름을 화면 주소로 바꾼다(파일 경로만 보고 코드는 읽지 않는다).
// - `(그룹)` 폴더와 `@슬롯` 폴더는 주소에서 뺀다
// - `[id]` → `:id`, `[...slug]` → `*`, `[[...slug]]` → `*?`
// - `_비공개` 폴더 안은 주소가 아니다
// - 가로채기 라우트(`(.)x`, `(..)x`, `(...)x`)는 읽지 못함으로 기록한다
// 알려진 한계: 경로에서 처음 나오는 `app` 폴더를 앱 루트로 본다. `pages/` 폴더 방식(Pages Router)은 읽지 않는다.

const PAGE_FILE = /^page\.(tsx|ts|jsx|js)$/;

export type NextAppResult = { route: string } | { skip: "private" | "not-a-page" } | { unreadable: string };

export function nextAppRoute(filePath: string): NextAppResult {
  const segs = filePath.split("/");
  const last = segs[segs.length - 1];
  const appIndex = segs.indexOf("app");
  if (!PAGE_FILE.test(last) || appIndex < 0 || appIndex >= segs.length - 1) return { skip: "not-a-page" };
  const out: string[] = [];
  for (const seg of segs.slice(appIndex + 1, -1)) {
    if (/^\(\.{1,3}\)/.test(seg)) return { unreadable: `가로채기 라우트(${seg})` };
    if (/^\(.+\)$/.test(seg) || seg.startsWith("@")) continue;
    if (seg.startsWith("_")) return { skip: "private" };
    const optionalCatchAll = /^\[\[\.\.\.(.+)\]\]$/.exec(seg);
    const catchAll = /^\[\.\.\.(.+)\]$/.exec(seg);
    const dynamic = /^\[(.+)\]$/.exec(seg);
    if (optionalCatchAll) out.push("*?");
    else if (catchAll) out.push("*");
    else if (dynamic) out.push(`:${dynamic[1]}`);
    else out.push(seg);
  }
  return { route: normalizeRoute(out.join("/")) };
}

/** 페이지 파일 하나의 라우트 사실. 페이지가 아니거나 비공개면 null */
export function nextAppRouteFact(filePath: string, component: string | null): { fact: RouteFact | null; unreadable: string | null } {
  const r = nextAppRoute(filePath);
  if ("unreadable" in r) return { fact: null, unreadable: r.unreadable };
  if ("skip" in r) return { fact: null, unreadable: null };
  return { fact: { router: "next-app", path: r.route, raw: filePath, component, layout: false, line: 1 }, unreadable: null };
}

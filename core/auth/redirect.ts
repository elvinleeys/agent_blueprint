// 제어문자와 역슬래시(\x5c). 브라우저는 역슬래시를 슬래시로 취급해 "/\evil.com"을 외부 주소로 해석한다
const UNSAFE = /[\x00-\x1f\x7f\x5c]/;
// 홈(/)은 로그인 상태에서 next로 다시 보내므로 next로 쓰면 의미 없는 이동이 생긴다
const LOOP = /^\/(login|auth)(\/|\?|#|$)|^\/(\?|#|$)/;
const PROTECTED = /^\/(projects|account)(\/|$)/;
const BASE = "http://localhost";

/** 로그인 후 이동할 경로. 같은 사이트 안의 경로만 통과시키고 나머지는 fallback으로 바꾼다 */
export function safeNextPath(next: unknown, fallback = "/projects"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || UNSAFE.test(next) || LOOP.test(next)) return fallback;
  // 브라우저가 해석한 결과가 같은 origin인지 한 번 더 확인한다
  const url = new URL(next, BASE);
  if (url.origin !== BASE) return fallback;
  return url.pathname + url.search + url.hash;
}

export const isProtectedPath = (pathname: string): boolean => PROTECTED.test(pathname);

/** Proxy의 이동 판단. 이동이 필요 없으면 null. 홈(/)이 소개와 로그인을 함께 맡는다 */
export function decideRedirect(a: { pathname: string; search: string; isAuthed: boolean }): string | null {
  const next = () => safeNextPath(new URLSearchParams(a.search).get("next"));
  if (!a.isAuthed && isProtectedPath(a.pathname)) return `/?next=${encodeURIComponent(a.pathname + a.search)}`;
  if (a.pathname === "/login") return a.isAuthed ? next() : `/${a.search}`; // next·error 쿼리를 홈으로 넘긴다
  if (a.isAuthed && a.pathname === "/") return next();
  return null;
}

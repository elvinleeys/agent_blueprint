// 제어문자와 역슬래시(\x5c). 브라우저는 역슬래시를 슬래시로 취급해 "/\evil.com"을 외부 주소로 해석한다
const UNSAFE = /[\x00-\x1f\x7f\x5c]/;
const LOOP = /^\/(login|auth)(\/|\?|#|$)/;
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

/** Proxy의 이동 판단. 이동이 필요 없으면 null */
export function decideRedirect(a: { pathname: string; search: string; isAuthed: boolean }): string | null {
  if (!a.isAuthed && isProtectedPath(a.pathname)) return `/login?next=${encodeURIComponent(a.pathname + a.search)}`;
  if (a.isAuthed && a.pathname === "/login") return safeNextPath(new URLSearchParams(a.search).get("next"));
  return null;
}

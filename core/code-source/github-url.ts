/**
 * GitHub 공개 저장소 주소 검증(순수 함수, 화면·서버·채점 스크립트가 함께 쓴다).
 * 받는 것: https://github.com/<owner>/<repo> 와 끝의 `.git`·`/`, `/tree/<브랜치>`(브랜치에 `/` 없음).
 * 사용자 주소로 직접 요청하지 않는다: 여기서 꺼낸 owner·repo·ref만으로 서버가 고정 호스트 주소를 새로 만든다(서버 요청 위조 방어).
 */

export type RepoTarget = { owner: string; repo: string; ref: string | null; subdir: string | null };
export type RepoUrlResult = { ok: true; target: RepoTarget } | { ok: false; message: string };

/** GitHub 사용자·조직 이름: 영문·숫자·`-`, 1~39자, `-`로 시작·끝나지 않음 */
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
/** 저장소 이름: 영문·숫자·`.`·`_`·`-`, 1~100자, `.`·`..`만은 안 됨 */
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
/** 브랜치·태그·커밋: 허용 문자만, `/` 없음 */
const REF = /^[A-Za-z0-9._-]{1,100}$/;
/** 하위 폴더 한 칸 */
const SEGMENT = /^[A-Za-z0-9._@-]{1,100}$/;

export const REPO_URL_HINT = "https://github.com/<owner>/<repo> 형식의 공개 저장소 주소를 넣어 주세요(브랜치는 /tree/<브랜치>).";
const bad = (why: string): RepoUrlResult => ({ ok: false, message: `${why} ${REPO_URL_HINT}` });

/** 하위 폴더(선택): `apps/web`처럼 상대 경로. `..`·절대 경로·역슬래시는 거부. 빈 값이면 null */
export function parseSubdir(raw: string | undefined | null): { ok: true; subdir: string | null } | { ok: false; message: string } {
  const s = (raw ?? "").trim().replace(/^\.\/+/, "").replace(/\/+$/, "");
  if (!s) return { ok: true, subdir: null };
  const segs = s.split("/");
  if (s.startsWith("/") || s.includes("\\") || segs.some((x) => x === "." || x === ".." || !SEGMENT.test(x))) {
    return { ok: false, message: "하위 폴더는 apps/web처럼 저장소 안의 상대 경로로 넣어 주세요(.. 와 절대 경로는 쓸 수 없습니다)." };
  }
  return { ok: true, subdir: segs.join("/") };
}

export function parseRepoUrl(raw: string, subdirRaw?: string | null): RepoUrlResult {
  const text = raw.trim();
  if (!text || text.length > 300) return bad("주소가 비었거나 너무 깁니다.");
  // URL 해석기는 `/./`·`/../`를 조용히 정리하므로, 정리되기 전 원문에서 먼저 거부한다
  if (/\/\.{1,2}(\/|$|[?#])/.test(text)) return bad("주소에 . 이나 .. 경로가 있습니다.");
  // URL 해석기는 `\`를 `/`로 바꾼 뒤 `..`를 정리하므로 원문에서 거부한다
  if (text.includes("\\")) return bad("주소에 역슬래시(\\)가 있습니다.");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return bad("주소 형식이 아닙니다.");
  }
  // 호스트·스킴·포트·사용자 정보·쿼리·조각을 모두 고정한다
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port !== "" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    return bad("github.com의 https 주소만 받습니다.");
  }
  // URL은 퍼센트 인코딩을 그대로 두므로 인코딩된 글자(%2e%2e 등)는 아래 허용 문자 검사에서 걸린다
  const parts = url.pathname.replace(/\/+$/, "").split("/").slice(1);
  if (parts.length !== 2 && !(parts.length === 4 && parts[2] === "tree")) return bad("저장소 주소가 아닙니다.");
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, "");
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") return bad("저장소 이름에 쓸 수 없는 글자가 있습니다.");
  const ref = parts.length === 4 ? parts[3] : null;
  if (ref !== null && (!REF.test(ref) || ref === "." || ref.includes(".."))) return bad("브랜치 이름에 쓸 수 없는 글자가 있습니다(/ 가 든 브랜치는 지원하지 않습니다).");
  const sub = parseSubdir(subdirRaw);
  if (!sub.ok) return { ok: false, message: sub.message };
  return { ok: true, target: { owner, repo, ref, subdir: sub.subdir } };
}

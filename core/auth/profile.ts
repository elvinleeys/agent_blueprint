export type Profile = { name: string; avatarUrl: string | null; initial: string };

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** 로그인 정보(user_metadata, 이메일)에서 헤더에 보일 이름·사진을 만든다. GitHub 외 가입 방식도 같은 필드를 쓴다 */
export function profileFromClaims(meta: Record<string, unknown> | undefined, email?: unknown): Profile {
  const m = meta ?? {};
  const name = str(m.user_name) ?? str(m.full_name) ?? str(m.name) ?? str(email) ?? "사용자";
  const url = str(m.avatar_url) ?? str(m.picture);
  // img src에 들어가므로 https 주소만 쓴다
  const avatarUrl = url && /^https:\/\//i.test(url) ? url : null;
  return { name, avatarUrl, initial: Array.from(name)[0].toUpperCase() };
}

// 업로드 경로(슬래시, 폴더 이름이 앞에 붙을 수 있음)를 다루는 순수 문자열 도우미

/** 폴더 부분. 파일이 맨 위에 있으면 "" */
export const dirOf = (p: string): string => {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
};

/** `base`에 상대 경로를 붙이고 `.`·`..`를 계산한다 */
export function joinPath(base: string, rel: string): string {
  const out: string[] = [];
  for (const seg of [...base.split("/"), ...rel.split("/")]) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

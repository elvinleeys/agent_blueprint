// 테스트 전용: 작은 tar 압축 파일을 만든다(tar 해석기·저장소 읽기 테스트가 함께 쓴다). 앱 코드에서 import 금지.

export type TarEntrySpec = {
  name: string;
  content?: string;
  /** 0 일반 파일, 5 폴더, 2 바로가기, 1 하드링크, x pax, g 전역 pax, L GNU 긴 이름 */
  type?: string;
  prefix?: string;
  linkname?: string;
  /** 머리말의 크기를 실제와 다르게 적는다(손상 시험용) */
  sizeOverride?: number;
  /** 검사합을 일부러 틀리게 */
  badChecksum?: boolean;
  /** GNU 형식 머리말("ustar  \0"): 345바이트부터가 prefix가 아니다 */
  gnu?: boolean;
  /** 크기 칸을 base-256(첫 바이트 0x80) 표기로 */
  base256Size?: boolean;
};

const enc = new TextEncoder();

function header(e: TarEntrySpec, size: number): Uint8Array {
  const h = new Uint8Array(512);
  const put = (s: string, at: number, len: number) => h.set(enc.encode(s).subarray(0, len), at);
  put(e.name, 0, 100);
  put("0000644\0", 100, 8);
  put("0000000\0", 108, 8);
  put("0000000\0", 116, 8);
  put(`${(e.sizeOverride ?? size).toString(8).padStart(11, "0")}\0`, 124, 12);
  put("00000000000\0", 136, 12);
  put(e.type ?? "0", 156, 1);
  if (e.linkname) put(e.linkname, 157, 100);
  if (e.base256Size) h.set([0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], 124);
  if (e.gnu) put("ustar  \0", 257, 8);
  else {
    put("ustar\0", 257, 6);
    put("00", 263, 2);
  }
  if (e.prefix) put(e.prefix, 345, 155);
  h.fill(0x20, 148, 156);
  let sum = h.reduce((a, b) => a + b, 0);
  if (e.badChecksum) sum += 1;
  put(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  return h;
}

/** pax 기록 한 줄: 길이는 자기 자신을 포함한 바이트 수 */
export function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`;
  let len = enc.encode(body).length + 1;
  while (String(len).length + enc.encode(body).length !== len) len++;
  return `${len}${body}`;
}

/** 항목 목록 → tar 바이트(끝 표시 0 블록 2개 포함) */
export function buildTar(entries: TarEntrySpec[], { end = true } = {}): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const e of entries) {
    const body = enc.encode(e.content ?? "");
    parts.push(header(e, body.length), body, new Uint8Array((512 - (body.length % 512)) % 512));
  }
  if (end) parts.push(new Uint8Array(1024));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

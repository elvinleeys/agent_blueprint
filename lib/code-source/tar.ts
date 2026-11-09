/**
 * 작은 tar 해석기(GitHub 저장소 tarball 전용). 압축을 푼 바이트를 조금씩 받아(push) 메모리에서만 읽는다. 디스크에 쓰지 않는다.
 * - 일반 파일만 읽는다. 폴더·바로가기(symlink)·하드링크·장치 파일 등 특수 항목은 내용을 버린다.
 * - `../`·절대 경로·드라이브 경로·역슬래시가 든 항목 이름은 압축 파일 전체를 거부한다(GitHub tarball에는 없어야 하는 이름).
 * - 머리말: 표준(ustar, prefix+name), 긴 경로용 pax(`x`: path·size, `g`: GitHub가 넣는 커밋 id comment), GNU 긴 이름(`L`).
 * - 제한: 항목 수, 푼 전체 크기(버리는 파일 포함, 압축 폭탄 방어), 남긴 파일 하나 크기·합계. 넘으면 바로 중단한다.
 */

export type TarLimits = { maxEntries: number; maxUnpackedBytes: number; maxFileBytes: number; maxKeptBytes: number };
export type TarErrorCode = "unsafe_path" | "bad_archive" | "too_many_entries" | "too_large_unpacked" | "file_too_large" | "kept_too_large";

export class TarError extends Error {
  constructor(
    readonly code: TarErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** 원래 경로를 받아 남길 경로(바꾼 이름)를 돌려준다. null이면 내용을 버린다 */
export type TarAccept = (path: string) => string | null;

const BLOCK = 512;
/** pax·GNU 긴 이름 같은 머리말 내용 상한(정상은 수백 바이트) */
const MAX_META_BYTES = 64 * 1024;
const decoder = new TextDecoder("utf-8");

const cstr = (b: Uint8Array, start: number, len: number) => {
  const slice = b.subarray(start, start + len);
  const end = slice.indexOf(0);
  return decoder.decode(end < 0 ? slice : slice.subarray(0, end));
};

/** 위험한 항목 이름: 절대 경로, 드라이브 경로, 역슬래시, `..` 칸 */
export function unsafeTarPath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:/.test(path) || path.includes("\\") || path.split("/").includes("..");
}

/** pax 기록: "<길이> <키>=<값>\n" 반복(길이는 바이트 단위, 자기 자신 포함) */
function parsePax(b: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  let pos = 0;
  while (pos < b.length) {
    const sp = b.indexOf(0x20, pos);
    if (sp < 0) break;
    const len = Number(decoder.decode(b.subarray(pos, sp)));
    if (!Number.isInteger(len) || len <= 0 || pos + len > b.length) throw new TarError("bad_archive", "압축 파일의 머리말(pax)이 손상됐습니다.");
    const record = decoder.decode(b.subarray(sp + 1, pos + len)).replace(/\n$/, "");
    const eq = record.indexOf("=");
    if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1);
    pos += len;
  }
  return out;
}

type Body = { left: number; pad: number; sink: "keep" | "meta" | "skip"; type: string; path: string; chunks: Uint8Array[] };

export class TarReader {
  /** GitHub tarball의 pax 전역 머리말 comment(커밋 id). 없으면 null */
  commit: string | null = null;
  readonly files: { path: string; content: string }[] = [];
  private buf = new Uint8Array(0);
  private body: Body | null = null;
  private pax: Record<string, string> = {};
  private longName: string | null = null;
  private entries = 0;
  private unpacked = 0;
  private kept = 0;
  private finished = false;

  constructor(
    private readonly limits: TarLimits,
    private readonly accept: TarAccept,
  ) {}

  push(chunk: Uint8Array): void {
    this.unpacked += chunk.length;
    if (this.unpacked > this.limits.maxUnpackedBytes) throw new TarError("too_large_unpacked", `압축을 푼 크기가 ${this.limits.maxUnpackedBytes / (1024 * 1024)}MB를 넘습니다.`);
    if (this.finished) return;
    const next = new Uint8Array(this.buf.length + chunk.length);
    next.set(this.buf);
    next.set(chunk, this.buf.length);
    this.buf = next;
    let pos = 0;
    while (!this.finished) {
      if (this.body) {
        const b = this.body;
        const take = Math.min(b.left, this.buf.length - pos);
        if (b.sink !== "skip" && take > 0) b.chunks.push(this.buf.slice(pos, pos + take));
        b.left -= take;
        pos += take;
        if (b.left > 0) break;
        if (this.buf.length - pos < b.pad) break;
        pos += b.pad;
        this.body = null;
        this.finishBody(b);
        continue;
      }
      if (this.buf.length - pos < BLOCK) break;
      this.readHeader(this.buf.subarray(pos, pos + BLOCK));
      pos += BLOCK;
    }
    this.buf = this.buf.slice(pos);
  }

  /** 입력이 끝났을 때. 항목 중간에서 끝났으면 손상된 압축 파일이다 */
  end(): void {
    if (this.body) throw new TarError("bad_archive", "압축 파일이 중간에 끝났습니다.");
  }

  private readHeader(h: Uint8Array) {
    if (h.every((x) => x === 0)) {
      this.finished = true; // 끝 표시(0으로 찬 블록)
      return;
    }
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : h[i];
    if (parseInt(cstr(h, 148, 8).trim() || "x", 8) !== sum) throw new TarError("bad_archive", "압축 파일의 머리말이 손상됐습니다(검사합 불일치).");
    if (++this.entries > this.limits.maxEntries) throw new TarError("too_many_entries", `압축 파일의 항목이 ${this.limits.maxEntries.toLocaleString("en-US")}개를 넘습니다.`);

    const type = String.fromCharCode(h[156] || 0x30);
    if (h[124] & 0x80) throw new TarError("bad_archive", "압축 파일에 지원하지 않는 크기 표기가 있습니다.");
    let size = parseInt(cstr(h, 124, 12).trim() || "0", 8);
    const name = cstr(h, 0, 100);
    const prefix = cstr(h, 257, 6).startsWith("ustar") ? cstr(h, 345, 155) : "";
    let path = prefix ? `${prefix}/${name}` : name;

    const meta = type === "x" || type === "g" || type === "L";
    if (!meta) {
      // 바로 앞의 pax·GNU 머리말이 이 항목의 경로·크기를 바꾼다
      if (this.pax.path !== undefined) path = this.pax.path;
      else if (this.longName !== null) path = this.longName;
      if (this.pax.size !== undefined) size = Number(this.pax.size);
      this.pax = {};
      this.longName = null;
      if (unsafeTarPath(path)) throw new TarError("unsafe_path", `압축 파일에 허용하지 않는 경로가 있습니다: ${path}`);
    }
    if (!Number.isSafeInteger(size) || size < 0) throw new TarError("bad_archive", "압축 파일의 항목 크기를 읽지 못했습니다.");

    let sink: Body["sink"] = "skip";
    if (meta) {
      if (size > MAX_META_BYTES) throw new TarError("bad_archive", "압축 파일의 머리말이 너무 큽니다.");
      sink = "meta";
    } else if (type === "0" || type === "7") {
      const mapped = this.accept(path);
      if (mapped !== null) {
        if (size > this.limits.maxFileBytes) throw new TarError("file_too_large", `파일 하나가 ${this.limits.maxFileBytes / 1024}KB를 넘습니다: ${mapped}`);
        this.kept += size;
        if (this.kept > this.limits.maxKeptBytes) throw new TarError("kept_too_large", `읽을 파일의 합계가 ${this.limits.maxKeptBytes / (1024 * 1024)}MB를 넘습니다.`);
        sink = "keep";
        path = mapped;
      }
    }
    // 그 밖의 종류(폴더 5, 바로가기 2, 하드링크 1, 장치 3·4, FIFO 6 등)는 내용을 버린다
    this.body = { left: size, pad: (BLOCK - (size % BLOCK)) % BLOCK, sink, type, path, chunks: [] };
    if (size === 0) {
      this.body = null;
      this.finishBody({ left: 0, pad: 0, sink, type, path, chunks: [] });
    }
  }

  private finishBody(b: Body) {
    if (b.sink === "skip") return;
    const bytes = new Uint8Array(b.chunks.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of b.chunks) {
      bytes.set(c, o);
      o += c.length;
    }
    if (b.sink === "keep") {
      this.files.push({ path: b.path, content: decoder.decode(bytes) });
      return;
    }
    if (b.type === "L") this.longName = cstr(bytes, 0, bytes.length);
    else if (b.type === "x") this.pax = parsePax(bytes);
    else if (b.type === "g") this.commit = parsePax(bytes).comment ?? this.commit;
  }
}

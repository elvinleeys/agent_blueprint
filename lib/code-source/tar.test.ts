import { describe, expect, it } from "vitest";
import { TarError, TarReader, type TarAccept, type TarLimits } from "./tar";
import { buildTar, paxRecord } from "./tar-builder";

// tar 해석기(사용자 결정 1): 일반 파일만, 특수 항목 무시, 위험한 경로 거부, 표준·긴 경로 머리말, 제한을 넘으면 중단

const LIMITS: TarLimits = { maxEntries: 50_000, maxUnpackedBytes: 300 * 1024 * 1024, maxFileBytes: 1024 * 1024, maxKeptBytes: 20 * 1024 * 1024 };
const keepAll: TarAccept = (p) => p;

function read(bytes: Uint8Array, { limits = LIMITS, accept = keepAll, chunk = 0 }: { limits?: TarLimits; accept?: TarAccept; chunk?: number } = {}) {
  const r = new TarReader(limits, accept);
  if (chunk > 0) for (let i = 0; i < bytes.length; i += chunk) r.push(bytes.subarray(i, i + chunk));
  else r.push(bytes);
  r.end();
  return r;
}
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof TarError ? e.code : `not-tar-error: ${String(e)}`;
  }
  return "no-error";
};

describe("일반 파일만 읽는다", () => {
  const tar = buildTar([
    { name: "repo-abc/", type: "5" },
    { name: "repo-abc/src/A.tsx", content: "export const A = 1;" },
    { name: "repo-abc/src/link.tsx", type: "2", linkname: "../../../etc/passwd" },
    { name: "repo-abc/src/hard.tsx", type: "1", linkname: "repo-abc/src/A.tsx" },
    { name: "repo-abc/dev", type: "3" },
    { name: "repo-abc/src/B.ts", content: "export type B = string;", type: "\0" },
  ]);

  it("폴더·바로가기·하드링크·장치 항목은 버리고 일반 파일 내용만 남긴다", () => {
    expect(read(tar).files).toEqual([
      { path: "repo-abc/src/A.tsx", content: "export const A = 1;" },
      { path: "repo-abc/src/B.ts", content: "export type B = string;" },
    ]);
  });

  it("남길지 정하는 함수가 null이면 내용을 버리고, 경로를 바꿔 주면 바꾼 경로로 남긴다", () => {
    const r = read(tar, { accept: (p) => (p.endsWith(".tsx") ? p.replace("repo-abc/", "repo/") : null) });
    expect(r.files).toEqual([{ path: "repo/src/A.tsx", content: "export const A = 1;" }]);
  });

  it("조각으로 나눠 받아도 같은 결과(1바이트·7바이트·511바이트)", () => {
    const whole = read(tar).files;
    for (const chunk of [1, 7, 511]) expect(read(tar, { chunk }).files).toEqual(whole);
  });

  it("한글 내용(UTF-8)이 조각 경계에서 갈라져도 깨지지 않는다", () => {
    const t = buildTar([{ name: "r/a.ts", content: "// 한글 주석\nexport const 값 = 1;" }]);
    expect(read(t, { chunk: 3 }).files[0].content).toBe("// 한글 주석\nexport const 값 = 1;");
  });
});

describe("위험한 경로는 압축 파일 전체를 거부한다", () => {
  it.each(["repo/../../etc/passwd.ts", "../a.ts", "/etc/a.ts", "C:/a.ts", "repo\\..\\a.ts", "repo/src/../../a.ts"])("%s", (name) => {
    expect(codeOf(() => read(buildTar([{ name, content: "x" }])))).toBe("unsafe_path");
  });

  it("버릴 항목(폴더·바로가기)의 이름이라도 거부한다", () => {
    expect(codeOf(() => read(buildTar([{ name: "../evil", type: "5" }])))).toBe("unsafe_path");
    expect(codeOf(() => read(buildTar([{ name: "/abs-link", type: "2", linkname: "x" }])))).toBe("unsafe_path");
  });

  it("긴 경로 머리말(pax·GNU)로 들어온 위험한 경로도 거부한다", () => {
    expect(codeOf(() => read(buildTar([{ name: "PaxHeader", type: "x", content: paxRecord("path", "../../x.ts") }, { name: "safe.ts", content: "x" }])))).toBe("unsafe_path");
    expect(codeOf(() => read(buildTar([{ name: "././@LongLink", type: "L", content: "/etc/x.ts\0" }, { name: "safe.ts", content: "x" }])))).toBe("unsafe_path");
  });
});

describe("머리말: 표준(ustar prefix)·pax·GNU 긴 이름·GitHub 커밋 id", () => {
  const long = `repo-abc/${"very-long-folder-name/".repeat(8)}Component.tsx`;

  it("ustar prefix + name을 이어 경로로 쓴다", () => {
    expect(read(buildTar([{ name: "Component.tsx", prefix: "repo-abc/src/components", content: "c" }])).files[0].path).toBe("repo-abc/src/components/Component.tsx");
  });

  it("pax path(100자 넘는 경로)를 다음 항목 하나에만 쓴다", () => {
    expect(long.length).toBeGreaterThan(100);
    const r = read(buildTar([{ name: "PaxHeader", type: "x", content: paxRecord("path", long) }, { name: long.slice(0, 100), content: "a" }, { name: "repo-abc/b.ts", content: "b" }]));
    expect(r.files.map((f) => f.path)).toEqual([long, "repo-abc/b.ts"]);
  });

  it("GNU 긴 이름(L)을 다음 항목 하나에만 쓴다", () => {
    const r = read(buildTar([{ name: "././@LongLink", type: "L", content: `${long}\0` }, { name: long.slice(0, 100), content: "a" }, { name: "repo-abc/b.ts", content: "b" }]));
    expect(r.files.map((f) => f.path)).toEqual([long, "repo-abc/b.ts"]);
  });

  it("pax 전역 머리말(g)의 comment를 커밋 id로 읽는다(GitHub tarball 형식). 없으면 null", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    expect(read(buildTar([{ name: "pax_global_header", type: "g", content: paxRecord("comment", sha) }, { name: "r/a.ts", content: "a" }])).commit).toBe(sha);
    expect(read(buildTar([{ name: "r/a.ts", content: "a" }])).commit).toBeNull();
  });

  it("끝 표시(0 블록) 뒤의 내용은 읽지 않는다", () => {
    const t = buildTar([{ name: "r/a.ts", content: "a" }]);
    const extra = buildTar([{ name: "r/b.ts", content: "b" }], { end: false });
    const joined = new Uint8Array(t.length + extra.length);
    joined.set(t);
    joined.set(extra, t.length);
    expect(read(joined).files.map((f) => f.path)).toEqual(["r/a.ts"]);
  });
});

describe("손상된 압축 파일", () => {
  it("검사합이 틀리면 거부", () => {
    expect(codeOf(() => read(buildTar([{ name: "r/a.ts", content: "a", badChecksum: true }])))).toBe("bad_archive");
  });

  it("항목 중간에서 끝나면 거부", () => {
    const t = buildTar([{ name: "r/a.ts", content: "x".repeat(2000) }], { end: false });
    expect(codeOf(() => read(t.subarray(0, 1200)))).toBe("bad_archive");
  });

  it("pax 기록 길이가 틀리면 거부", () => {
    expect(codeOf(() => read(buildTar([{ name: "PaxHeader", type: "x", content: "999 path=x\n" }, { name: "r/a.ts", content: "a" }])))).toBe("bad_archive");
  });
});

describe("제한(3절 값)을 넘으면 중단", () => {
  it("항목 수", () => {
    const t = buildTar(Array.from({ length: 4 }, (_, i) => ({ name: `r/${i}.md`, content: "x" })));
    expect(codeOf(() => read(t, { limits: { ...LIMITS, maxEntries: 3 } }))).toBe("too_many_entries");
    expect(read(t, { limits: { ...LIMITS, maxEntries: 4 } }).files).toHaveLength(4);
  });

  it("푼 전체 크기는 버리는 파일까지 센다(압축 폭탄 방어)", () => {
    const t = buildTar([{ name: "r/big.bin", content: "x".repeat(10_000) }]);
    expect(codeOf(() => read(t, { limits: { ...LIMITS, maxUnpackedBytes: 5_000 }, accept: () => null }))).toBe("too_large_unpacked");
  });

  it("남길 파일 하나의 크기와 합계(버리는 파일은 세지 않음)", () => {
    const t = buildTar([
      { name: "r/a.ts", content: "x".repeat(600) },
      { name: "r/b.ts", content: "x".repeat(600) },
      { name: "r/skip.bin", content: "x".repeat(5_000) },
    ]);
    const keepTs = (p: string) => (p.endsWith(".ts") ? p : null);
    expect(codeOf(() => read(t, { limits: { ...LIMITS, maxFileBytes: 500 }, accept: keepTs }))).toBe("file_too_large");
    expect(codeOf(() => read(t, { limits: { ...LIMITS, maxKeptBytes: 1_000 }, accept: keepTs }))).toBe("kept_too_large");
    expect(read(t, { limits: { ...LIMITS, maxKeptBytes: 1_200 }, accept: keepTs }).files).toHaveLength(2);
  });

  it("머리말의 크기가 실제보다 크게 적혀 있어도 제한을 먼저 본다(남길 파일)", () => {
    const t = buildTar([{ name: "r/a.ts", content: "x", sizeOverride: 5 * 1024 * 1024 }], { end: false });
    expect(codeOf(() => read(t))).toBe("file_too_large");
  });
});

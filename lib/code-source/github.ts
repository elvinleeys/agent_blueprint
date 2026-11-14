// GitHub 공개 저장소 코드 읽기(서버·채점 스크립트 공용, Node 전용. 앱의 화면 코드에서 import 금지).
// 받은 압축 파일은 메모리에서만 풀고 디스크·DB에 저장하지 않는다. 오류 문구에 토큰·코드 내용을 넣지 않는다.
// 요청은 검증한 owner·repo·ref로 고정 호스트(api.github.com, codeload.github.com) 주소를 새로 만들어 보낸다.
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { createGunzip } from "node:zlib";
import type { RepoTarget } from "../../core/code-source/github-url";
import { filterFiles } from "../../core/code-model/filter-files";
import type { SourceFile } from "../../core/code-model/types";
import { TarError, TarReader } from "./tar";

/** 저장소 읽기 제한(4e 승인 값) */
export const REPO_LIMITS = {
  /** 저장소 정보의 size(KB 단위로 알려져 있으나 문서에 단위가 없어 미리 거르는 데만 쓴다) */
  maxRepoKb: 200 * 1024,
  maxCompressedBytes: 30 * 1024 * 1024,
  maxUnpackedBytes: 300 * 1024 * 1024,
  maxEntries: 50_000,
  maxFileBytes: 1024 * 1024,
  maxKeptBytes: 20 * 1024 * 1024,
  /** 채점 스크립트(내 컴퓨터)는 항목 수 상한과 같게 둔다 */
  maxKeptFiles: 50_000,
  timeoutMs: 30_000,
};
export type RepoLimits = typeof REPO_LIMITS;

/** 서버(API)용 제한(4f 승인 값). 여러 사용자가 함께 쓰는 서버라 채점 스크립트보다 작게. 고른 뒤 상한(200개·5MB)은 API가 따로 본다 */
export const SERVER_REPO_LIMITS: RepoLimits = {
  ...REPO_LIMITS,
  maxCompressedBytes: 10 * 1024 * 1024,
  maxUnpackedBytes: 100 * 1024 * 1024,
  maxEntries: 20_000,
  maxFileBytes: 200 * 1024,
  maxKeptBytes: 5 * 1024 * 1024,
  maxKeptFiles: 2_000,
  timeoutMs: 20_000,
};

export type RepoErrorCode =
  | "not_found"
  | "private"
  | "moved"
  | "ref_not_found"
  | "subdir_not_found"
  | "too_large"
  | "rate_limited"
  | "forbidden"
  | "bad_redirect"
  | "timeout"
  | "aborted"
  | "github_error"
  | "network"
  | TarError["code"];
export type RepoError = { code: RepoErrorCode; message: string; retryAfterSec?: number };
export type RepoRead =
  | { ok: true; files: SourceFile[]; owner: string; repo: string; ref: string; commit: string | null; folder: string }
  | { ok: false; error: RepoError };

type Fetch = typeof fetch;
export type RepoReadOptions = {
  /** 없으면 process.env.GITHUB_TOKEN. 공개 저장소만 읽는 권한 없는 토큰을 쓴다. 빈 문자열이면 토큰 없이 */
  token?: string;
  fetch?: Fetch;
  limits?: Partial<RepoLimits>;
  /** 호출한 쪽의 중단 신호(API는 request.signal: 사용자가 연결을 끊으면 받기·풀기를 멈춘다) */
  signal?: AbortSignal;
};

const API = "https://api.github.com";
const CODELOAD = "codeload.github.com";
const UA = "AgentBlueprint";

/** 받은 압축 크기가 상한을 넘음(받는 중에 셈) */
class CompressedTooLarge extends Error {}

const fail = (code: RepoErrorCode, message: string, retryAfterSec?: number): RepoRead => ({ ok: false, error: { code, message, ...(retryAfterSec !== undefined ? { retryAfterSec } : {}) } });

/** 403·429 중 요청 한도에 걸린 것인지(x-ratelimit-remaining 0 또는 retry-after) 보고, 다시 시도할 시간을 알려 준다 */
function limitError(res: Response, nowSec: number): RepoRead | null {
  if (res.status !== 403 && res.status !== 429) return null;
  const retryAfter = Number(res.headers.get("retry-after"));
  const reset = Number(res.headers.get("x-ratelimit-reset"));
  const limited = res.headers.get("x-ratelimit-remaining") === "0" || Number.isFinite(retryAfter) && retryAfter > 0 || res.status === 429;
  if (!limited) return fail("forbidden", "GitHub가 요청을 거절했습니다. 잠시 뒤 다시 시도해 주세요.");
  const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : Number.isFinite(reset) && reset > 0 ? Math.max(0, reset - nowSec) : 60;
  const minutes = Math.max(1, Math.ceil(wait / 60));
  return fail("rate_limited", `GitHub 요청 한도에 걸렸습니다. ${minutes}분 뒤 다시 시도해 주세요.`, Math.ceil(wait));
}

const enc = encodeURIComponent;

export async function readGithubRepo(target: RepoTarget, options: RepoReadOptions = {}): Promise<RepoRead> {
  const limits = { ...REPO_LIMITS, ...options.limits };
  const doFetch = options.fetch ?? fetch;
  const token = options.token ?? process.env.GITHUB_TOKEN ?? "";
  const nowSec = () => Math.floor(Date.now() / 1000);
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(limits.timeoutMs)]) : AbortSignal.timeout(limits.timeoutMs);
  // 토큰은 api.github.com 요청에만 붙인다(압축 파일 받기에는 붙이지 않는다)
  const apiHeaders: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": UA, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const { owner, repo } = target;

  try {
    // 1) 저장소 정보: 공개 여부·크기·기본 브랜치
    const meta = await doFetch(`${API}/repos/${enc(owner)}/${enc(repo)}`, { headers: apiHeaders, redirect: "manual", signal });
    if (meta.status === 301 || meta.status === 302 || meta.status === 307) return fail("moved", "저장소 주소가 바뀌었습니다. GitHub에서 새 주소를 확인해 넣어 주세요.");
    if (meta.status === 404) return fail("not_found", "저장소가 없거나 공개 저장소가 아닙니다.");
    const metaLimit = limitError(meta, nowSec());
    if (metaLimit) return metaLimit;
    if (meta.status !== 200) return fail("github_error", `GitHub 응답 오류(${meta.status})입니다. 잠시 뒤 다시 시도해 주세요.`);
    const info = (await meta.json()) as { private?: unknown; visibility?: unknown; size?: unknown; default_branch?: unknown };
    if (info.private !== false || (info.visibility !== undefined && info.visibility !== "public")) return fail("private", "공개 저장소만 검사할 수 있습니다.");
    if (typeof info.size === "number" && info.size > limits.maxRepoKb) return fail("too_large", `저장소가 너무 큽니다(${Math.round(limits.maxRepoKb / 1024)}MB 초과). 하위 폴더를 지정해도 저장소 전체를 받아야 해서 검사할 수 없습니다.`);
    const ref = target.ref ?? (typeof info.default_branch === "string" ? info.default_branch : null);
    if (!ref) return fail("github_error", "기본 브랜치를 알 수 없습니다. 주소에 /tree/<브랜치>를 붙여 주세요.");

    // 2) 압축 파일 주소: api가 codeload로 보내는 주소만 따른다(같은 저장소 경로)
    const tarball = await doFetch(`${API}/repos/${enc(owner)}/${enc(repo)}/tarball/${enc(ref)}`, { headers: apiHeaders, redirect: "manual", signal });
    if (tarball.status === 404) return fail("ref_not_found", `브랜치를 찾지 못했습니다: ${ref}`);
    const tarLimit = limitError(tarball, nowSec());
    if (tarLimit) return tarLimit;
    if (tarball.status < 300 || tarball.status >= 400) return fail("github_error", `GitHub 응답 오류(${tarball.status})입니다. 잠시 뒤 다시 시도해 주세요.`);
    let location: URL;
    try {
      location = new URL(tarball.headers.get("location") ?? "");
    } catch {
      return fail("bad_redirect", "GitHub가 알 수 없는 주소로 보냈습니다.");
    }
    const samePath = location.pathname.toLowerCase().startsWith(`/${owner}/${repo}/`.toLowerCase());
    // 공개 저장소의 codeload 주소에는 쿼리가 없다(비공개 저장소면 ?token=이 붙는다)
    if (location.protocol !== "https:" || location.hostname !== CODELOAD || location.port !== "" || location.username !== "" || location.search !== "" || location.hash !== "" || !samePath) {
      return fail("bad_redirect", "GitHub가 허용하지 않은 주소로 보냈습니다.");
    }

    // 3) 받기: 토큰 없이, 더 이상의 리다이렉트 없이
    const res = await doFetch(location.toString(), { headers: { "User-Agent": UA }, redirect: "error", signal });
    if (res.status !== 200 || !res.body) return fail("github_error", `압축 파일을 받지 못했습니다(${res.status}).`);
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > limits.maxCompressedBytes) return fail("too_large", `압축 파일이 ${limits.maxCompressedBytes / (1024 * 1024)}MB를 넘습니다.`);

    // 4) 메모리에서 풀기: 맨 위 폴더(owner-repo-sha)를 폴더 이름으로 바꾸고, 업로드와 같은 거르기 규칙에 맞는 파일만 남긴다
    const sub = target.subdir;
    const folder = sub ? sub.split("/").at(-1)! : repo;
    let sawSubdir = false;
    const reader = new TarReader(limits, (raw) => {
      const rest = raw.split("/").slice(1).join("/");
      if (sub) {
        if (!rest.startsWith(`${sub}/`)) return null;
        sawSubdir = true;
      }
      const path = `${folder}/${sub ? rest.slice(sub.length + 1) : rest}`;
      return filterFiles([{ path, size: 0 }], { allowConfigFiles: true }).accepted.length ? path : null;
    });
    let compressed = 0;
    await pipeline(
      Readable.fromWeb(res.body as unknown as NodeReadableStream<Uint8Array>),
      async function* (source: AsyncIterable<Uint8Array>) {
        for await (const chunk of source) {
          compressed += chunk.length;
          if (compressed > limits.maxCompressedBytes) throw new CompressedTooLarge();
          yield chunk;
        }
      },
      createGunzip(),
      new Writable({
        write(chunk: Uint8Array, _enc, cb) {
          try {
            reader.push(chunk);
            cb();
          } catch (e) {
            cb(e as Error);
          }
        },
      }),
      { signal },
    );
    reader.end();
    if (sub && !sawSubdir) return fail("subdir_not_found", `저장소에서 하위 폴더를 찾지 못했습니다: ${sub}`);
    return { ok: true, files: reader.files, owner, repo, ref, commit: reader.commit, folder };
  } catch (e) {
    if (e instanceof CompressedTooLarge) return fail("too_large", `압축 파일이 ${limits.maxCompressedBytes / (1024 * 1024)}MB를 넘습니다.`);
    if (e instanceof TarError) return fail(e.code, `${e.message}${e.code === "file_too_large" || e.code === "kept_too_large" || e.code === "too_many_files" ? " 하위 폴더를 지정해 범위를 좁혀 보세요." : ""}`);
    if (options.signal?.aborted) return fail("aborted", "요청이 취소되어 저장소 받기를 멈췄습니다.");
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError" || signal.aborted) return fail("timeout", `저장소를 ${limits.timeoutMs / 1000}초 안에 받지 못했습니다. 하위 폴더를 지정하거나 더 작은 저장소로 시도해 주세요.`);
    if (name === "ZlibError" || (e as { code?: string })?.code?.startsWith?.("Z_")) return fail("bad_archive", "압축 파일을 풀지 못했습니다.");
    return fail("network", "GitHub에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  }
}

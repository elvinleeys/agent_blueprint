import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBlueprint as loadFixtureBlueprint, loadCode } from "../../core/impl-check/load-fixture";
import { loadBlueprint } from "../db/blueprints";
import { getProject } from "../db/projects";
import { loadLatestBlueprintRef, loadLatestExportedRevision } from "../db/prompt-exports";
import { handleImplementationCheckPost } from "./implementation-check-handler";
import { requireSession } from "./session";

vi.mock("server-only", () => ({}));
vi.mock("./session", () => ({ requireSession: vi.fn() }));
vi.mock("../db/blueprints", () => ({ loadBlueprint: vi.fn() }));
vi.mock("../db/projects", () => ({ getProject: vi.fn() }));
vi.mock("../db/prompt-exports", () => ({ loadLatestBlueprintRef: vi.fn(), loadLatestExportedRevision: vi.fn() }));

const db = {} as never;
const ID = "3f2b8c1e-9a4d-4e0b-8d7a-1c2b3a4d5e6f";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) => new Request(`http://localhost/api/projects/${ID}/implementation-check`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const files = (name = "correct") => loadCode("next", name).map(({ path, content }) => ({ path, content }));
const call = (body: unknown, id?: string) => handleImplementationCheckPost(post(body), ctx(id));
type Card = { rule: string; node: string; certainty: string };
type Body = {
  baseline: unknown;
  pairReviews: { nodeId: string; nodeName: string; reason: string; candidates: { name: string; path: string; kind: string; exported: boolean; evidence: unknown[] }[] }[];
  result: { findings: Card[]; summary: { design: { total: number; match: number; mismatch: number; review: number } } };
  meta: { timing: Record<string, number | boolean>; files: number; bytes: number; nodes: number; confirmedApplied: number; configs: { read: number; unsupported: number } };
  error?: { code?: string };
  code?: string;
};
const json = async (res: Response) => (await res.json()) as Body;

const GALLERY = { nodeId: "n-gallery", path: "src/entities/product/ui/ItemImages.tsx", name: "ItemImages" };
const MARK = "SECRET_CODE_MARKER_8841";

let info: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.mocked(requireSession).mockReset().mockResolvedValue({ ok: true, db, userId: "u1" });
  vi.mocked(getProject).mockReset().mockResolvedValue({ ok: true, data: {} as never });
  vi.mocked(loadLatestExportedRevision).mockReset().mockResolvedValue({ ok: true, data: 2 });
  vi.mocked(loadLatestBlueprintRef).mockReset().mockResolvedValue({ ok: true, data: { id: "b2", revision: 2 } });
  vi.mocked(loadBlueprint).mockReset().mockResolvedValue({ ok: true, data: loadFixtureBlueprint("next", "correct") });
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/projects/[id]/implementation-check: 접근", () => {
  it("세션이 없으면 401이고 DB를 부르지 않는다", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce({ ok: false, response: new Response("{}", { status: 401 }) });
    expect((await call({ codeFiles: files() })).status).toBe(401);
    expect(getProject).not.toHaveBeenCalled();
    expect(loadLatestExportedRevision).not.toHaveBeenCalled();
  });

  it("로그인하지 않은 요청은 본문(코드)을 읽거나 거르거나 분석하기 전에 401로 끝난다", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce({ ok: false, response: new Response("{}", { status: 401 }) });
    const req = post({ codeFiles: files() });
    expect((await handleImplementationCheckPost(req, ctx())).status).toBe(401);
    expect(req.bodyUsed).toBe(false); // 본문을 읽지도 않았다
    expect(info).not.toHaveBeenCalled();
    expect(getProject).not.toHaveBeenCalled();
    expect(loadBlueprint).not.toHaveBeenCalled();
  });

  it("uuid가 아니면 400, 남의·없는 프로젝트는 404이고 기준 판을 읽지 않는다", async () => {
    expect((await call({ codeFiles: files() }, "x")).status).toBe(400);
    vi.mocked(getProject).mockResolvedValue({ ok: false, kind: "not_found", message: "x" });
    expect((await call({ codeFiles: files() })).status).toBe(404);
    expect(loadLatestExportedRevision).not.toHaveBeenCalled();
  });

  it("DB 오류는 503", async () => {
    vi.mocked(loadLatestExportedRevision).mockResolvedValue({ ok: false, kind: "unavailable", message: "x" });
    expect((await call({ codeFiles: files() })).status).toBe(503);
  });
});

describe("기준 판", () => {
  it("지시서를 여러 번 내보냈다면 가장 최근에 내보낸 판을 쓰고, 새 판이 있으면 newerRevision을 알린다", async () => {
    vi.mocked(loadLatestExportedRevision).mockResolvedValue({ ok: true, data: 3 });
    vi.mocked(loadLatestBlueprintRef).mockResolvedValue({ ok: true, data: { id: "b5", revision: 5 } });
    const body = await json(await call({ codeFiles: files() }));
    expect(body.baseline).toEqual({ revision: 3, source: "export", newerRevision: 5 });
    expect(loadBlueprint).toHaveBeenCalledWith(db, ID, { revision: 3 });
  });

  it("내보낸 판이 최신 판이면 newerRevision이 없다", async () => {
    const body = await json(await call({ codeFiles: files() }));
    expect(body.baseline).toEqual({ revision: 2, source: "export" });
  });

  it("내보낸 적이 없으면 최신 판을 쓰고 source가 latest", async () => {
    vi.mocked(loadLatestExportedRevision).mockResolvedValue({ ok: true, data: null });
    const body = await json(await call({ codeFiles: files() }));
    expect(body.baseline).toEqual({ revision: 2, source: "latest" });
    expect(loadBlueprint).toHaveBeenCalledWith(db, ID, { revision: 2 });
  });

  it("판이 하나도 없으면 422", async () => {
    vi.mocked(loadLatestBlueprintRef).mockResolvedValue({ ok: true, data: null });
    const res = await call({ codeFiles: files() });
    expect(res.status).toBe(422);
    expect((await json(res)).error).toBeDefined();
  });

  it("HTML 프로젝트의 설계도는 422", async () => {
    const bp = loadFixtureBlueprint("next", "correct");
    vi.mocked(loadBlueprint).mockResolvedValue({ ok: true, data: { ...bp, stack: { ...bp.stack, framework: "html" } } });
    expect((await call({ codeFiles: files() })).status).toBe(422);
  });
});

describe("검사 결과", () => {
  it("올바른 코드(correct)는 200, 확실·확인 필요 0건이고 집계는 3b와 같다", async () => {
    const res = await call({ codeFiles: files() });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.result.findings).toEqual([]);
    expect(body.result.summary.design).toEqual({ total: 65, match: 65, mismatch: 0, review: 0 });
    expect(Object.keys(body)).toEqual(["baseline", "result", "pairReviews", "meta"]); // 4b에서 pairReviews를 새로 더함(기존 baseline·result·meta는 그대로)
    expect(Object.keys(body.result).sort()).toEqual(["bans", "findings", "items", "summary"]);
  });

  it("wrong-IC-03 코드는 기대한 규칙 1건(IC-03 · AddToCartButton)만 나온다", async () => {
    const body = await json(await call({ codeFiles: files("wrong-IC-03") }));
    expect(body.result.findings.map((f: Card) => `${f.rule}:${f.node}:${f.certainty}`)).toEqual(["IC-03:AddToCartButton:certain"]);
  });

  it(".ts·.tsx가 아닌 파일은 서버가 걸러낸다(결과가 같다)", async () => {
    const withExtra = [...files(), { path: "README.md", content: "# 문서" }, { path: "public/logo.svg", content: "<svg/>" }];
    const a = await json(await call({ codeFiles: files() }));
    const b = await json(await call({ codeFiles: withExtra }));
    expect(b.result).toEqual(a.result);
    expect(b.meta.files).toBe(a.meta.files);
  });
});

describe("4b에서 더한 값: pairReviews, meta.configs", () => {
  it("correct 코드는 짝 확인 필요가 없어 pairReviews가 빈 목록이다", async () => {
    expect((await json(await call({ codeFiles: files() }))).pairReviews).toEqual([]);
  });

  it("후보 코드의 이름·파일 경로·근거를 pairReviews로 낸다(결과 카드의 IC-01 pair와 nodeId로 이어진다)", async () => {
    const body = await json(await call({ codeFiles: files("renamed") }));
    const review = body.pairReviews.find((r) => r.nodeId === "n-gallery")!;
    expect(review).toMatchObject({ nodeName: "ProductGallery", reason: "candidate" });
    expect(review.candidates[0]).toMatchObject({ name: "ItemImages", path: "src/entities/product/ui/ItemImages.tsx", kind: "component", exported: true });
    expect(review.candidates[0].evidence.length).toBeGreaterThan(0);
    expect(body.result.findings.some((f) => f.rule === "IC-01" && f.node === "ProductGallery")).toBe(true);
  });

  it("pairReviews가 있어도 result는 같다(새 키를 더한 것일 뿐 3b 판정은 그대로)", async () => {
    const a = await json(await call({ codeFiles: files("renamed") }));
    expect(Object.keys(a.result).sort()).toEqual(["bans", "findings", "items", "summary"]);
  });

  it("후보를 확정하면 그 노드는 pairReviews에서 빠진다", async () => {
    const body = await json(await call({ codeFiles: files("renamed"), confirmed: [GALLERY] }));
    expect(body.pairReviews.some((r) => r.nodeId === "n-gallery")).toBe(false);
  });

  it("meta.configs: 올린 설정 파일 수와 따라가지 못한 설정 수", async () => {
    const none = await json(await call({ codeFiles: files() }));
    expect(none.meta.configs).toEqual({ read: 0, unsupported: 0 });
    const withConfig = [...files(), { path: "tsconfig.json", content: `{ "compilerOptions": { "paths": { "@x/*": ["./src/*"] } } }` }];
    expect((await json(await call({ codeFiles: withConfig }))).meta.configs).toEqual({ read: 1, unsupported: 0 });
    const broken = [...files(), { path: "tsconfig.json", content: "{ not json" }];
    expect((await json(await call({ codeFiles: broken }))).meta.configs).toEqual({ read: 0, unsupported: 1 });
    const extendsPkg = [...files(), { path: "tsconfig.json", content: `{ "extends": "@tsconfig/next/tsconfig.json" }` }];
    expect((await json(await call({ codeFiles: extendsPkg }))).meta.configs).toEqual({ read: 1, unsupported: 1 });
  });

  it("pairReviews에도 코드 내용(주석 표식)이 없다", async () => {
    const marked = files("renamed").map((f) => (f.path.endsWith("ItemImages.tsx") ? { ...f, content: `// ${MARK}\n${f.content}` } : f));
    const text = JSON.stringify(await (await call({ codeFiles: marked })).json());
    expect(text).not.toContain(MARK);
  });
});

describe("tsconfig·jsconfig", () => {
  const aliasFiles = () => loadCode("next", "alias-tsconfig").map(({ path, content }) => ({ path, content }));
  const hasConfig = (list: { path: string }[]) => list.some((f) => /tsconfig\.json$/.test(f.path));

  it("설정 파일이 든 요청은 별칭이 풀려 확실·확인 필요 0건이고, 없는 요청은 같은 코드의 판정이 달라진다", async () => {
    vi.mocked(loadBlueprint).mockResolvedValue({ ok: true, data: loadFixtureBlueprint("next", "alias-tsconfig") });
    expect(hasConfig(aliasFiles())).toBe(true);
    const withConfig = await json(await call({ codeFiles: aliasFiles() }));
    expect(withConfig.result.findings).toEqual([]);
    const without = await json(await call({ codeFiles: aliasFiles().filter((f) => !/tsconfig\.json$/.test(f.path)) }));
    expect(without.result.summary).not.toEqual(withConfig.result.summary);
  });

  it("설정 파일만 보내면 검사할 .ts·.tsx가 없어 400", async () => {
    expect((await call({ codeFiles: [{ path: "tsconfig.json", content: "{}" }] })).status).toBe(400);
  });
});

describe("요청 검증과 상한", () => {
  it("파일이 하나도 없거나 형식이 틀리거나 모르는 필드(useAi 등)가 있으면 400", async () => {
    expect((await call({ codeFiles: [{ path: "README.md", content: "x" }] })).status).toBe(400);
    expect((await call({ codeFiles: [] })).status).toBe(400);
    expect((await call({})).status).toBe(400);
    expect((await call({ codeFiles: files(), useAi: true })).status).toBe(400);
    expect((await call({ codeFiles: files(), confirmed: [{ nodeId: "x" }] })).status).toBe(400);
    expect(loadBlueprint).not.toHaveBeenCalled();
  });

  it("31개 이상이면 413", async () => {
    const many = Array.from({ length: 31 }, (_, i) => ({ path: `src/a${i}.ts`, content: "export const a = 1;" }));
    expect((await call({ codeFiles: many })).status).toBe(413);
  });

  it("파일 하나가 200KB를 넘으면 413", async () => {
    expect((await call({ codeFiles: [{ path: "src/big.ts", content: `export const a = "${"x".repeat(200 * 1024)}";` }] })).status).toBe(413);
  });

  it("합계가 1MB를 넘으면 413", async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ path: `src/b${i}.ts`, content: `export const a = "${"x".repeat(190 * 1024)}";` }));
    expect((await call({ codeFiles: six })).status).toBe(413);
  });

  it("본문이 3MB를 넘으면 413", async () => {
    expect((await call({ codeFiles: [{ path: "src/huge.ts", content: "x".repeat(3 * 1024 * 1024 + 10) }] })).status).toBe(413);
  });
});

describe("confirmed(확정한 짝)", () => {
  it("보내지 않은 요청은 후보 한 건(짝 확인 필요), 보낸 요청은 그 노드가 확실한 짝이 된다", async () => {
    const plain = await json(await call({ codeFiles: files("renamed") }));
    expect(plain.result.findings.some((f: Card) => f.rule === "IC-01" && f.node === "ProductGallery" && f.certainty === "review")).toBe(true);
    expect(plain.meta.confirmedApplied).toBe(0);
    const res = await call({ codeFiles: files("renamed"), confirmed: [GALLERY] });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.result.findings.some((f: Card) => f.rule === "IC-01" && f.node === "ProductGallery")).toBe(false);
    expect(body.result.summary.design.review).toBeLessThan(plain.result.summary.design.review);
    expect(body.meta.confirmedApplied).toBe(1);
  });

  it("빈 confirmed는 보내지 않은 것과 결과가 같다", async () => {
    const a = await json(await call({ codeFiles: files("renamed") }));
    const b = await json(await call({ codeFiles: files("renamed"), confirmed: [] }));
    expect(b.result).toEqual(a.result);
  });

  it.each([
    ["없는 노드", { ...GALLERY, nodeId: "nope" }],
    ["없는 코드", { ...GALLERY, name: "Nope" }],
    ["종류가 다름", { nodeId: "n-use-cart", path: GALLERY.path, name: GALLERY.name }],
    ["이미 확실한 짝이 있는 노드를 다른 코드로", { nodeId: "n-info", path: GALLERY.path, name: GALLERY.name }],
    ["다른 노드의 확실한 짝인 코드", { nodeId: "n-gallery", path: "src/widgets/product-info/ui/ProductInfo.tsx", name: "ProductInfo" }],
  ])("잘못된 확정(%s)은 422이고 어느 항목인지 알려 준다", async (_label, item) => {
    const res = await call({ codeFiles: files("renamed"), confirmed: [item] });
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.error?.code ?? body.code).toBe("invalid_confirmed");
    expect(JSON.stringify(body)).toContain("confirmed[0]");
  });

  it("같은 노드·같은 코드를 중복 확정하면 422", async () => {
    expect((await call({ codeFiles: files("renamed"), confirmed: [GALLERY, GALLERY] })).status).toBe(422);
    expect((await call({ codeFiles: files("renamed"), confirmed: [GALLERY, { ...GALLERY, nodeId: "n-review" }] })).status).toBe(422);
  });
});

describe("코드 내용 보호와 시간 기록", () => {
  const marked = () => files().map((f) => (f.path.endsWith("ProductInfo.tsx") ? { ...f, content: `// ${MARK}\n${f.content}` } : f));

  it("응답(성공·422)과 서버 로그 어디에도 코드 내용이 없다", async () => {
    const ok = await call({ codeFiles: marked() });
    expect(ok.status).toBe(200);
    expect(JSON.stringify(await ok.json())).not.toContain(MARK);
    const bad = await call({ codeFiles: marked(), confirmed: [{ ...GALLERY, nodeId: "nope" }] });
    expect(bad.status).toBe(422);
    expect(JSON.stringify(await bad.json())).not.toContain(MARK);
    const logged = JSON.stringify([...info.mock.calls, ...error.mock.calls]);
    expect(logged).not.toContain(MARK);
    expect(logged).toContain("implementation-check"); // 개수·시간 한 줄은 남는다
  });

  it("분석 중 예외가 나도 500 응답과 로그에 예외 메시지(코드 조각이 들어 있을 수 있음)를 넣지 않는다", async () => {
    vi.resetModules();
    vi.doMock("../../core/code-model/facts", async (orig) => ({ ...(await orig<typeof import("../../core/code-model/facts")>()), readCodeModel: () => { throw new Error(`parse error near ${MARK}`); } }));
    const { handleImplementationCheckPost: handler } = await import("./implementation-check-handler");
    const res = await handler(post({ codeFiles: files() }), ctx());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain(MARK);
    expect(JSON.stringify(error.mock.calls)).not.toContain(MARK);
    vi.doUnmock("../../core/code-model/facts");
  });

  it("서버 처리 시간을 첫 요청과 이후 요청으로 나눠 기록한다(응답 meta·Server-Timing 헤더·로그 한 줄)", async () => {
    vi.resetModules();
    const { handleImplementationCheckPost: handler } = await import("./implementation-check-handler");
    const first = await handler(post({ codeFiles: files() }), ctx());
    const second = await handler(post({ codeFiles: files() }), ctx());
    const a = await json(first);
    const b = await json(second);
    expect(a.meta.timing).toMatchObject({ requestNumber: 1, first: true });
    expect(b.meta.timing).toMatchObject({ requestNumber: 2, first: false });
    for (const t of [a.meta.timing, b.meta.timing]) {
      for (const k of ["totalMs", "dbMs", "filterMs", "parseMs", "checkMs"]) expect(typeof t[k]).toBe("number");
    }
    const header = first.headers.get("Server-Timing")!;
    expect(header).toContain(`total;dur=${a.meta.timing.totalMs}`);
    expect(header).toContain(`check;dur=${a.meta.timing.checkMs}`);
    expect(a.meta).toMatchObject({ files: expect.any(Number), bytes: expect.any(Number), nodes: 8 });
    const lines = (info.mock.calls as unknown[][]).filter((c) => c[0] === "[implementation-check]").map((c) => JSON.parse(c[1] as string) as { requestNumber: number; first: boolean });
    expect(lines.map((l) => l.requestNumber)).toEqual([1, 2]);
    expect(lines[0].first).toBe(true);
  });
});

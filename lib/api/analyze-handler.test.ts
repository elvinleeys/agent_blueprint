import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeFiles } from "../../core/cleanup/analyze";
import { UPLOAD_LIMITS } from "../../core/cleanup/filter-files";
import { handleAnalyzePost } from "./analyze-handler";
import { requireSession } from "./session";

vi.mock("server-only", () => ({}));
vi.mock("./session", () => ({ requireSession: vi.fn() }));

const post = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("http://localhost/api/analyze", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers });
const files = [
  { path: "src/ui/Button.tsx", content: `export const Button = (p: { label: string }) => <button/>;` },
  { path: "src/features/Cart.tsx", content: `export const Cart = () => <div/>;` },
];
const spec = readFileSync("core/schema/sample-design-system.json", "utf-8");
const error = async (r: Response) => ((await r.json()) as { error: { code: string; message: string } }).error;

beforeEach(() => {
  vi.mocked(requireSession).mockReset().mockResolvedValue({ ok: true, db: {} as never, userId: "u1" });
});

describe("POST /api/analyze", () => {
  it("세션이 없으면 401이고 본문을 읽지 않는다", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce({ ok: false, response: new Response("{}", { status: 401 }) });
    expect((await handleAnalyzePost(post({ files, designSystemFolder: "src/ui" }))).status).toBe(401);
  });

  it("폴더로 스펙을 만들어 분석한 결과가 순수 함수 결과와 같다", async () => {
    const res = await handleAnalyzePost(post({ files, designSystemFolder: "src/ui" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: unknown };
    const direct = analyzeFiles(files, { kind: "folder", folder: "src/ui" });
    expect(direct.ok && body.result).toEqual(direct.ok && JSON.parse(JSON.stringify(direct.result)));
  });

  it("JSON 스펙도 받는다", async () => {
    const res = await handleAnalyzePost(post({ files, specJson: spec }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { result: { specSource: string } }).result.specSource).toBe("json");
  });

  it("스펙 입력이 둘 다 있거나 둘 다 없으면 400, 모르는 필드·JSON 아님도 400", async () => {
    expect((await handleAnalyzePost(post({ files, designSystemFolder: "src/ui", specJson: spec }))).status).toBe(400);
    expect((await handleAnalyzePost(post({ files }))).status).toBe(400);
    expect((await handleAnalyzePost(post({ files, specJson: spec, extra: 1 }))).status).toBe(400);
    expect((await handleAnalyzePost(post("x", { "content-type": "text/plain" }))).status).toBe(400);
  });

  it("스펙 JSON이 틀리면 422 invalid_spec, 폴더에 컴포넌트가 없으면 422 no_official_components", async () => {
    const bad = await handleAnalyzePost(post({ files, specJson: "{}" }));
    expect(bad.status).toBe(422);
    expect((await error(bad)).code).toBe("invalid_spec");
    const none = await handleAnalyzePost(post({ files, designSystemFolder: "src/none" }));
    expect(none.status).toBe(422);
    expect((await error(none)).code).toBe("no_official_components");
  });

  it("거를 파일은 서버도 거른다(상한에 세지 않음). 분석할 파일이 없으면 400", async () => {
    const extra = Array.from({ length: 50 }, (_, i) => ({ path: `node_modules/p/${i}.tsx`, content: "x" }));
    expect((await handleAnalyzePost(post({ files: [...files, ...extra], designSystemFolder: "src/ui" }))).status).toBe(200);
    expect((await handleAnalyzePost(post({ files: extra, designSystemFolder: "src/ui" }))).status).toBe(400);
  });

  it("상한을 넘으면 413과 더 좁은 폴더 안내: 개수, 파일 크기, 합계", async () => {
    const many = Array.from({ length: UPLOAD_LIMITS.maxFiles + 1 }, (_, i) => ({ path: `src/f${i}.tsx`, content: "export const A = () => <i/>;" }));
    const r1 = await handleAnalyzePost(post({ files: many, designSystemFolder: "src" }));
    expect(r1.status).toBe(413);
    expect((await error(r1)).message).toContain("더 좁은 폴더(예: src/components/ui)를 선택하세요");

    const big = [{ path: "src/Big.tsx", content: "a".repeat(UPLOAD_LIMITS.maxFileBytes + 1) }];
    expect((await handleAnalyzePost(post({ files: big, designSystemFolder: "src" }))).status).toBe(413);

    const heavy = Array.from({ length: 11 }, (_, i) => ({ path: `src/h${i}.tsx`, content: "a".repeat(100 * 1024) }));
    expect((await handleAnalyzePost(post({ files: heavy, designSystemFolder: "src" }))).status).toBe(413);
  });

  it("요청 본문이 2MB를 넘으면 413", async () => {
    const r = await handleAnalyzePost(post({ files: [{ path: "src/A.tsx", content: "a".repeat(2 * 1024 * 1024) }], designSystemFolder: "src" }));
    expect(r.status).toBe(413);
  });

  it("응답과 오류에 코드 원본이 들어 있지 않다", async () => {
    const secret = "SECRET_BODY_TEXT";
    const res = await handleAnalyzePost(post({ files: [{ path: "src/ui/A.tsx", content: `export const A = () => <i>{"${secret}"}</i>;` }], designSystemFolder: "src/ui" }));
    expect(JSON.stringify(await res.json())).not.toContain(secret);
  });
});

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeCode } from "../../core/cleanup/analyze";
import { UPLOAD_LIMITS } from "../../core/cleanup/filter-files";
import { handleAnalyzePost } from "./analyze-handler";
import { requireSession } from "./session";

vi.mock("server-only", () => ({}));
vi.mock("./session", () => ({ requireSession: vi.fn() }));

const post = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("http://localhost/api/analyze", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers });
const codeFiles = [
  { path: "app/Button.tsx", content: `export const Button = (p: { label: string }) => <button/>;` },
  { path: "app/Cart.tsx", content: `export const Cart = () => <div/>;` },
];
const designSystemFiles = [{ path: "ds/Button.tsx", content: `export const Button = (p: { label: string }) => <button/>;` }];
const spec = readFileSync("core/schema/sample-design-system.json", "utf-8");
const error = async (r: Response) => ((await r.json()) as { error: { code: string; message: string } }).error;

beforeEach(() => {
  vi.mocked(requireSession).mockReset().mockResolvedValue({ ok: true, db: {} as never, userId: "u1" });
});

describe("POST /api/analyze", () => {
  it("세션이 없으면 401", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce({ ok: false, response: new Response("{}", { status: 401 }) });
    expect((await handleAnalyzePost(post({ codeFiles, designSystemFiles }))).status).toBe(401);
  });

  it("디자인 시스템 파일로 분석한 결과가 순수 함수 결과와 같다", async () => {
    const res = await handleAnalyzePost(post({ codeFiles, designSystemFiles }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: unknown };
    const direct = analyzeCode({ code: codeFiles, designSystem: { kind: "files", files: designSystemFiles } });
    expect(direct.ok && body.result).toEqual(direct.ok && JSON.parse(JSON.stringify(direct.result)));
  });

  it("JSON 스펙도 받는다", async () => {
    const res = await handleAnalyzePost(post({ codeFiles, specJson: spec }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { result: { specSource: string } }).result.specSource).toBe("json");
  });

  it("디자인 시스템 입력이 둘 다 있거나 둘 다 없으면 400, 모르는 필드·JSON 아님도 400", async () => {
    expect((await handleAnalyzePost(post({ codeFiles, designSystemFiles, specJson: spec }))).status).toBe(400);
    expect((await handleAnalyzePost(post({ codeFiles }))).status).toBe(400);
    expect((await handleAnalyzePost(post({ codeFiles, specJson: spec, extra: 1 }))).status).toBe(400);
    expect((await handleAnalyzePost(post({ files: codeFiles, specJson: spec }))).status).toBe(400);
    expect((await handleAnalyzePost(post("x", { "content-type": "text/plain" }))).status).toBe(400);
  });

  it("스펙 JSON이 틀리면 422 invalid_spec, 디자인 시스템 파일에 컴포넌트가 없으면 422 no_official_components", async () => {
    const bad = await handleAnalyzePost(post({ codeFiles, specJson: "{}" }));
    expect(bad.status).toBe(422);
    expect((await error(bad)).code).toBe("invalid_spec");
    const none = await handleAnalyzePost(post({ codeFiles, designSystemFiles: [{ path: "ds/x.tsx", content: "const A = () => <i/>;" }] }));
    expect(none.status).toBe(422);
    expect((await error(none)).code).toBe("no_official_components");
  });

  it("거를 파일은 서버도 거른다(상한에 세지 않음). 분석할 파일이 없으면 400이고 어느 칸인지 알린다", async () => {
    const extra = Array.from({ length: 50 }, (_, i) => ({ path: `node_modules/p/${i}.tsx`, content: "x" }));
    expect((await handleAnalyzePost(post({ codeFiles: [...codeFiles, ...extra], designSystemFiles }))).status).toBe(200);
    const noCode = await handleAnalyzePost(post({ codeFiles: extra, designSystemFiles }));
    expect(noCode.status).toBe(400);
    expect((await error(noCode)).message).toContain("검사할 코드");
    const noDs = await handleAnalyzePost(post({ codeFiles, designSystemFiles: extra }));
    expect(noDs.status).toBe(400);
    expect((await error(noDs)).message).toContain("디자인 시스템");
  });

  it("상한은 칸마다 따로: 개수, 파일 크기, 합계를 넘으면 413과 어느 칸인지·더 좁은 폴더 안내", async () => {
    const many = Array.from({ length: UPLOAD_LIMITS.maxFiles + 1 }, (_, i) => ({ path: `src/f${i}.tsx`, content: "export const A = () => <i/>;" }));
    const r1 = await handleAnalyzePost(post({ codeFiles: many, designSystemFiles }));
    expect(r1.status).toBe(413);
    const m1 = (await error(r1)).message;
    expect(m1).toContain("검사할 코드");
    expect(m1).toContain("더 좁은 폴더(예: src/components/ui)를 선택하세요");

    const r2 = await handleAnalyzePost(post({ codeFiles, designSystemFiles: many }));
    expect(r2.status).toBe(413);
    expect((await error(r2)).message).toContain("디자인 시스템");

    const big = [{ path: "src/Big.tsx", content: "a".repeat(UPLOAD_LIMITS.maxFileBytes + 1) }];
    expect((await handleAnalyzePost(post({ codeFiles: big, designSystemFiles }))).status).toBe(413);

    const heavy = Array.from({ length: 11 }, (_, i) => ({ path: `src/h${i}.tsx`, content: "a".repeat(100 * 1024) }));
    expect((await handleAnalyzePost(post({ codeFiles: heavy, designSystemFiles }))).status).toBe(413);
  });

  it("칸 하나가 상한 안이면 두 칸 합계가 1MB를 넘어도 받는다", async () => {
    const half = (name: string) => Array.from({ length: 6 }, (_, i) => ({ path: `src/${name}${i}.tsx`, content: `export const ${name}${i} = () => <i/>;${" ".repeat(150 * 1024)}` }));
    const res = await handleAnalyzePost(post({ codeFiles: half("Code"), designSystemFiles: half("Ds") }));
    expect(res.status).toBe(200);
  });

  it("요청 본문이 3MB를 넘으면 413", async () => {
    const r = await handleAnalyzePost(post({ codeFiles: [{ path: "src/A.tsx", content: "a".repeat(3 * 1024 * 1024) }], designSystemFiles }));
    expect(r.status).toBe(413);
  });

  it("응답과 오류에 코드 원본이 들어 있지 않다", async () => {
    const secret = "SECRET_BODY_TEXT";
    const res = await handleAnalyzePost(post({ codeFiles: [{ path: "app/A.tsx", content: `export const A = () => <i>{"${secret}"}</i>;` }], designSystemFiles }));
    expect(JSON.stringify(await res.json())).not.toContain(secret);
  });
});

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildExportPrompt } from "../../core/prompt/export-prompt";
import { checkBlueprint } from "../../core/rules/run";
import { loadBlueprint } from "../db/blueprints";
import { getProject } from "../db/projects";
import { loadLatestBlueprintRef, loadLatestExportContent, savePromptExport } from "../db/prompt-exports";
import { loadSpecInput, saveSpecRoute } from "../db/spec-inputs";
import { handleExportsPost } from "./exports-handler";
import { requireSession } from "./session";

vi.mock("server-only", () => ({}));
vi.mock("./session", () => ({ requireSession: vi.fn() }));
vi.mock("../db/blueprints", () => ({ loadBlueprint: vi.fn() }));
vi.mock("../db/projects", () => ({ getProject: vi.fn() }));
vi.mock("../db/prompt-exports", () => ({ loadLatestBlueprintRef: vi.fn(), loadLatestExportContent: vi.fn(), savePromptExport: vi.fn() }));
vi.mock("../db/spec-inputs", () => ({ loadSpecInput: vi.fn(), saveSpecRoute: vi.fn() }));

const db = {} as never;
const ID = "3f2b8c1e-9a4d-4e0b-8d7a-1c2b3a4d5e6f";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const blueprint = () => JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8"));
const post = (body: unknown = {}) => new Request(`http://localhost/api/projects/${ID}/exports`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const expected = (format: "prompt" | "claude_md", route: string | null = null, spec = {}) =>
  buildExportPrompt({ blueprint: blueprint(), spec, route, violations: checkBlueprint(blueprint()), format });

const order: string[] = [];
const track = <T>(name: string, value: T) => vi.fn(async () => (order.push(name), value));

beforeEach(() => {
  order.length = 0;
  vi.mocked(requireSession).mockReset().mockResolvedValue({ ok: true, db, userId: "u1" });
  vi.mocked(getProject).mockReset().mockResolvedValue({ ok: true, data: {} as never });
  vi.mocked(saveSpecRoute).mockReset().mockImplementation(track("saveRoute", { ok: true as const, data: null }));
  vi.mocked(loadLatestBlueprintRef).mockReset().mockImplementation(track("ref", { ok: true as const, data: { id: "b3", revision: 3 } }));
  vi.mocked(loadBlueprint).mockReset().mockImplementation(track("load", { ok: true as const, data: blueprint() }));
  vi.mocked(loadSpecInput).mockReset().mockImplementation(track("spec", { ok: true as const, data: { spec: {}, route: null, imageCount: 0 } }));
  vi.mocked(loadLatestExportContent).mockReset().mockImplementation(track("last", { ok: true as const, data: null }));
  vi.mocked(savePromptExport).mockReset().mockImplementation(track("export", { ok: true as const, data: null }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/projects/[id]/exports", () => {
  it("세션이 없으면 401, uuid가 아니면 400, 형식이 틀린 본문은 400이고 DB 미호출", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce({ ok: false, response: new Response("{}", { status: 401 }) });
    expect((await handleExportsPost(post(), ctx())).status).toBe(401);
    expect((await handleExportsPost(post(), ctx("x"))).status).toBe(400);
    expect((await handleExportsPost(post({ route: 1 }), ctx())).status).toBe(400);
    expect((await handleExportsPost(post({ other: 1 }), ctx())).status).toBe(400);
    expect(loadLatestBlueprintRef).not.toHaveBeenCalled();
    expect(savePromptExport).not.toHaveBeenCalled();
  });

  it("남의·없는 프로젝트는 404이고 아무것도 저장하지 않는다", async () => {
    vi.mocked(getProject).mockResolvedValue({ ok: false, kind: "not_found", message: "x" });
    expect((await handleExportsPost(post({ route: "/p" }), ctx())).status).toBe(404);
    expect(saveSpecRoute).not.toHaveBeenCalled();
    expect(savePromptExport).not.toHaveBeenCalled();
  });

  it("순서: 화면 주소 저장 → 최신 판 확인 → 판·스펙 읽기 → (형식마다) 이전 기록 비교 → 기록", async () => {
    const res = await handleExportsPost(post({ route: "/products/[id]" }), ctx());
    expect(res.status).toBe(200);
    expect(order).toEqual(["saveRoute", "ref", "load", "spec", "last", "export", "last", "export"]);
    expect(saveSpecRoute).toHaveBeenCalledWith(db, ID, "/products/[id]");
  });

  it("두 문서를 만들어 돌려주고 최신 판에 연결해 기록한다", async () => {
    vi.mocked(loadSpecInput).mockResolvedValue({ ok: true, data: { spec: { overview: "상품 상세" }, route: "/products/[id]", imageCount: 0 } });
    const body = await (await handleExportsPost(post(), ctx())).json();
    expect(body.revision).toBe(3);
    expect(body.documents.map((d: { format: string; recorded: boolean }) => [d.format, d.recorded])).toEqual([["claude_md", true], ["prompt", true]]);
    const [rule, prompt] = body.documents;
    expect(rule.content).toBe(expected("claude_md", "/products/[id]", { overview: "상품 상세" }));
    expect(prompt.content).toBe(expected("prompt", "/products/[id]", { overview: "상품 상세" }));
    expect(rule.fileName).toMatch(/\.md$/);
    expect(prompt.fileName).toMatch(/-prompt\.md$/);
    expect(vi.mocked(savePromptExport).mock.calls.map((c) => [c[1], c[2].blueprintId, c[2].format])).toEqual([[ID, "b3", "claude_md"], [ID, "b3", "prompt"]]);
    expect(saveSpecRoute).not.toHaveBeenCalled(); // route를 보내지 않으면 저장된 주소를 그대로 쓴다
  });

  it("같은 판·같은 내용이면 기록은 건너뛰되 내용은 그대로 돌려준다", async () => {
    vi.mocked(loadLatestExportContent).mockImplementation(async (_db, _id, format) => ({ ok: true, data: expected(format) }));
    const body = await (await handleExportsPost(post(), ctx())).json();
    expect(savePromptExport).not.toHaveBeenCalled();
    expect(body.documents.map((d: { recorded: boolean }) => d.recorded)).toEqual([false, false]);
    expect(body.documents[1].content).toBe(expected("prompt"));
  });

  it("한 형식만 바뀌었으면 그 형식만 기록한다", async () => {
    vi.mocked(loadLatestExportContent).mockImplementation(async (_db, _id, format) => ({ ok: true, data: format === "prompt" ? expected("prompt") : "옛 내용" }));
    await handleExportsPost(post(), ctx());
    expect(vi.mocked(savePromptExport).mock.calls.map((c) => c[2].format)).toEqual(["claude_md"]);
  });

  it("스펙 항목이 하나도 없으면(저장된 입력 없음·공백만) specEmpty true, 하나라도 있으면 false", async () => {
    expect((await (await handleExportsPost(post(), ctx())).json()).specEmpty).toBe(true);
    vi.mocked(loadSpecInput).mockResolvedValue({ ok: true, data: { spec: { overview: "  " }, route: null, imageCount: 0 } });
    expect((await (await handleExportsPost(post(), ctx())).json()).specEmpty).toBe(true);
    vi.mocked(loadSpecInput).mockResolvedValue({ ok: true, data: { spec: { overview: "상품 상세" }, route: null, imageCount: 0 } });
    expect((await (await handleExportsPost(post(), ctx())).json()).specEmpty).toBe(false);
  });

  it("주소를 null로 보내면 주소를 지우고 안내가 들어간 문서를 만든다", async () => {
    vi.mocked(loadSpecInput).mockResolvedValue({ ok: true, data: { spec: {}, route: null, imageCount: 0 } });
    expect((await handleExportsPost(post({ route: null }), ctx())).status).toBe(200);
    expect(saveSpecRoute).toHaveBeenCalledWith(db, ID, null);
  });

  it("화면 주소 저장이 거부되면(422) 지시서를 만들지도 기록하지도 않는다", async () => {
    vi.mocked(saveSpecRoute).mockResolvedValue({ ok: false, kind: "invalid_data", message: "주소", fields: [] });
    expect((await handleExportsPost(post({ route: "products" }), ctx())).status).toBe(422);
    expect(loadLatestBlueprintRef).not.toHaveBeenCalled();
    expect(savePromptExport).not.toHaveBeenCalled();
  });

  it("판이 없으면 404, 저장된 설계도가 손상됐으면 500, 기록 실패는 503이며 이후 형식은 기록하지 않는다", async () => {
    vi.mocked(loadLatestBlueprintRef).mockResolvedValueOnce({ ok: true, data: null });
    expect((await handleExportsPost(post(), ctx())).status).toBe(404);

    vi.mocked(loadBlueprint).mockResolvedValueOnce({ ok: false, kind: "invalid_data", message: "손상" });
    expect((await handleExportsPost(post(), ctx())).status).toBe(500);

    vi.mocked(savePromptExport).mockReset().mockResolvedValue({ ok: false, kind: "unavailable", message: "저장 실패" });
    expect((await handleExportsPost(post(), ctx())).status).toBe(503);
    expect(savePromptExport).toHaveBeenCalledTimes(1);
  });

  it("루트가 둘인 설계도는 422이고 기록하지 않는다", async () => {
    const bp = blueprint();
    bp.nodes[1].parentId = null;
    vi.mocked(loadBlueprint).mockResolvedValue({ ok: true, data: bp });
    expect((await handleExportsPost(post(), ctx())).status).toBe(422);
    expect(savePromptExport).not.toHaveBeenCalled();
  });
});

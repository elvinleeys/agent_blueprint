import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { BlueprintSchema } from "../../core/schema/blueprint";
import { putBlueprint, SaveError } from "./save-blueprint";

const blueprint = () => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));
const respond = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const failure = async (fetchFn: typeof fetch) => putBlueprint("p1", blueprint(), fetchFn).then(() => null, (e: unknown) => e as SaveError);

describe("putBlueprint", () => {
  it("PUT으로 설계도 JSON을 보낸다", async () => {
    const fetchFn = respond(200, { revision: 2, updatedAt: "t" });
    await putBlueprint("p1", blueprint(), fetchFn);
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/projects/p1/blueprint");
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual(blueprint());
  });

  it("401은 로그인이 필요하다고 알린다", async () => {
    const e = await failure(respond(401));
    expect(e).toBeInstanceOf(SaveError);
    expect(e).toMatchObject({ status: 401, needsLogin: true });
    expect(e!.message).toContain("로그인");
  });

  it("404·413·422는 각각 이유를 알리고 로그인 안내는 없다", async () => {
    for (const [status, word] of [[404, "찾을 수 없어"], [413, "너무 커서"], [422, "올바르지 않아"]] as const) {
      const e = await failure(respond(status));
      expect(e).toMatchObject({ status, needsLogin: false });
      expect(e!.message).toContain(word);
    }
  });

  it("그 밖의 오류는 서버 원문을 노출하지 않고 일반 문구를 쓴다", async () => {
    const e = await failure(respond(503, { error: { code: "db_unavailable", message: "connection to 10.0.0.3:5432 refused" } }));
    expect(e).toMatchObject({ status: 503, needsLogin: false });
    expect(e!.message).toBe("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    expect(e!.message).not.toContain("10.0.0.3");
  });

  it("네트워크 오류는 상태 없이 연결 확인을 안내한다", async () => {
    const e = await failure((async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch);
    expect(e).toMatchObject({ status: null, needsLogin: false });
    expect(e!.message).toContain("네트워크");
  });
});

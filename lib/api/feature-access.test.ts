import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkFeature, featureConfig, githubIdOf } from "./feature-access";

vi.mock("server-only", () => ({}));

const ON = { REPO_CHECK_ENABLED: "true", REPO_CHECK_ALLOWED_USERS: "111,222" };

/** getUser가 돌려줄 사용자(인증 서버 응답 모양)를 정한 가짜 클라이언트 */
function fakeDb(user: unknown, error: unknown = null) {
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error });
  return { db: { auth: { getUser } } as unknown as SupabaseClient, getUser };
}
const user = (identities: { provider: string; id: string }[], user_metadata: Record<string, unknown> = {}) => ({ id: "uuid-1", user_metadata, identities });

describe("기능별 환경변수", () => {
  it("repoCheck는 REPO_CHECK_ENABLED·REPO_CHECK_ALLOWED_USERS를 읽는다", () => {
    expect(featureConfig("repoCheck", ON)).toEqual({ enabled: true, allowedGithubIds: new Set(["111", "222"]) });
    expect(featureConfig("repoCheck", {}).enabled).toBe(false);
  });
});

describe("GitHub id는 identities에서만", () => {
  it("github identity의 숫자 id를 쓴다", async () => {
    expect(await githubIdOf(fakeDb(user([{ provider: "github", id: "111" }])).db)).toBe("111");
  });

  it("user_metadata의 provider_id·sub를 허용 id로 바꿔도 통과하지 못한다(identities 기준)", async () => {
    const { db } = fakeDb(user([{ provider: "github", id: "999" }], { provider_id: "111", sub: "111", user_name: "allowed-user" }));
    expect(await githubIdOf(db)).toBe("999");
    expect(await checkFeature("repoCheck", db, ON)).toBe("not_allowed");
  });

  it("github identity가 없거나 숫자가 아니거나 getUser가 실패하면 null → not_allowed", async () => {
    const cases = [
      fakeDb(user([], { provider_id: "111" })),
      fakeDb(user([{ provider: "email", id: "111" }])),
      fakeDb(user([{ provider: "github", id: "abc" }])),
      fakeDb(null, { message: "invalid jwt" }),
    ];
    for (const { db } of cases) {
      expect(await githubIdOf(db)).toBeNull();
      expect(await checkFeature("repoCheck", db, ON)).toBe("not_allowed");
    }
    const throwing = { auth: { getUser: vi.fn().mockRejectedValue(new Error("network")) } } as unknown as SupabaseClient;
    expect(await githubIdOf(throwing)).toBeNull();
  });
});

describe("checkFeature", () => {
  it("꺼져 있으면 인증 서버를 부르지 않고 disabled", async () => {
    const { db, getUser } = fakeDb(user([{ provider: "github", id: "111" }]));
    expect(await checkFeature("repoCheck", db, {})).toBe("disabled");
    expect(getUser).not.toHaveBeenCalled();
  });

  it("켜져 있고 목록에 있으면 allowed", async () => {
    expect(await checkFeature("repoCheck", fakeDb(user([{ provider: "github", id: "222" }])).db, ON)).toBe("allowed");
  });
});

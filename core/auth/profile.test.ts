import { describe, expect, it } from "vitest";
import { profileFromClaims } from "./profile";

describe("profileFromClaims", () => {
  it("GitHub 이름과 사진", () => {
    expect(profileFromClaims({ user_name: "octo", avatar_url: "https://avatars.githubusercontent.com/u/1" })).toEqual({
      name: "octo", avatarUrl: "https://avatars.githubusercontent.com/u/1", initial: "O",
    });
  });
  it("이름 우선순위와 이메일·기본값 대체", () => {
    expect(profileFromClaims({ full_name: "홍길동" }).name).toBe("홍길동");
    expect(profileFromClaims({ full_name: "홍길동" }).initial).toBe("홍");
    expect(profileFromClaims({}, "a@b.c").name).toBe("a@b.c");
    expect(profileFromClaims(undefined).name).toBe("사용자");
  });
  it("https가 아닌 사진 주소는 버린다", () => {
    expect(profileFromClaims({ name: "x", avatar_url: "javascript:alert(1)" }).avatarUrl).toBeNull();
    expect(profileFromClaims({ name: "x", avatar_url: "http://a/b.png" }).avatarUrl).toBeNull();
    expect(profileFromClaims({ name: "x", picture: "https://a/b.png" }).avatarUrl).toBe("https://a/b.png");
  });
});

import { describe, expect, it } from "vitest";
import { decideAccess, parseFeatureConfig } from "./feature-access";

describe("설정값 읽기", () => {
  it("켜짐은 정확히 true일 때만, 빈 값·오타·대문자는 꺼짐(기본값 꺼짐)", () => {
    expect(parseFeatureConfig("true", "").enabled).toBe(true);
    expect(parseFeatureConfig(" true ", "").enabled).toBe(true);
    for (const v of [undefined, "", "false", "1", "yes", "TRUE", "True"]) expect(parseFeatureConfig(v, "1").enabled).toBe(false);
  });

  it("허용 목록은 쉼표로 나눈 숫자 id만(공백 정리, 이름·빈 칸은 버림)", () => {
    expect([...parseFeatureConfig("true", " 123, 456 ,,octocat, 7a ,89").allowedGithubIds]).toEqual(["123", "456", "89"]);
    expect(parseFeatureConfig("true", undefined).allowedGithubIds.size).toBe(0);
  });
});

describe("허용 판단", () => {
  const on = parseFeatureConfig("true", "123,456");

  it("꺼져 있으면 목록에 있어도 disabled", () => {
    expect(decideAccess(parseFeatureConfig(undefined, "123"), "123")).toBe("disabled");
  });

  it("켜져 있으면 목록에 있는 id만 allowed, 그 밖·id를 모름은 not_allowed", () => {
    expect(decideAccess(on, "123")).toBe("allowed");
    expect(decideAccess(on, "999")).toBe("not_allowed");
    expect(decideAccess(on, null)).toBe("not_allowed");
    expect(decideAccess(parseFeatureConfig("true", ""), "123")).toBe("not_allowed");
  });
});

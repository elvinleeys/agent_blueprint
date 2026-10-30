import { describe, expect, it } from "vitest";
import { buildDraftForm, canDraft, isImageOnly } from "./draft-request";

const file = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });

describe("buildDraftForm", () => {
  it("projectId와 비어 있지 않은 스펙 항목·화면 주소만 담고 stack은 보내지 않는다", () => {
    const form = buildDraftForm({ projectId: "p1", spec: { overview: "상품 상세", tokens: "   ", stateData: "" }, route: " /products/[id] ", images: [] });
    expect(form.get("projectId")).toBe("p1");
    expect(JSON.parse(String(form.get("spec")))).toEqual({ overview: "상품 상세" });
    expect(form.get("route")).toBe("/products/[id]");
    expect(form.has("stack")).toBe(false);
    expect(form.has("images")).toBe(false);
    expect(form.has("imageMeta")).toBe(false);
  });

  it("화면 주소가 비어 있으면 route 필드를 보내지 않는다", () => {
    expect(buildDraftForm({ projectId: "p1", spec: { overview: "x" }, route: "  ", images: [] }).has("route")).toBe(false);
  });

  it("이미지는 같은 순서로 첨부하고 imageMeta에 원본 가로를 같은 순서로 담는다", () => {
    const form = buildDraftForm({
      projectId: "p1",
      spec: {},
      route: "",
      images: [{ file: file("a.jpg"), originalWidth: 2400 }, { file: file("b.jpg"), originalWidth: 800 }],
    });
    expect((form.getAll("images") as File[]).map((f) => f.name)).toEqual(["a.jpg", "b.jpg"]);
    expect(JSON.parse(String(form.get("imageMeta")))).toEqual([{ originalWidth: 2400 }, { originalWidth: 800 }]);
  });
});

describe("canDraft / isImageOnly", () => {
  it("항목이 모두 비고 이미지도 없으면 만들 수 없다", () => {
    expect(canDraft({}, 0)).toBe(false);
    expect(canDraft({ overview: "  ", tokens: "" }, 0)).toBe(false);
  });

  it("항목 하나만 채우거나 이미지가 1장이면 만들 수 있다", () => {
    expect(canDraft({ constraints: "x" }, 0)).toBe(true);
    expect(canDraft({}, 1)).toBe(true);
  });

  it("이미지만 있고 항목이 모두 비었을 때만 이미지 단독 안내 대상", () => {
    expect(isImageOnly({}, 1)).toBe(true);
    expect(isImageOnly({ overview: "x" }, 1)).toBe(false);
    expect(isImageOnly({}, 0)).toBe(false);
  });
});

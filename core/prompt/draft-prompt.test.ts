import { describe, expect, it } from "vitest";
import { buildDraftPrompt } from "./draft-prompt";

const stack = { framework: "next", styling: "css-modules", architecture: "fsd" } as const;
const base = { version: "1.2", imageCount: 0 } as const;

describe("buildDraftPrompt", () => {
  it("채워진 스펙 항목만 포함하고 빈 항목은 생략한다", () => {
    const { userText } = buildDraftPrompt({
      spec: { ...base, overview: "상품 상세 화면", constraints: "  " },
      stack,
    });
    expect(userText).toContain("① 화면 개요: 상품 상세 화면");
    expect(userText).not.toContain("⑦");
    expect(userText).toContain("source.hasSpec: true");
    expect(userText).toContain("source.imageCount: 0");
  });

  it("스택 값을 포함한다", () => {
    const { userText } = buildDraftPrompt({ spec: { ...base, overview: "x" }, stack });
    expect(userText).toContain("framework: next");
    expect(userText).toContain("styling: css-modules");
    expect(userText).toContain("architecture: fsd");
  });

  it("이미지만 입력하면 hasSpec false와 이미지 안내를 넣는다", () => {
    const { userText, instructions } = buildDraftPrompt({ spec: { ...base, imageCount: 1 }, stack });
    expect(userText).toContain("source.hasSpec: false");
    expect(userText).toContain("(텍스트 스펙 없음)");
    expect(userText).toContain("이미지를 첨부");
    expect(instructions).toContain("와이어프레임 이미지");
  });

  it("스택에 맞는 규칙만 지시문에 넣는다", () => {
    const fsdNext = buildDraftPrompt({ spec: { ...base, overview: "x" }, stack }).instructions;
    expect(fsdNext).toContain("FSD 형식");
    expect(fsdNext).toContain("Next.js: 훅이 아닌 모든 노드의 renderMode");

    const plain = buildDraftPrompt({
      spec: { ...base, overview: "x" },
      stack: { framework: "react", styling: "tailwind", architecture: "type-based" },
    }).instructions;
    expect(plain).not.toContain("FSD 형식");
    expect(plain).toContain("모든 노드의 renderMode는 null");
    expect(plain).toContain("utility");
  });
});

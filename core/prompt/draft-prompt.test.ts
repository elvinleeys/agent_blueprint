import { describe, expect, it } from "vitest";
import { buildDraftPrompt, DRAFT_PROMPT_VERSION, hasSpecText } from "./draft-prompt";

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

  it("v2 규칙이 지시문에 들어 있다", () => {
    const { instructions } = buildDraftPrompt({ spec: { ...base, overview: "x" }, stack });
    expect(DRAFT_PROMPT_VERSION).toBe("v3");
    expect(instructions).toContain("한국어로 쓴다");
    expect(instructions).toContain("상호작용");
    expect(instructions).toContain("state·events가 비어 있으면 안 된다");
    expect(instructions).toContain("grid 부모의 responsive에는 columns만, flex 부모의 responsive에는 direction만");
    expect(instructions).toContain("기본 layout은 데스크톱 화면 기준이고, responsive에는 태블릿(tablet)·모바일(mobile)에서 바뀌는 값만");
    expect(instructions).toContain("pages/product-detail/ui");
    expect(instructions).toContain("page 같은 이름 금지");
    expect(instructions).toContain("연속 정수이며 겹치지 않는다");
    expect(instructions).toContain("콜백 prop을 받는 노드는 그 이벤트를 events에도 포함");
    expect(instructions).toContain("화면 데이터 조회는 page 노드가 담당하는 것을 기본으로");
  });

  it("NX-03·NX-04 안내는 Next.js일 때만 넣는다", () => {
    const next = buildDraftPrompt({ spec: { ...base, overview: "x" }, stack }).instructions;
    expect(next).toContain("client 노드의 자손은 모두 client");
    expect(next).toContain("훅 노드의 부모는 renderMode가 client");

    const react = buildDraftPrompt({
      spec: { ...base, overview: "x" },
      stack: { framework: "react", styling: "css", architecture: "type-based" },
    }).instructions;
    expect(react).not.toContain("client 노드의 자손");
    expect(react).not.toContain("훅 노드의 부모는 renderMode가 client");
  });

  it("이미지가 있을 때만 값 왜곡 방지 문구를 넣는다", () => {
    const withImage = buildDraftPrompt({ spec: { ...base, imageCount: 1 }, stack }).instructions;
    expect(withImage).toContain("이미지는 영역과 배치를 파악하는 용도다");
    expect(withImage).toContain("isToken false, assumed true");

    const textOnly = buildDraftPrompt({ spec: { ...base, overview: "x" }, stack }).instructions;
    expect(textOnly).not.toContain("이미지는 영역과 배치를 파악하는 용도다");
  });

  it("원본 가로가 있는 이미지만 축소 안내를 넣는다", () => {
    const { userText } = buildDraftPrompt({
      spec: { ...base, imageCount: 2 },
      stack,
      images: [{ originalWidth: 1920 }, {}],
    });
    expect(userText).toContain("이미지 1: 원본 가로 1920px를 축소해 전달함");
    expect(userText).not.toContain("이미지 2:");
  });

  it("route 값을 사용자 메시지에 넣고, 없으면 null", () => {
    expect(buildDraftPrompt({ spec: { ...base, overview: "x" }, stack, route: "/products/[id]" }).userText).toContain("- route: /products/[id]");
    expect(buildDraftPrompt({ spec: { ...base, overview: "x" }, stack }).userText).toContain("- route: null");
  });

  it("hasSpecText는 공백만 있는 항목을 채워진 것으로 보지 않는다", () => {
    expect(hasSpecText({ ...base, overview: "  ", constraints: "" })).toBe(false);
    expect(hasSpecText({ ...base, tokens: "color.primary" })).toBe(true);
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

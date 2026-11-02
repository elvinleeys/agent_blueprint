import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlueprintSchema } from "@/core/schema/blueprint";
import { SaveQueueProvider } from "../structure/SaveQueueProvider";
import { StructureStoreProvider } from "../structure/StructureStoreProvider";
import type { StructureInit } from "../../store/structure-store";
import { COMMON_RULES_NOTE, ROUTE_HELP, errorConfirmDescription, isValidRoute, NO_BLUEPRINT_NOTE, RULES_FOLDER_NOTE, SKIP_NOTE } from "./export-notes";
import PromptPanel from "./PromptPanel";

// 서버 렌더링 스모크 테스트: 클릭·내보내기 흐름은 브라우저에서 확인한다(순서 규칙은 lib/client/run-export.test.ts)
const blueprint = BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));
const html = (init: StructureInit) =>
  renderToString(
    <StructureStoreProvider init={init}>
      <SaveQueueProvider projectId="p1">
        <PromptPanel projectId="p1" onGoStructure={() => {}} />
      </SaveQueueProvider>
    </StructureStoreProvider>,
  ).replaceAll("<!-- -->", "");

describe("PromptPanel", () => {
  it("설계도가 있으면 원본 선택(정리 계획은 비활성)·화면 주소·안내 문구·내보내기 버튼을 그린다", () => {
    const out = html({ blueprint, savedInput: { spec: {}, route: "/products/[id]", imageCount: 0 } });
    for (const t of ["설계도 (최신 판)", "디자인 시스템 정리 계획 (준비 중)", "화면 주소", "/products/[id]", RULES_FOLDER_NOTE, COMMON_RULES_NOTE, SKIP_NOTE, "내보내기"]) expect(out).toContain(t);
    expect(out).toMatch(/<input[^>]*type="radio"[^>]*disabled/);
    expect(out).not.toContain("미해결 오류가"); // 확인 창은 닫혀 있다
  });

  it("화면 주소 안내는 스택(프레임워크)마다 다르다", () => {
    for (const framework of ["next", "react", "html"] as const) {
      const bp = { ...blueprint, stack: { ...blueprint.stack, framework } };
      const out = html({ blueprint: bp, savedInput: null });
      expect(out).toContain(ROUTE_HELP[framework].replaceAll("&", "&amp;").replaceAll(">", "&gt;"));
    }
    expect(new Set(Object.values(ROUTE_HELP)).size).toBe(3);
    expect(ROUTE_HELP.next).toContain("페이지 파일 위치");
    expect(ROUTE_HELP.react).toContain(":id");
    expect(ROUTE_HELP.html).toContain("참고");
  });

  it("설계도가 없으면 구조 설계 탭 안내만 그린다", () => {
    const out = html({ blueprint: null, savedInput: null });
    expect(out).toContain(NO_BLUEPRINT_NOTE);
    expect(out).toContain("구조 설계 탭으로 이동");
    expect(out).not.toContain("화면 주소");
  });
});

describe("export-notes", () => {
  it("화면 주소 검사는 서버와 같다(빈 값 허용, /로 시작, 공백 없음, 200자 이내)", () => {
    expect(["", "/", "/products/[id]"].every(isValidRoute)).toBe(true);
    expect(["products", "/a b", "/" + "x".repeat(200)].some(isValidRoute)).toBe(false);
  });
  it("오류 확인 문구는 건수와 규칙 id(중복 없이)를 담는다", () => {
    const v = (ruleId: string) => ({ ruleId, severity: "error" as const, nodeIds: [], message: "" });
    expect(errorConfirmDescription([v("R-02"), v("R-02"), v("NX-01")])).toContain("3건 있습니다(R-02, NX-01)");
  });
});

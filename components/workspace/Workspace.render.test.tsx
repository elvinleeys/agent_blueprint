import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlueprintSchema } from "@/core/schema/blueprint";
import Workspace from "./Workspace";

// 서버 렌더링 스모크 테스트: 스토어·자동 저장 Provider를 작업공간 위로 올린 구성이 예외 없이 그려지는지,
// 구조 설계 탭이 그 Provider를 쓰는지 본다. 저장 중·실패 같은 상태 변화와 탭 전환은 서버 렌더링으로 볼 수 없어 브라우저에서 확인한다.
const blueprint = BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));
const project = { id: "p1", name: "내 프로젝트", stack: blueprint.stack, createdAt: "t", updatedAt: "t" };
const html = (init: Parameters<typeof Workspace>[0]["structureInit"]) =>
  renderToString(<Workspace initialProject={project} structureInit={init} structureLoadError={null} />).replaceAll("<!-- -->", "");

describe("Workspace", () => {
  it("설계도가 있으면 구조 설계 탭이 화면 구조·노드 편집·저장 상태 영역을 그린다", () => {
    const out = html({ blueprint, savedInput: null });
    for (const t of ["화면 구조", "노드 편집", "노드를 선택하면 여기에서 고칠 수 있습니다", "화면 미리보기", "ProductDetailPage"]) expect(out).toContain(t);
    expect(out).toContain('role="status"'); // 저장 상태 영역(항상 그려 둔다)
    expect(out).not.toContain("저장 중");
    expect(out).not.toContain("저장하지 못했습니다");
  });

  it("설계도가 없으면 안내를 그린다", () => {
    const out = html({ blueprint: null, savedInput: null });
    expect(out).toContain("아직 설계도가 없습니다");
  });

  it("이동 경로의 프로젝트 링크는 일반 링크로 그려진다(경고는 클릭할 때 붙는다)", () => {
    expect(html({ blueprint, savedInput: null })).toMatch(/<a[^>]*href="\/projects"[^>]*>프로젝트<\/a>/);
  });
});

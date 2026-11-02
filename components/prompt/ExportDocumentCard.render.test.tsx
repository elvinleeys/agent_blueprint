import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ExportDocumentCard from "./ExportDocumentCard";

const out = renderToString(<ExportDocumentCard doc={{ format: "prompt", fileName: "prompt.md", content: "본문", recorded: true }} />).replaceAll("<!-- -->", "");

describe("ExportDocumentCard", () => {
  it("복사·.md 내려받기 버튼은 제목 줄에 있고 미리보기 위에 온다", () => {
    expect(out.indexOf("복사")).toBeGreaterThan(-1);
    expect(out.indexOf("복사")).toBeLessThan(out.indexOf("<textarea"));
    expect(out.indexOf(".md 내려받기")).toBeLessThan(out.indexOf("<textarea"));
  });

  it("미리보기는 높이를 제한하고 안에서 스크롤한다", () => {
    expect(out).toMatch(/<textarea[^>]*class="[^"]*max-h-96[^"]*overflow-y-auto/);
  });
});

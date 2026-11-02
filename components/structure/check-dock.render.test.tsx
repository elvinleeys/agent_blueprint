import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { blueprint } from "@/core/rules/fixture";
import type { Blueprint } from "@/core/schema/blueprint";
import CheckDock, { dockSummary } from "./CheckDock";
import SpecForm from "./SpecForm";
import { StructureStoreProvider } from "./StructureStoreProvider";
import { ViolationsProvider } from "./ViolationsProvider";

const render = (bp: Blueprint | null, ui: ReactNode) =>
  renderToString(
    <StructureStoreProvider init={{ blueprint: bp, savedInput: null }}>
      <ViolationsProvider>{ui}</ViolationsProvider>
    </StructureStoreProvider>,
  ).replaceAll("<!-- -->", "");

describe("CheckDock", () => {
  it("접힌 채로도 오류·경고 개수가 보이고 본문은 그리지 않는다(0건도 표시)", () => {
    const out = render(blueprint([{ id: "a", responsibilities: ["1", "2", "3", "4"] }]), <CheckDock />);
    expect(out).toContain("오류 0 · 경고 1");
    expect(out).toContain('aria-expanded="false"');
    expect(out).not.toContain('id="check-dock-body"');
  });

  it("설계도가 없으면 '설계도 없음'", () => {
    expect(render(null, <CheckDock />)).toContain("설계도 없음");
  });

  it("정보는 있을 때만 붙는다", () => {
    expect(dockSummary([])).toBe("오류 0 · 경고 0");
    expect(dockSummary([{ severity: "info" }])).toBe("오류 0 · 경고 0 · 정보 1");
  });
});

describe("SpecForm 접기", () => {
  const ui = <SpecForm onGenerate={() => {}} />;
  const opens = (html: string) => (html.match(/<details[^>]*>/g) ?? []).map((d) => / open/.test(d));

  it("설계도가 있으면 화면 개요만 펼치고 나머지 6개는 접는다", () => {
    expect(opens(render(blueprint([]), ui))).toEqual([true, false, false, false, false, false, false]);
  });

  it("설계도가 없으면 7개 모두 펼친다", () => {
    expect(opens(render(null, ui))).toEqual(Array(7).fill(true));
  });
});

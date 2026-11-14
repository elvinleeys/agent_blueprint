import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeCode, type SpecSource } from "./analyze";
import type { Finding } from "./compare";
import { summarizeUpload } from "./upload-summary";
import type { SourceFile } from "../code-model/types";

// 예시 폴더 fixtures/demo-cleanup(일부러 문제를 넣음)의 기대 결과를 고정한다. 사용법은 그 폴더의 README.md
const ROOT = "fixtures/demo-cleanup";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(`${dir}/${n}`).isDirectory() ? walk(`${dir}/${n}`) : [`${dir}/${n}`]));

/** 화면에서 폴더를 올린 것과 같게 만든다: 경로는 선택한 폴더 이름부터 시작하고, 거르기·상한 검사를 거친다 */
function upload(folder: string, base = ROOT): SourceFile[] {
  const entries = walk(`${base}/${folder}`).map((p) => ({ path: p.slice(base.length + 1), size: statSync(p).size, abs: p }));
  const summary = summarizeUpload(entries, new Set());
  expect(summary.problems).toEqual([]);
  return summary.selected.map((e) => ({ path: e.path, content: readFileSync(e.abs, "utf-8") }));
}

const names = (fs: Finding[], rule: Finding["rule"], severity?: Finding["severity"]) =>
  fs
    .filter((f) => f.rule === rule && (!severity || f.severity === severity))
    .map((f) => ("component" in f ? f.component.name : f.members.map((m) => m.name).join("+")));

const run = (designSystem: SpecSource, code = upload("app")) => {
  const o = analyzeCode({ code, designSystem });
  if (!o.ok) throw new Error(`분석 실패: ${o.message}`);
  return o.result;
};

describe("fixtures/demo-cleanup: 두 칸에 각각 올렸을 때", () => {
  it("올리는 파일: 디자인 시스템 3개, 검사할 코드 8개(.tsx만, 모두 상한 안)", () => {
    expect(upload("design-system").map((f) => f.path)).toEqual(["design-system/Button.tsx", "design-system/Dialog.tsx", "design-system/Input.tsx"]);
    expect(upload("app")).toHaveLength(8);
  });

  it("디자인 시스템 폴더를 올린 경우: 경고 3(C-05 1, C-02 1, C-03 1), 정보 8(C-02 1, C-01 7)", () => {
    const r = run({ kind: "files", files: upload("design-system") });
    expect(r).toMatchObject({ specSource: "files", officialCount: 3, codeFileCount: 8, designSystemFileCount: 3, sameFiles: [], uploadedCodeFileCount: 8, partialFiles: [], failedPaths: [] });
    expect(r.summary).toMatchObject({ comparedCount: 8, internalCount: 0, unresolvedCount: 0 });

    expect(r.findings.filter((f) => f.severity === "warning")).toHaveLength(3);
    expect(r.findings.filter((f) => f.severity === "info")).toHaveLength(8);
    expect(r.findings).toHaveLength(11);

    expect(names(r.findings, "C-05")).toEqual(["Button"]);
    expect(names(r.findings, "C-03")).toEqual(["OrderSummaryForm"]);
    expect(names(r.findings, "C-02", "warning")).toEqual(["Button+ButtonPrimary"]);
    expect(names(r.findings, "C-02", "info")).toEqual(["ProductCard+ProductCardWide"]);
    // 공식 이름(Button)은 "공식 목록에 없음"에 오르지 않는다
    expect(names(r.findings, "C-01").sort()).toEqual(["ButtonPrimary", "CartPage", "OrderSummaryForm", "ProductCard", "ProductCardWide", "SiteFooter", "SiteHeader"]);
  });

  it("공식 컴포넌트가 들어간 합치기 후보는 공식 파일 위치를 가리키고, 같은 이름 구현은 공식 위치를 알린다", () => {
    const r = run({ kind: "files", files: upload("design-system") });
    const merge = r.findings.find((f) => f.rule === "C-02" && f.severity === "warning");
    expect(merge && "members" in merge && merge.members).toEqual([
      { name: "Button", path: "design-system/Button.tsx", official: true },
      { name: "ButtonPrimary", path: "app/ButtonPrimary.tsx", official: false },
    ]);
    const dup = r.findings.find((f) => f.rule === "C-05");
    expect(dup).toMatchObject({ officialPath: "design-system/Button.tsx", component: { name: "Button", path: "app/Button.tsx" } });
  });

  it("스펙 JSON을 붙여 넣은 경우: C-05는 없다. 경고 2(C-02 1, C-03 1), 정보 8", () => {
    const text = readFileSync(`${ROOT}/design-system.json`, "utf-8");
    const r = run({ kind: "json", text });
    expect(r).toMatchObject({ specSource: "json", officialCount: 3, designSystemFileCount: 0 });
    expect(r.findings.filter((f) => f.severity === "warning")).toHaveLength(2);
    expect(r.findings.filter((f) => f.severity === "info")).toHaveLength(8);
    expect(r.findings).toHaveLength(10);
    expect(names(r.findings, "C-05")).toEqual([]);
    expect(names(r.findings, "C-02", "warning")).toEqual(["Button+ButtonPrimary"]);
    expect(names(r.findings, "C-03")).toEqual(["OrderSummaryForm"]);
    expect(names(r.findings, "C-01")).toHaveLength(7);
  });

  it("JSON 스펙과 폴더로 만든 스펙은 같은 합치기·나누기 결과를 낸다(C-05만 다르다)", () => {
    const files = run({ kind: "files", files: upload("design-system") });
    const json = run({ kind: "json", text: readFileSync(`${ROOT}/design-system.json`, "utf-8") });
    const core = (fs: Finding[]) => fs.filter((f) => f.rule !== "C-05").map((f) => `${f.severity}:${f.rule}:${"component" in f ? f.component.name : f.members.map((m) => m.name).join("+")}`);
    expect(core(files.findings)).toEqual(core(json.findings));
  });

  // 브라우저는 폴더를 고르면 선택한 폴더 이름부터 경로를 준다: demo-cleanup 전체를 고르면 "demo-cleanup/design-system/Button.tsx"
  const uploadWhole = () => [...upload("app"), ...upload("design-system")].map((f) => ({ ...f, path: `demo-cleanup/${f.path}` }));

  it("디자인 시스템 칸에는 design-system, 코드 칸에는 demo-cleanup 전체: 같은 파일 3개(Button·Dialog·Input)를 모두 알리고, app/Button.tsx는 C-05로 남는다", () => {
    const r = run({ kind: "files", files: upload("design-system") }, uploadWhole());
    expect(r.sameFiles).toEqual([
      { path: "demo-cleanup/design-system/Button.tsx", designSystemPath: "design-system/Button.tsx" },
      { path: "demo-cleanup/design-system/Dialog.tsx", designSystemPath: "design-system/Dialog.tsx" },
      { path: "demo-cleanup/design-system/Input.tsx", designSystemPath: "design-system/Input.tsx" },
    ]);
    expect(r).toMatchObject({ uploadedCodeFileCount: 11, codeFileCount: 8 });
    expect(r.inferWarnings).toEqual([]);
    // 같은 파일은 중복 구현으로 잡히지 않고, 내용이 다른 app/Button.tsx만 C-05
    const c05 = r.findings.filter((f) => f.rule === "C-05");
    expect(c05).toHaveLength(1);
    expect(c05[0]).toMatchObject({ officialPath: "design-system/Button.tsx", component: { name: "Button", path: "demo-cleanup/app/Button.tsx" } });
    expect(r.findings).toHaveLength(11);
  });

  it("두 칸 모두 demo-cleanup 전체: 코드 파일이 모두 디자인 시스템 칸의 파일과 같아 비교할 코드가 없다(같은 이름 Button은 디자인 시스템 칸의 중복으로만 알린다)", () => {
    const r = run({ kind: "files", files: uploadWhole() }, uploadWhole());
    expect(r.sameFiles).toHaveLength(11);
    expect(r).toMatchObject({ uploadedCodeFileCount: 11, codeFileCount: 0, findings: [], officialCount: 10 });
    expect(r.inferWarnings).toEqual([{ kind: "duplicate-name", name: "Button", paths: ["demo-cleanup/app/Button.tsx", "demo-cleanup/design-system/Button.tsx"] }]);
  });

  it("거르기: 폴더 전체(README·JSON 포함)를 올려도 분석 대상은 .tsx뿐", () => {
    const all = walk(ROOT).map((p) => ({ path: p, size: statSync(p).size }));
    const s = summarizeUpload(all, new Set());
    expect(s.total).toBe(13);
    expect(s.accepted).toHaveLength(11);
    expect(s.rejectedByReason).toEqual({ "not-source": 2 });
  });
});

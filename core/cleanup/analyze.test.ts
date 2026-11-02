import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeFiles } from "./analyze";

const files = [
  { path: "src/ui/Button.tsx", content: `export const Button = (p: { label: string }) => <button/>;` },
  { path: "src/features/Button.tsx", content: `export const Button = (p: { label: string }) => <button/>;` },
  { path: "src/features/Cart.tsx", content: `export const Cart = () => <div/>;` },
  { path: "src/features/broken.tsx", content: `export const Ok = () => <i/>;\nexport const = <<<` },
];

describe("analyzeFiles", () => {
  it("폴더로 스펙 만들기: 공식 수·C-05·C-01·문법 오류 파일을 한 결과로", () => {
    const o = analyzeFiles(files, { kind: "folder", folder: "src/ui" });
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    const { result } = o;
    expect(result).toMatchObject({ specSource: "folder", designSystemFolder: "src/ui", officialCount: 1, fileCount: 4 });
    expect(result.findings.map((f) => f.rule)).toEqual(["C-05", "C-01", "C-01"]);
    expect(result.partialFiles.map((p) => p.path)).toEqual(["src/features/broken.tsx"]);
  });

  it("JSON 스펙: 같은 이름은 공식 구현으로 보므로 C-05가 없다", () => {
    const text = readFileSync("core/schema/sample-design-system.json", "utf-8");
    const o = analyzeFiles(files, { kind: "json", text });
    expect(o.ok).toBe(true);
    if (o.ok) {
      expect(o.result).toMatchObject({ specSource: "json", designSystemFolder: null, officialCount: 2 });
      expect(o.result.findings.some((f) => f.rule === "C-05")).toBe(false);
    }
  });

  it("스펙 JSON이 틀리면 spec_invalid와 오류 목록", () => {
    const o = analyzeFiles(files, { kind: "json", text: "{}" });
    expect(o).toMatchObject({ ok: false, reason: "spec_invalid" });
    if (!o.ok) expect(o.details.length).toBeGreaterThan(0);
  });

  it("폴더에서 내보낸 컴포넌트를 못 찾으면 no_official", () => {
    expect(analyzeFiles(files, { kind: "folder", folder: "src/none" })).toMatchObject({ ok: false, reason: "no_official" });
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeCode } from "./analyze";

const ds = [{ path: "ds/Button.tsx", content: `export const Button = (p: { label: string }) => <button/>;` }];
const code = [
  { path: "app/Button.tsx", content: `export const Button = (p: { label: string; x: string }) => <button/>;` },
  { path: "app/Cart.tsx", content: `export const Cart = () => <div/>;` },
  { path: "app/broken.tsx", content: `export const Ok = () => <i/>;\nexport const = <<<` },
];

describe("analyzeCode", () => {
  it("디자인 시스템 파일: 공식 수·C-05·C-01·문법 오류 파일을 한 결과로", () => {
    const o = analyzeCode({ code, designSystem: { kind: "files", files: ds } });
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    expect(o.result).toMatchObject({ specSource: "files", officialCount: 1, codeFileCount: 3, designSystemFileCount: 1, sameFiles: [], uploadedCodeFileCount: 3 });
    expect(o.result.findings.map((f) => f.rule)).toEqual(["C-05", "C-01", "C-01"]);
    expect(o.result.partialFiles.map((p) => p.path)).toEqual(["app/broken.tsx"]);
  });

  it("JSON 스펙: 같은 이름은 공식 구현으로 보므로 C-05가 없다", () => {
    const text = readFileSync("core/schema/sample-design-system.json", "utf-8");
    const o = analyzeCode({ code, designSystem: { kind: "json", text } });
    expect(o.ok).toBe(true);
    if (o.ok) {
      expect(o.result).toMatchObject({ specSource: "json", officialCount: 2, designSystemFileCount: 0 });
      expect(o.result.findings.some((f) => f.rule === "C-05")).toBe(false);
    }
  });

  it("두 묶음은 따로 분석한다: 경로가 같아도 섞이지 않는다", () => {
    const o = analyzeCode({
      code: [{ path: "src/Card.tsx", content: `export const Card = (p: { b: string }) => <i/>;` }],
      designSystem: { kind: "files", files: [{ path: "src/Card.tsx", content: `export const Card = (p: { a: string }) => <i/>;` }] },
    });
    expect(o.ok && o.result.findings.map((f) => f.rule)).toEqual(["C-05"]);
  });

  it("같은 폴더를 두 칸에 모두 올리면 내용이 같은 파일은 코드 쪽에서 뺀다(디자인 시스템이 중복 구현으로 잡히지 않게)", () => {
    const o = analyzeCode({ code: [...ds, ...code], designSystem: { kind: "files", files: ds } });
    expect(o.ok).toBe(true);
    if (o.ok) {
      expect(o.result.sameFiles).toEqual([{ path: "ds/Button.tsx", designSystemPath: "ds/Button.tsx" }]);
      expect(o.result.codeFileCount).toBe(3);
      expect(o.result.findings.filter((f) => f.rule === "C-05")).toHaveLength(1); // app/Button.tsx만
    }
  });

  it("경로 끝이 이어지는 같은 파일만 뺀다: 상위 폴더가 붙은 경로·경로 없는 파일은 같은 파일, 다른 위치에 복사해 둔 같은 내용은 별도 구현으로 남는다", () => {
    const one = (path: string) => analyzeCode({ code: [{ path, content: ds[0].content }], designSystem: { kind: "files", files: ds } });
    for (const same of ["my-app/ds/Button.tsx", "ds/Button.tsx", "Button.tsx", "C:\\x\\ds\\Button.tsx"]) {
      const o = one(same);
      expect(o.ok && o.result.sameFiles.length, same).toBe(1);
    }
    for (const copy of ["app/Button.tsx", "dss/Button.tsx", "ds/old/Button.tsx"]) {
      const o = one(copy);
      expect(o.ok && o.result.sameFiles.length, copy).toBe(0);
      expect(o.ok && o.result.findings.map((f) => f.rule), copy).toEqual(["C-05"]);
    }
  });

  it("스펙 JSON이 틀리면 spec_invalid와 오류 목록", () => {
    const o = analyzeCode({ code, designSystem: { kind: "json", text: "{}" } });
    expect(o).toMatchObject({ ok: false, reason: "spec_invalid" });
    if (!o.ok) expect(o.details.length).toBeGreaterThan(0);
  });

  it("디자인 시스템 파일에서 내보낸 컴포넌트를 못 찾으면 no_official", () => {
    const none = [{ path: "ds/x.tsx", content: `const A = () => <i/>; export const v = 1;` }];
    expect(analyzeCode({ code, designSystem: { kind: "files", files: none } })).toMatchObject({ ok: false, reason: "no_official" });
  });
});

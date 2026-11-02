import { describe, expect, it } from "vitest";
import { extractComponents, extractFromFile } from "./extract";

const run = (content: string, path = "components/Sample.tsx") => extractFromFile({ path, content });

describe("extractFromFile: 컴포넌트 형태", () => {
  it("함수 선언 + interface props", () => {
    const [c] = run(`
      interface ButtonProps { label: string; disabled?: boolean; onClick(): void }
      export function Button({ label }: ButtonProps) { return <button>{label}</button>; }`);
    expect(c.name).toBe("Button");
    expect(c.props).toEqual([
      { name: "label", type: "string", required: true },
      { name: "disabled", type: "boolean", required: false },
      { name: "onClick", type: "function", required: true },
    ]);
    expect(c.unresolved).toEqual([]);
  });

  it("화살표 함수 + type 별칭", () => {
    const [c] = run(`
      type CardProps = { title: string; footer?: React.ReactNode };
      export const Card = ({ title }: CardProps) => <div>{title}</div>;`);
    expect(c.name).toBe("Card");
    expect(c.props.map((p) => p.name)).toEqual(["title", "footer"]);
  });

  it("인라인 타입 리터럴", () => {
    const [c] = run(`export const Tag = (p: { text: string }) => { return <span>{p.text}</span>; };`);
    expect(c.props).toEqual([{ name: "text", type: "string", required: true }]);
  });

  it("기본 내보내기: 이름 있는 함수, 이름 없는 함수(파일 이름 사용)", () => {
    expect(run(`export default function Modal(p: { open: boolean }) { return <div/>; }`)[0].name).toBe("Modal");
    expect(run(`export default function (p: { open: boolean }) { return <div/>; }`, "ui/side-panel.tsx")[0].name).toBe("SidePanel");
    expect(run(`export default (p: { a: string }) => <i/>;`, "ui/Icon.tsx")[0].name).toBe("Icon");
  });

  it("forwardRef: 타입 인자의 props, 매개변수 타입의 props, memo 중첩, React. 접두사", () => {
    const [a] = run(`
      interface InputProps { value: string }
      export const Input = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => <input ref={ref} />);`);
    expect(a.props).toEqual([{ name: "value", type: "string", required: true }]);

    const [b] = run(`export const Box = forwardRef((p: { size?: number }, ref: any) => <div ref={ref} />);`);
    expect(b.props).toEqual([{ name: "size", type: "number", required: false }]);

    const [c] = run(`export const Row = memo(forwardRef<HTMLDivElement, { gap: number }>(function Row(p, ref) { return <div ref={ref} />; }));`);
    expect(c.name).toBe("Row");
    expect(c.props).toEqual([{ name: "gap", type: "number", required: true }]);
  });

  it("export default forwardRef(...)는 파일 이름을 쓴다", () => {
    const [c] = run(`export default forwardRef<HTMLDivElement, { a: string }>((p, ref) => <div ref={ref} />);`, "ui/panel.tsx");
    expect(c.name).toBe("Panel");
  });

  it("컴포넌트가 아닌 것은 제외: 소문자 이름, JSX 없음, 훅, 함수가 아닌 값", () => {
    expect(
      run(`
        export function useThing() { return 1; }
        export const helper = () => <div/>;
        export function Format(x: string) { return x.trim(); }
        export const Ctx = createContext(null);
        export const Constant = 5;`),
    ).toEqual([]);
  });

  it("한 파일의 여러 컴포넌트", () => {
    const names = run(`
      export function A() { return <a/>; }
      export const B = () => <b/>;
      function C() { return <c/>; }`).map((c) => c.name);
    expect(names).toEqual(["A", "B", "C"]);
  });
});

describe("extractFromFile: props 해석", () => {
  it("교차 타입과 같은 파일 interface 상속, 이름 중복은 먼저 나온 것", () => {
    const [c] = run(`
      interface Base { id: string }
      interface P extends Base { label: string }
      export const X = (p: P & { id?: number; extra: boolean }) => <div/>;`);
    expect(c.props).toEqual([
      { name: "label", type: "string", required: true }, // 자기 멤버가 먼저, 상속받은 것이 뒤
      { name: "id", type: "string", required: true },
      { name: "extra", type: "boolean", required: true },
    ]);
  });

  it("읽지 못한 타입(import, 라이브러리, 유틸리티)은 unresolved에 남는다", () => {
    const [c] = run(`
      import type { Other } from "./other";
      type P = Other & React.ComponentProps<"button"> & Omit<Foo, "a"> & { ok: string };
      export const X = (p: P) => <div/>;`);
    expect(c.props).toEqual([{ name: "ok", type: "string", required: true }]);
    expect(c.unresolved).toEqual(["Other", 'Omit<Foo, "a">']);
    expect(c.inherits).toEqual(["button"]);
  });

  it("HTML 기본 속성 상속은 unresolved가 아니라 inherits로 기록한다", () => {
    const inh = (src: string) => run(src)[0];
    expect(inh(`export const A = (p: React.ComponentPropsWithoutRef<"div"> & { a: string }) => <div/>;`)).toMatchObject({ inherits: ["div"], unresolved: [] });
    expect(inh(`export const B = (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button/>;`)).toMatchObject({ inherits: ["button"], unresolved: [] });
    expect(inh(`export const C = (p: HTMLAttributes<HTMLDivElement>) => <div/>;`)).toMatchObject({ inherits: ["div"], unresolved: [] });
    expect(inh(`export const D = (p: Omit<React.ComponentProps<"input">, "size"> & { s: number }) => <input/>;`)).toMatchObject({ inherits: ["input"], unresolved: [] });
    expect(inh(`interface P extends React.AnchorHTMLAttributes<HTMLAnchorElement> { x: string }
      export const E = (p: P) => <a/>;`)).toMatchObject({ inherits: ["a"], unresolved: [], props: [{ name: "x" }] });
    // 요소를 알 수 없는 상속(ComponentProps<T> 등)은 못 읽은 것으로 남는다
    expect(inh(`export const F = (p: React.ComponentProps<T>) => <div/>;`)).toMatchObject({ inherits: [], inheritsComponents: [], unresolved: ["React.ComponentProps<T>"] });
  });

  it("라이브러리·다른 컴포넌트 상속은 inheritsComponents에 글자 그대로 기록하고 unresolved에서 뺀다", () => {
    const [a] = run(`
      import * as DialogPrimitive from "@radix-ui/react-dialog";
      export function Dialog(p: React.ComponentProps<typeof DialogPrimitive.Root>) { return <div/>; }`);
    expect(a).toMatchObject({ inheritsComponents: ["DialogPrimitive.Root"], inherits: [], unresolved: [] });

    const [b] = run(`export const B = (p: React.ComponentPropsWithoutRef<typeof Slot> & { x: string }) => <div/>;`);
    expect(b).toMatchObject({ inheritsComponents: ["Slot"], unresolved: [], props: [{ name: "x" }] });

    const [c] = run(`export const C = (p: Omit<React.ComponentProps<typeof Base>, "size"> & ButtonHTMLAttributes<HTMLButtonElement>) => <div/>;`);
    expect(c).toMatchObject({ inheritsComponents: ["Base"], inherits: ["button"], unresolved: [] });
  });

  it("자기 자신을 가리키는 타입도 멈춘다", () => {
    const [c] = run(`
      type P = P & { a: string };
      interface Q extends Q { b: string }
      export const X = (p: P) => <div/>;
      export const Y = (p: Q) => <div/>;`);
    expect(c.props.map((p) => p.name)).toEqual(["a"]);
  });

  it("props 타입이 없으면 props는 비어 있다", () => {
    expect(run(`export const X = () => <div/>;`)[0]).toMatchObject({ props: [], unresolved: [], variants: [] });
  });
});

describe("extractFromFile: variants", () => {
  it("variant prop의 문자열 유니온 값(undefined 무시), 다른 유니온은 variants에 넣지 않는다", () => {
    const [c] = run(`
      type P = { variant?: "primary" | "outline-large" | undefined; size: "sm" | "lg" };
      export const Button = (p: P) => <button/>;`);
    expect(c.variants).toEqual(["primary", "outline-large"]);
    expect(c.props[1]).toEqual({ name: "size", type: '"sm" | "lg"', required: true });
  });

  it("리터럴이 아닌 멤버가 섞인 유니온·string은 variants가 비어 있다", () => {
    expect(run(`export const A = (p: { variant: string }) => <a/>;`)[0].variants).toEqual([]);
    expect(run(`export const B = (p: { variant: "a" | string }) => <a/>;`)[0].variants).toEqual([]);
  });

  it("같은 파일의 cva 정의에서 읽는다(VariantProps)", () => {
    const [c] = run(`
      const buttonVariants = cva("base", { variants: { variant: { default: "", "icon-sm": "" }, size: { sm: "", lg: "" } } });
      export function Button(p: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) { return <button/>; }`);
    expect(c.variants).toEqual(["default", "icon-sm"]);
    expect(c.props.map((p) => p.name)).toEqual(["variant", "size", "asChild"]);
    expect(c.unresolved).toEqual([]);
    expect(c.inherits).toEqual(["button"]);
  });

  it("다른 파일의 cva를 가리키면 variants는 비고 unresolved에 남는다", () => {
    const [c] = run(`
      import { buttonVariants } from "./b";
      export const X = (p: VariantProps<typeof buttonVariants>) => <div/>;`);
    expect(c.variants).toEqual([]);
    expect(c.unresolved).toEqual(["VariantProps<typeof buttonVariants>"]);
  });
});

describe("올린 파일 사이의 상대 경로 import 타입", () => {
  const ok = (files: Record<string, string>) =>
    extractComponents(Object.entries(files).map(([path, content]) => ({ path, content })));
  const find = (r: ReturnType<typeof ok>, name: string) => r.components.find((c) => c.name === name)!;

  it(".ts 파일의 interface·type을 따라가 props를 읽고, .ts에서는 컴포넌트를 세지 않는다", () => {
    const r = ok({
      "ui/types.ts": `export interface ButtonProps { label: string; size?: "sm" | "lg" }
        export const NotComponent = () => <i/>;`,
      "ui/Button.tsx": `import type { ButtonProps } from "./types";
        export const Button = (p: ButtonProps) => <button/>;`,
    });
    expect(r.components.map((c) => c.name)).toEqual(["Button"]);
    expect(find(r, "Button")).toMatchObject({ props: [{ name: "label" }, { name: "size" }], unresolved: [] });
  });

  it("폴더 이동(../)·index 파일·별칭 import·이어진 import를 따라간다", () => {
    const r = ok({
      "lib/base.ts": `export type Base = { id: string }`,
      "lib/index.ts": `import { Base as B } from "./base"; export type Mid = B & { mid: number }`,
      "ui/forms/Field.tsx": `import { Mid as M } from "../../lib";
        export const Field = (p: M) => <div/>;`,
    });
    expect(find(r, "Field").props.map((p) => p.name)).toEqual(["id", "mid"]);
  });

  it("variant 타입 별칭과 다른 파일의 cva를 따라간다", () => {
    const r = ok({
      "ui/v.ts": `export type Tone = "calm" | "loud";
        export const boxVariants = cva("b", { variants: { variant: { soft: "", hard: "" } } });`,
      "ui/A.tsx": `import { Tone } from "./v";
        export const A = (p: { variant: Tone }) => <i/>;`,
      "ui/B.tsx": `import { boxVariants } from "./v";
        export const B = (p: VariantProps<typeof boxVariants>) => <i/>;`,
    });
    expect(find(r, "A").variants).toEqual(["calm", "loud"]);
    expect(find(r, "B").variants).toEqual(["soft", "hard"]);
  });

  it("순환 import는 멈추고, 패키지·올리지 않은 파일의 타입은 따라가지 않아 unresolved로 남는다", () => {
    const r = ok({
      "a.ts": `import { B } from "./b"; export type A = B & { a: string }`,
      "b.ts": `import { A } from "./a"; export type B = A & { b: string }`,
      "X.tsx": `import { A } from "./a";
        import { Pkg } from "some-package";
        import { Missing } from "./not-uploaded";
        export const X = (p: A & Pkg & Missing) => <div/>;`,
    });
    expect(find(r, "X").props.map((p) => p.name).sort()).toEqual(["a", "b"]);
    // 순환으로 다시 만난 A는 더 따라가지 않고 못 읽은 것으로 남는다
    expect(find(r, "X").unresolved).toEqual(["A", "Pkg", "Missing"]);
  });

  it("파일 하나만 분석하면(extractFromFile) 다른 파일의 타입은 못 읽는다", () => {
    const [c] = extractFromFile({ path: "X.tsx", content: `import { P } from "./p"; export const X = (p: P) => <div/>;` });
    expect(c.unresolved).toEqual(["P"]);
  });

  it(".ts 파일의 문법 오류도 partialFiles로 알린다", () => {
    const r = ok({ "t.ts": `export type = {{{` });
    expect(r.partialFiles.map((p) => p.path)).toEqual(["t.ts"]);
  });
});

describe("내보냄 여부", () => {
  it("export 키워드·export {…}·export default는 내보냄, 나머지는 내부용", () => {
    const flags = Object.fromEntries(
      run(`
        export function A() { return <a/>; }
        export const B = () => <b/>;
        function C() { return <c/>; }
        const D = () => <d/>;
        const E = () => <e/>;
        function F() { return <f/>; }
        const G = () => <g/>;
        export { D, E as Renamed };
        export default F;`).map((c) => [c.name, c.exported]),
    );
    expect(flags).toEqual({ A: true, B: true, C: false, D: true, E: true, F: true, G: false });
  });

  it("export default 이름 없는 컴포넌트·forwardRef는 내보냄", () => {
    expect(run(`export default () => <i/>;`, "Icon.tsx")[0].exported).toBe(true);
    expect(run(`export default forwardRef((p: {}, r) => <i/>);`, "Icon.tsx")[0].exported).toBe(true);
  });
});

describe("extractComponents", () => {
  const broken = { path: "c/broken.tsx", content: `export const Ok = () => <a/>;\nexport const = <<< {{{` };

  it("여러 파일을 합치고 경로를 남긴다", () => {
    const { components, failedPaths, partialFiles } = extractComponents([
      { path: "a/A.tsx", content: `export const A = () => <a/>;` },
      { path: "b/B.tsx", content: `export const B = () => <b/>;` },
    ]);
    expect(components.map((c) => [c.name, c.path])).toEqual([["A", "a/A.tsx"], ["B", "b/B.tsx"]]);
    expect(failedPaths).toEqual([]);
    expect(partialFiles).toEqual([]);
  });

  it("문법 오류가 있는 파일은 읽힌 부분만 분석하고 partialFiles로 알린다", () => {
    const { components, partialFiles } = extractComponents([{ path: "a/A.tsx", content: `export const A = () => <a/>;` }, broken]);
    expect(components.map((c) => c.name)).toEqual(["A", "Ok"]);
    expect(partialFiles).toHaveLength(1);
    expect(partialFiles[0].path).toBe("c/broken.tsx");
    expect(partialFiles[0].errors.length).toBeGreaterThan(0);
    expect(partialFiles[0].errors.length).toBeLessThanOrEqual(3);
    expect(partialFiles[0].errors[0]).toMatchObject({ line: 2, message: expect.any(String) });
  });

  it("타입 오류는 문법 오류로 세지 않는다", () => {
    const { partialFiles } = extractComponents([{ path: "a.tsx", content: `const x: number = "s"; export const A = () => <a>{x}</a>;` }]);
    expect(partialFiles).toEqual([]);
  });
});

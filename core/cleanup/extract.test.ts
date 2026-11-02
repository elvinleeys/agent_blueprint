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
    expect(c.unresolved).toEqual(["Other", 'React.ComponentProps<"button">', 'Omit<Foo, "a">']);
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
    expect(c.unresolved).toEqual(['React.ComponentProps<"button">']);
  });

  it("다른 파일의 cva를 가리키면 variants는 비고 unresolved에 남는다", () => {
    const [c] = run(`
      import { buttonVariants } from "./b";
      export const X = (p: VariantProps<typeof buttonVariants>) => <div/>;`);
    expect(c.variants).toEqual([]);
    expect(c.unresolved).toEqual(["VariantProps<typeof buttonVariants>"]);
  });
});

describe("extractComponents", () => {
  it("여러 파일을 합치고 경로를 남긴다", () => {
    const { components, failedPaths } = extractComponents([
      { path: "a/A.tsx", content: `export const A = () => <a/>;` },
      { path: "b/B.tsx", content: `export const B = () => <b/>;` },
      { path: "c/broken.tsx", content: `export const = <<< {{{` },
    ]);
    expect(components.map((c) => [c.name, c.path])).toEqual([["A", "a/A.tsx"], ["B", "b/B.tsx"]]);
    expect(failedPaths).toEqual([]); // 파서가 오류를 견디므로 실패가 아니라 "컴포넌트 없음"
  });
});

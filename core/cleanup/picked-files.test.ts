import { describe, expect, it } from "vitest";
import { addPicked, pickedLabel, removePicked, type PickedMeta } from "./picked-files";

const folderFile = (path: string, size = 10): PickedMeta => ({ path, name: path.split("/").pop()!, size, lastModified: 1, hasPath: true, ordinal: 1 });
const loose = (name: string, size = 10, lastModified = 1): PickedMeta => ({ path: name, name, size, lastModified, hasPath: false, ordinal: 1 });
const paths = (l: PickedMeta[]) => l.map((x) => x.path);

describe("addPicked: 경로가 있는 파일(폴더 선택)", () => {
  it("선택할 때마다 목록에 추가된다(다른 폴더의 파일을 모을 수 있다)", () => {
    const a = addPicked([], [folderFile("ui/A.tsx"), folderFile("ui/B.tsx")]);
    const b = addPicked(a, [folderFile("app/C.tsx")]);
    expect(paths(b)).toEqual(["ui/A.tsx", "ui/B.tsx", "app/C.tsx"]);
  });

  it("같은 경로는 하나로 합친다(나중 것이 대신한다)", () => {
    const a = addPicked([], [folderFile("ui/A.tsx", 10)]);
    const b = addPicked(a, [folderFile("ui/A.tsx", 99), folderFile("ui/B.tsx")]);
    expect(paths(b)).toEqual(["ui/A.tsx", "ui/B.tsx"]);
    expect(b[0].size).toBe(99);
  });

  it("같은 선택 안에 같은 경로가 둘이어도 하나만 남는다", () => {
    expect(paths(addPicked([], [folderFile("ui/A.tsx"), folderFile("ui/A.tsx")]))).toEqual(["ui/A.tsx"]);
  });
});

describe("addPicked: 경로가 없는 파일(파일 여러 개 선택)", () => {
  it("이름·크기·수정 시각이 같으면 같은 파일로 보고 합친다", () => {
    const a = addPicked([], [loose("Button.tsx")]);
    expect(paths(addPicked(a, [loose("Button.tsx")]))).toEqual(["Button.tsx"]);
  });

  it("이름만 같고 다른 파일이면 둘 다 두되 경로를 구분한다", () => {
    const a = addPicked([], [loose("Button.tsx", 10)]);
    const b = addPicked(a, [loose("Button.tsx", 20)]);
    const c = addPicked(b, [loose("Button.tsx", 30)]);
    expect(paths(c)).toEqual(["Button.tsx", "(파일 선택 2)/Button.tsx", "(파일 선택 3)/Button.tsx"]);
    expect(c.map((x) => x.ordinal)).toEqual([1, 2, 3]);
  });

  it("구분된 파일을 다시 고르면 새로 늘지 않고 같은 항목으로 합친다", () => {
    const a = addPicked(addPicked([], [loose("Button.tsx", 10)]), [loose("Button.tsx", 20)]);
    expect(paths(addPicked(a, [loose("Button.tsx", 20)]))).toEqual(["Button.tsx", "(파일 선택 2)/Button.tsx"]);
  });

  it("지운 번호는 다음에 다시 쓴다", () => {
    const a = addPicked(addPicked([], [loose("A.tsx", 1)]), [loose("A.tsx", 2)]);
    const b = removePicked(a, "A.tsx");
    expect(paths(addPicked(b, [loose("A.tsx", 3)]))).toEqual(["(파일 선택 2)/A.tsx", "A.tsx"]);
  });

  it("경로가 있는 파일과 경로가 없는 파일은 서로 합치지 않는다", () => {
    const a = addPicked([], [folderFile("A.tsx")]);
    expect(addPicked(a, [loose("A.tsx")])).toHaveLength(2);
  });
});

describe("removePicked / pickedLabel", () => {
  it("경로로 하나만 지운다", () => {
    expect(paths(removePicked(addPicked([], [folderFile("a/A.tsx"), folderFile("b/B.tsx")]), "a/A.tsx"))).toEqual(["b/B.tsx"]);
  });

  it("경로가 없는 파일은 '경로 없음'을, 겹친 이름은 몇 번째 다른 파일인지 보인다", () => {
    const l = addPicked(addPicked([], [loose("Button.tsx", 1)]), [loose("Button.tsx", 2)]);
    expect(l.map(pickedLabel)).toEqual(["Button.tsx (경로 없음)", "Button.tsx (경로 없음, 같은 이름의 다른 파일 #2)"]);
    expect(pickedLabel(folderFile("ui/A.tsx"))).toBe("ui/A.tsx");
  });
});

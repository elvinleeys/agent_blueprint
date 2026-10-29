import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BlueprintSchema } from "../schema/blueprint";
import { stripOptionalNulls, toStrictJsonSchema } from "./strict-json-schema";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- 테스트용 변형 편의

const sample = (): Json => JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8"));

// 스키마 노드를 모두 돌며 object 노드를 모은다 (properties의 키 이름과 스키마 키워드를 혼동하지 않도록 구조대로 순회)
function objectNodes(node: Json, acc: Json[] = []): Json[] {
  if (node.properties) {
    acc.push(node);
    Object.values(node.properties).forEach((s) => objectNodes(s as Json, acc));
  }
  if (node.items) objectNodes(node.items, acc);
  node.anyOf?.forEach((s: Json) => objectNodes(s, acc));
  return acc;
}

describe("toStrictJsonSchema", () => {
  const strict = toStrictJsonSchema(BlueprintSchema) as Json;

  it("모든 객체가 additionalProperties:false이고 required가 properties 전체", () => {
    const nodes = objectNodes(strict);
    expect(nodes.length).toBeGreaterThan(5);
    for (const n of nodes) {
      expect(n.additionalProperties).toBe(false);
      expect([...n.required].sort()).toEqual(Object.keys(n.properties).sort());
    }
  });

  it("$schema·$ref 없이 인라인이다 (strictify가 $ref를 따라가지 않는 전제)", () => {
    const text = JSON.stringify(strict);
    expect(text).not.toContain("$ref");
    expect(strict.$schema).toBeUndefined();
  });

  it("선택 필드는 null 허용으로 바뀌고, 원래 nullable 필드는 그대로", () => {
    const node = strict.properties.nodes.items.properties;
    expect(node.assumedFields.anyOf).toContainEqual({ type: "null" });
    expect(node.parentId).toEqual({ type: ["string", "null"] }); // 이미 nullable이면 다시 감싸지 않는다
  });
});

describe("stripOptionalNulls", () => {
  // 모델이 strict 스키마 때문에 채워 보낼 법한 null을 선택 필드에 채운다
  function withOptionalNulls(b: Json): Json {
    for (const n of b.nodes) {
      n.assumedFields ??= null;
      n.state.forEach((s: Json) => (s.description ??= null));
      if (n.layout) {
        for (const k of ["direction", "columns", "align", "justify", "responsive"]) n.layout[k] ??= null;
        n.layout.responsive?.forEach((r: Json) => {
          r.direction ??= null;
          r.columns ??= null;
        });
      }
      if (n.style) n.style.classPattern ??= null;
    }
    return b;
  }

  it("null 채운 응답은 그대로는 거부되고, strip 후에는 원본과 같다", () => {
    const filled = withOptionalNulls(sample());
    expect(BlueprintSchema.safeParse(filled).success).toBe(false);

    const stripped = stripOptionalNulls(BlueprintSchema, filled);
    const parsed = BlueprintSchema.safeParse(stripped);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data).toEqual(BlueprintSchema.parse(sample()));
  });

  it("원래 nullable 필드(layout, placement, parentId)의 null은 유지", () => {
    const stripped = stripOptionalNulls(BlueprintSchema, withOptionalNulls(sample())) as Json;
    const gallery = stripped.nodes.find((n: Json) => n.name === "ProductGallery");
    expect(gallery.layout).toBeNull();
    expect(gallery.placement).toBeNull();
    expect(stripped.nodes[0].parentId).toBeNull();
  });
});

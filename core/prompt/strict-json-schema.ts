import { z } from "zod";

type JsonSchema = Record<string, unknown>;

const isObj = (v: unknown): v is JsonSchema => typeof v === "object" && v !== null && !Array.isArray(v);
const requiredOf = (node: JsonSchema) => new Set(Array.isArray(node.required) ? (node.required as string[]) : []);

// shortcut: $ref/$defs를 따라가지 않는다. 지금 스키마는 인라인으로 변환되며(테스트로 확인), 재사용 스키마가 생기면 보강한다.
function strictify(node: JsonSchema): JsonSchema {
  const out: JsonSchema = { ...node };
  if (isObj(node.properties)) {
    const required = requiredOf(node);
    const props: JsonSchema = {};
    for (const [key, sub] of Object.entries(node.properties)) {
      const strict = strictify(sub as JsonSchema);
      props[key] = required.has(key) ? strict : { anyOf: [strict, { type: "null" }] };
    }
    out.properties = props;
    out.required = Object.keys(props);
    out.additionalProperties = false;
  }
  if (isObj(node.items)) out.items = strictify(node.items);
  if (Array.isArray(node.anyOf)) out.anyOf = node.anyOf.map((s) => strictify(s as JsonSchema));
  return out;
}

/** OpenAI Structured Outputs(strict)용 JSON Schema. 선택 필드는 null 허용 + required로 바꾼다. */
export function toStrictJsonSchema(schema: z.ZodType): JsonSchema {
  const json = { ...(z.toJSONSchema(schema) as JsonSchema) };
  delete json.$schema;
  return strictify(json);
}

function strip(value: unknown, node: JsonSchema): unknown {
  if (!node.properties && !node.items && Array.isArray(node.anyOf)) {
    const branch = node.anyOf.find((b) => isObj(b) && ((isObj(value) && b.properties) || (Array.isArray(value) && b.items)));
    return branch ? strip(value, branch as JsonSchema) : value;
  }
  if (Array.isArray(value)) return isObj(node.items) ? value.map((v) => strip(v, node.items as JsonSchema)) : value;
  if (isObj(value) && isObj(node.properties)) {
    const required = requiredOf(node);
    const out: JsonSchema = {};
    for (const [key, v] of Object.entries(value)) {
      if (v === null && !required.has(key)) continue; // 원래 선택 필드의 null은 "없음"
      const sub = (node.properties as JsonSchema)[key];
      out[key] = isObj(sub) ? strip(v, sub) : v;
    }
    return out;
  }
  return value;
}

/** 모델 응답에서 원래 선택이던 필드의 null만 제거한다. 원래 nullable 필드(parentId, layout 등)의 null은 유지. */
export function stripOptionalNulls(schema: z.ZodType, value: unknown): unknown {
  return strip(value, z.toJSONSchema(schema) as JsonSchema);
}

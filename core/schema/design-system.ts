import { z } from "zod";

// 토큰 키는 "그룹.키" 참조 형식과 충돌하지 않게 "."을 금지한다
const TokenMap = z
  .record(z.string().min(1).refine((k) => !k.includes("."), "토큰 키에는 '.'을 쓸 수 없습니다"), z.string().min(1))
  .refine((m) => Object.keys(m).length >= 1, "키가 1개 이상이어야 합니다");

const unique = (items: string[]) => new Set(items).size === items.length;

export const DSComponentSchema = z.object({
  name: z.string().regex(/^[A-Z][A-Za-z0-9]*$/, "PascalCase여야 합니다"),
  variants: z
    .array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "소문자 kebab-case여야 합니다"))
    .refine(unique, "variant가 중복됩니다"),
  props: z
    .array(z.object({ name: z.string().min(1), type: z.string().min(1), required: z.boolean() }))
    .refine((ps) => unique(ps.map((p) => p.name)), "prop 이름이 중복됩니다"),
});

export const DesignSystemSpecSchema = z.object({
  version: z.literal("1.2"),
  components: z.array(DSComponentSchema).refine((cs) => unique(cs.map((c) => c.name)), "컴포넌트 이름이 중복됩니다"),
  // 그룹명은 설계도 토큰 참조(color.primary 등)의 앞부분과 같은 단수형
  tokens: z.object({
    color: TokenMap,
    spacing: TokenMap,
    radius: TokenMap.optional(),
    font: TokenMap.optional(),
    layout: TokenMap.optional(),
  }),
});

export type DSComponent = z.infer<typeof DSComponentSchema>;
export type DesignSystemSpec = z.infer<typeof DesignSystemSpecSchema>;

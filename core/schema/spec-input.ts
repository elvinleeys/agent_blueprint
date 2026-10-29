import { z } from "zod";

const text = z.string().optional();

export const SpecInputSchema = z
  .object({
    version: z.literal("1.2"),
    overview: text,
    tokens: text,
    layout: text,
    componentRules: text,
    stateData: text,
    accessibility: text,
    constraints: text,
    imageCount: z.number().int().min(0).max(3),
  })
  .refine(
    (s) =>
      s.imageCount > 0 ||
      [s.overview, s.tokens, s.layout, s.componentRules, s.stateData, s.accessibility, s.constraints].some(
        (v) => v && v.trim() !== "",
      ),
    { message: "스펙 7개 항목 중 1개 이상 또는 이미지 1장 이상이 필요합니다" },
  );

export type SpecInput = z.infer<typeof SpecInputSchema>;

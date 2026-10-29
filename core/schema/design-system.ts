import { z } from "zod";

const TokenMap = z.record(z.string(), z.string());

export const DSComponentSchema = z.object({
  name: z.string().min(1),
  variants: z.array(z.string()),
  props: z.array(z.object({ name: z.string(), type: z.string(), required: z.boolean() })),
});

export const DesignSystemSpecSchema = z.object({
  version: z.literal("1.2"),
  components: z.array(DSComponentSchema),
  tokens: z.object({
    colors: TokenMap,
    spacing: TokenMap,
    radius: TokenMap.optional(),
    typography: TokenMap.optional(),
  }),
});

export type DesignSystemSpec = z.infer<typeof DesignSystemSpecSchema>;

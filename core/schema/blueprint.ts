import { z } from "zod";

const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]*$/;
const HOOK_NAME = /^use[A-Z][A-Za-z0-9]*$/;
const KEBAB_PROPERTY = /^[a-z]+(-[a-z]+)*$/;
const KEBAB_DIR_SEGMENT = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FSD_SLICED = /^(pages|widgets|features|entities)\/[a-z0-9]+(-[a-z0-9]+)*\/(ui|model|api|lib|config)$/;
const FSD_SLICELESS = /^(app|shared)\/(ui|model|api|lib|config)$/;

const LAYOUT_ONLY_PROPERTIES = [
  "display",
  "flex-direction",
  "grid-template-columns",
  "gap",
  "row-gap",
  "column-gap",
  "justify-content",
  "align-items",
  "grid-column",
];

const Direction = z.enum(["row", "column"]);
const Columns = z.number().int().min(1).max(12);

// display별 direction·columns 허용 규칙 (responsive 값에도 같은 규칙 적용)
function checkDisplayFields(
  v: { display: string; direction?: string; columns?: number },
  ctx: z.RefinementCtx,
) {
  if (v.display === "flex") {
    if (!v.direction) ctx.addIssue({ code: "custom", path: ["direction"], message: "flex는 direction이 필요합니다" });
    if (v.columns !== undefined) ctx.addIssue({ code: "custom", path: ["columns"], message: "flex는 columns를 가질 수 없습니다" });
  } else if (v.display === "grid") {
    if (v.columns === undefined) ctx.addIssue({ code: "custom", path: ["columns"], message: "grid는 columns가 필요합니다" });
    if (v.direction) ctx.addIssue({ code: "custom", path: ["direction"], message: "grid는 direction을 가질 수 없습니다" });
  } else {
    if (v.direction) ctx.addIssue({ code: "custom", path: ["direction"], message: "block은 direction을 가질 수 없습니다" });
    if (v.columns !== undefined) ctx.addIssue({ code: "custom", path: ["columns"], message: "block은 columns를 가질 수 없습니다" });
  }
}

export const ResponsiveOverrideSchema = z.object({
  breakpoint: z.enum(["mobile", "tablet", "desktop"]),
  direction: Direction.optional(),
  columns: Columns.optional(),
});

export const LayoutSpecSchema = z
  .object({
    display: z.enum(["block", "flex", "grid"]),
    direction: Direction.optional(),
    columns: Columns.optional(),
    gap: z.string().nullable(),
    align: z.enum(["start", "center", "end", "stretch"]).optional(),
    justify: z.enum(["start", "center", "end", "between"]).optional(),
    responsive: z.array(ResponsiveOverrideSchema).optional(),
  })
  .superRefine((l, ctx) => {
    checkDisplayFields(l, ctx);
    // responsive: flex는 direction만, grid는 columns만
    l.responsive?.forEach((r, i) => {
      if (l.display === "flex" && r.columns !== undefined)
        ctx.addIssue({ code: "custom", path: ["responsive", i, "columns"], message: "flex의 responsive는 direction만 가질 수 있습니다" });
      if (l.display === "grid" && r.direction)
        ctx.addIssue({ code: "custom", path: ["responsive", i, "direction"], message: "grid의 responsive는 columns만 가질 수 있습니다" });
      if (l.display === "block" && (r.direction || r.columns !== undefined))
        ctx.addIssue({ code: "custom", path: ["responsive", i], message: "block은 responsive 값을 가질 수 없습니다" });
    });
  });

export const PlacementSpecSchema = z.object({
  span: z.union([z.number().int().min(1).max(12), z.literal("full")]),
});

export const StylePropertySchema = z.object({
  property: z.string().regex(KEBAB_PROPERTY, "CSS 속성은 kebab-case여야 합니다"),
  value: z.string(),
  isToken: z.boolean(),
});

export const StyleSpecSchema = z
  .object({
    scope: z.enum(["global", "module", "utility"]),
    properties: z.array(StylePropertySchema),
    ownsOuterSpacing: z.boolean(),
    classPattern: z.string().optional(),
  })
  .superRefine((s, ctx) => {
    const seen = new Set<string>();
    s.properties.forEach((p, i) => {
      if (LAYOUT_ONLY_PROPERTIES.includes(p.property))
        ctx.addIssue({ code: "custom", path: ["properties", i, "property"], message: `${p.property}는 layout·placement에 써야 합니다` });
      if (seen.has(p.property))
        ctx.addIssue({ code: "custom", path: ["properties", i, "property"], message: `${p.property}가 중복되었습니다` });
      seen.add(p.property);
    });
  });

export const StateItemSchema = z.object({ name: z.string().min(1), description: z.string().optional() });
export const PropItemSchema = z.object({ name: z.string().min(1), type: z.string().min(1) });

export const LocationSpecSchema = z.object({
  dir: z
    .string()
    .min(1)
    .refine((d) => !d.startsWith("/"), "슬래시로 시작할 수 없습니다")
    .refine((d) => d.split("/").every((s) => KEBAB_DIR_SEGMENT.test(s)), "폴더명은 kebab-case여야 합니다"),
});

export const ComponentNodeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    parentId: z.string().nullable(),
    order: z.number().int().min(0),
    location: LocationSpecSchema,
    kind: z.enum(["page", "container", "presentational", "hook"]),
    responsibilities: z.array(z.string()).max(5),
    state: z.array(StateItemSchema),
    props: z.array(PropItemSchema),
    events: z.array(z.string()),
    dataFetch: z.boolean(),
    renderMode: z.enum(["server", "client"]).nullable(),
    layout: LayoutSpecSchema.nullable(),
    placement: PlacementSpecSchema.nullable(),
    style: StyleSpecSchema.nullable(),
    assumed: z.boolean(),
    assumedFields: z.array(z.string()).optional(),
  })
  .superRefine((n, ctx) => {
    const isHook = n.kind === "hook";
    if (!(isHook ? HOOK_NAME : COMPONENT_NAME).test(n.name))
      ctx.addIssue({ code: "custom", path: ["name"], message: isHook ? "훅 이름은 use + PascalCase여야 합니다" : "컴포넌트 이름은 PascalCase여야 합니다" });
    if (isHook) {
      for (const f of ["layout", "placement", "style", "renderMode"] as const)
        if (n[f] !== null) ctx.addIssue({ code: "custom", path: [f], message: "훅은 null이어야 합니다" });
      if (n.events.length > 0) ctx.addIssue({ code: "custom", path: ["events"], message: "훅은 events가 비어 있어야 합니다" });
    }
  });

export const StackSchema = z.object({
  framework: z.enum(["html", "react", "next"]),
  styling: z.enum(["css", "css-modules", "tailwind"]),
  architecture: z.enum(["type-based", "feature-based", "fsd"]),
});

export const BlueprintSchema = z
  .object({
    version: z.literal("1.2"),
    title: z.string().min(1),
    stack: StackSchema,
    route: z.string().nullable(),
    source: z.object({ hasSpec: z.boolean(), imageCount: z.number().int().min(0).max(3) }),
    generatedBy: z.enum(["ai", "user"]),
    nodes: z.array(ComponentNodeSchema).min(1),
  })
  .superRefine((b, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    const { nodes, stack } = b;

    if (!b.source.hasSpec && b.source.imageCount === 0)
      issue(["source"], "스펙 텍스트나 이미지 중 하나는 있어야 합니다");

    const byId = new Map<string, (typeof nodes)[number]>();
    const names = new Set<string>();
    nodes.forEach((n, i) => {
      if (byId.has(n.id)) issue(["nodes", i, "id"], `id ${n.id}가 중복되었습니다`);
      if (names.has(n.name)) issue(["nodes", i, "name"], `이름 ${n.name}가 중복되었습니다`);
      byId.set(n.id, n);
      names.add(n.name);
    });

    const roots = nodes.filter((n) => n.parentId === null);
    if (roots.length !== 1) issue(["nodes"], `루트 노드는 정확히 1개여야 합니다 (현재 ${roots.length}개)`);
    else if (roots[0].order !== 0) issue(["nodes"], "루트의 order는 0이어야 합니다");

    const siblingOrders = new Set<string>();
    const hasLayoutChild = new Set<string>();
    nodes.forEach((n, i) => {
      if (n.parentId !== null) {
        const parent = byId.get(n.parentId);
        if (!parent) {
          issue(["nodes", i, "parentId"], `부모 ${n.parentId}가 존재하지 않습니다`);
        } else {
          if (parent.kind === "hook") issue(["nodes", i, "parentId"], "훅은 자식을 가질 수 없습니다");
          if (n.kind !== "hook") hasLayoutChild.add(parent.id);
          if (n.placement && parent.layout?.display !== "grid")
            issue(["nodes", i, "placement"], "placement는 부모 layout.display가 grid일 때만 쓸 수 있습니다");
          else if (n.placement && typeof n.placement.span === "number" && parent.layout?.columns !== undefined && n.placement.span > parent.layout.columns)
            issue(["nodes", i, "placement", "span"], `span은 부모 열 수(${parent.layout.columns}) 이하여야 합니다`);
        }
      }
      const key = `${n.parentId}:${n.order}`;
      if (siblingOrders.has(key)) issue(["nodes", i, "order"], "같은 부모 아래 order가 겹칩니다");
      siblingOrders.add(key);

      if (stack.framework !== "next") {
        if (n.renderMode !== null) issue(["nodes", i, "renderMode"], "Next.js가 아니면 renderMode는 null이어야 합니다");
      } else if (n.kind !== "hook" && n.renderMode === null) {
        issue(["nodes", i, "renderMode"], "Next.js에서는 renderMode가 필요합니다");
      }

      if (stack.architecture === "fsd" && !FSD_SLICED.test(n.location.dir) && !FSD_SLICELESS.test(n.location.dir))
        issue(["nodes", i, "location", "dir"], "FSD 형식(<계층>/<슬라이스>/<세그먼트>)이 아닙니다");
    });

    nodes.forEach((n, i) => {
      if (hasLayoutChild.has(n.id) && n.layout === null)
        issue(["nodes", i, "layout"], "자식 노드가 있으면 layout이 필요합니다");
    });

    // 순환 방지: 루트에서 도달 불가능한 노드는 순환 또는 고립
    if (roots.length === 1) {
      const reached = new Set<string>([roots[0].id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const n of nodes)
          if (n.parentId !== null && reached.has(n.parentId) && !reached.has(n.id)) {
            reached.add(n.id);
            grew = true;
          }
      }
      nodes.forEach((n, i) => {
        if (!reached.has(n.id)) issue(["nodes", i, "parentId"], "루트에서 연결되지 않은 노드입니다 (순환 가능성)");
      });
    }
  });

export type ComponentNode = z.infer<typeof ComponentNodeSchema>;
export type Blueprint = z.infer<typeof BlueprintSchema>;

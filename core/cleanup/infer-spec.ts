import { DesignSystemSpecSchema, DSComponentSchema, type DesignSystemSpec, type DSComponent } from "../schema/design-system";
import type { AnalyzedComponent, OfficialComponent } from "./types";

// ── 스펙 JSON 직접 입력 ────────────────────────────────────────────

export type SpecParseResult = { ok: true; spec: DesignSystemSpec } | { ok: false; errors: string[] };

/** 붙여 넣은 JSON을 스키마로 검증한다. 오류는 "경로: 이유"로 최대 10건 */
export function parseSpecJson(text: string): SpecParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["JSON 형식이 올바르지 않습니다."] };
  }
  const r = DesignSystemSpecSchema.safeParse(data);
  if (r.success) return { ok: true, spec: r.data };
  return { ok: false, errors: r.error.issues.slice(0, 10).map((i) => `${i.path.join(".") || "(최상위)"}: ${i.message}`) };
}

// ── 디자인 시스템 폴더에서 스펙 자동 생성 ──────────────────────────

const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

/** 경로가 지정한 폴더 안인가. 업로드 경로 앞에 선택한 폴더의 상위 이름이 붙어 있어도(`my-app/src/ui/A.tsx`) 폴더 이름 구간이 이어서 나오면 맞는 것으로 본다 */
export function isInFolder(path: string, folder: string): boolean {
  const f = norm(folder);
  return f !== "" && `/${norm(path)}`.includes(`/${f}/`);
}

export type InferWarning =
  | { kind: "variant-dropped"; component: string; values: string[] }
  | { kind: "duplicate-name"; name: string; paths: string[] }
  | { kind: "invalid-component"; name: string; message: string };

export type InferResult = {
  components: DSComponent[];
  /** components와 같은 순서. 비교에서 합치기 판단에 쓰도록 상속 정보를 덧붙인 것 */
  official: OfficialComponent[];
  warnings: InferWarning[];
  used: number;
  internalSkipped: number;
};

/**
 * 디자인 시스템 폴더 안에서 내보낸 컴포넌트로 공식 컴포넌트 목록을 만든다(토큰은 만들지 않음).
 * 스펙 스키마를 어기는 값은 버리고 경고로 알린다: kebab-case가 아닌 variant, 같은 이름의 중복(먼저 나온 것을 씀)
 */
export function inferComponents(analyzed: AnalyzedComponent[], folder: string): InferResult {
  const inFolder = analyzed.filter((c) => isInFolder(c.path, folder));
  const warnings: InferWarning[] = [];
  const byName = new Map<string, AnalyzedComponent[]>();
  for (const c of inFolder.filter((c) => c.exported)) byName.set(c.name, [...(byName.get(c.name) ?? []), c]);

  const components: DSComponent[] = [];
  const official: OfficialComponent[] = [];
  for (const [name, list] of byName) {
    if (list.length > 1) warnings.push({ kind: "duplicate-name", name, paths: list.map((c) => c.path) });
    const c = list[0];
    const valid = c.variants.filter((v) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v));
    const dropped = c.variants.filter((v) => !valid.includes(v));
    if (dropped.length) warnings.push({ kind: "variant-dropped", component: name, values: dropped });
    const candidate = { name, variants: valid, props: c.props.map((p) => ({ name: p.name, type: p.type || "unknown", required: p.required })) };
    const r = DSComponentSchema.safeParse(candidate);
    if (r.success) {
      components.push(r.data);
      official.push({ ...r.data, inherits: c.inherits, inheritsComponents: c.inheritsComponents });
    } else warnings.push({ kind: "invalid-component", name, message: r.error.issues[0]?.message ?? "스키마 검증 실패" });
  }
  return { components, official, warnings, used: components.length, internalSkipped: inFolder.filter((c) => !c.exported).length };
}

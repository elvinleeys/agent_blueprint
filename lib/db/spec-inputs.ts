import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { SpecInput } from "../../core/schema/spec-input";
import { fromDbError, fromZodError, type DbResult } from "./result";

export const SPEC_TEXT_KEYS = ["overview", "tokens", "layout", "componentRules", "stateData", "accessibility", "constraints"] as const;
export type SpecTexts = Partial<Record<(typeof SPEC_TEXT_KEYS)[number], string>>;

/** 작업공간에 다시 들어왔을 때 입력칸에 채울 값. 이미지는 저장하지 않으므로 개수만 있다 */
export type StoredSpecInput = { spec: SpecTexts; route: string | null; imageCount: number };

const SAVE_FAILED = "스펙 입력을 저장하지 못했습니다.";
const LOAD_FAILED = "저장된 스펙 입력을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
const COLUMNS = "overview, tokens, layout, component_rules, state_data, accessibility, constraints, route, image_count";

// 빈 입력칸은 null로 저장한다
const blank = (v: string | undefined) => (v && v.trim() !== "" ? v : null);

/** 프로젝트당 1행(project_id unique)을 덮어쓴다. 이미지 파일은 저장하지 않고 image_count만 기록한다 */
export async function saveSpecInput(db: SupabaseClient, projectId: string, input: { spec: SpecInput; route: string | null }): Promise<DbResult<null>> {
  const { spec } = input;
  const row = {
    project_id: projectId,
    version: "1.2",
    overview: blank(spec.overview),
    tokens: blank(spec.tokens),
    layout: blank(spec.layout),
    component_rules: blank(spec.componentRules),
    state_data: blank(spec.stateData),
    accessibility: blank(spec.accessibility),
    constraints: blank(spec.constraints),
    route: input.route,
    image_count: spec.imageCount,
  };
  const { error } = await db.from("spec_inputs").upsert(row, { onConflict: "project_id" });
  if (error) return fromDbError(error, SAVE_FAILED);
  return { ok: true, data: null };
}

const Text = z.string().nullable();
const RowSchema = z.object({
  overview: Text,
  tokens: Text,
  layout: Text,
  component_rules: Text,
  state_data: Text,
  accessibility: Text,
  constraints: Text,
  route: Text,
  image_count: z.number().int().min(0).max(3),
});

/** 저장된 스펙 입력 불러오기. 없으면 data가 null. 읽은 값도 검증한 뒤에만 돌려준다 */
export async function loadSpecInput(db: SupabaseClient, projectId: string): Promise<DbResult<StoredSpecInput | null>> {
  const { data, error } = await db.from("spec_inputs").select(COLUMNS).eq("project_id", projectId).maybeSingle();
  if (error) return fromDbError(error, LOAD_FAILED);
  if (!data) return { ok: true, data: null };

  const parsed = RowSchema.safeParse(data);
  if (!parsed.success) return fromZodError(parsed.error, "저장된 스펙 입력이 올바르지 않아 불러오지 못했습니다.");
  const r = parsed.data;
  const spec: SpecTexts = {};
  const values = { overview: r.overview, tokens: r.tokens, layout: r.layout, componentRules: r.component_rules, stateData: r.state_data, accessibility: r.accessibility, constraints: r.constraints };
  for (const key of SPEC_TEXT_KEYS) if (values[key] !== null) spec[key] = values[key];
  return { ok: true, data: { spec, route: r.route, imageCount: r.image_count } };
}

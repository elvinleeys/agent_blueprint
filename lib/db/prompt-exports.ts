import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fromDbError, fromZodError, type DbResult } from "./result";

export type ExportFormat = "prompt" | "claude_md";
export type LatestBlueprintRef = { id: string; revision: number };

const SAVE_FAILED = "지시서 기록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const LOAD_FAILED = "지시서 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";

const ExportInputSchema = z.object({
  blueprintId: z.string().min(1),
  format: z.enum(["prompt", "claude_md"]),
  content: z.string().min(1).max(200000), // DB check와 같은 범위
});

/** 지시서 이력 추가(수정 없음). 설계도 판과 연결해 저장한다 */
export async function savePromptExport(db: SupabaseClient, projectId: string, input: { blueprintId: string; format: ExportFormat; content: string }): Promise<DbResult<null>> {
  const parsed = ExportInputSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error, "지시서가 올바르지 않아 저장하지 않았습니다.");
  const { error } = await db.from("prompt_exports").insert({ project_id: projectId, blueprint_id: parsed.data.blueprintId, format: parsed.data.format, source_type: "blueprint", content: parsed.data.content });
  if (error) return fromDbError(error, SAVE_FAILED);
  return { ok: true, data: null };
}

/** 최신 판의 id·번호. 판이 없으면 data가 null */
export async function loadLatestBlueprintRef(db: SupabaseClient, projectId: string): Promise<DbResult<LatestBlueprintRef | null>> {
  const { data, error } = await db.from("blueprints").select("id, revision").eq("project_id", projectId).order("revision", { ascending: false }).limit(1).maybeSingle();
  if (error) return fromDbError(error, LOAD_FAILED);
  return { ok: true, data: (data as LatestBlueprintRef | null) ?? null };
}

/** 그 판에 저장된 같은 형식의 가장 최근 지시서 내용(같은 내용이면 저장을 건너뛰기 위한 비교용). 없으면 null */
export async function loadLatestExportContent(db: SupabaseClient, blueprintId: string, format: ExportFormat): Promise<DbResult<string | null>> {
  const { data, error } = await db.from("prompt_exports").select("content").eq("blueprint_id", blueprintId).eq("format", format).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return fromDbError(error, LOAD_FAILED);
  return { ok: true, data: (data as { content: string } | null)?.content ?? null };
}

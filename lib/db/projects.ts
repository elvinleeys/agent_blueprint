import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { StackSchema } from "../../core/schema/blueprint";
import { fromDbError, fromZodError, type DbResult } from "./result";

type Stack = z.infer<typeof StackSchema>;

export type Project = { id: string; name: string; stack: Stack; createdAt: string; updatedAt: string };

const COLUMNS = "id, name, framework, styling, architecture, created_at, updated_at";
export const MAX_PROJECTS = 100;

type Row = { id: string; name: string; framework: Stack["framework"]; styling: Stack["styling"]; architecture: Stack["architecture"]; created_at: string; updated_at: string };

const toProject = (r: Row): Project => ({
  id: r.id,
  name: r.name,
  stack: { framework: r.framework, styling: r.styling, architecture: r.architecture },
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** 프로젝트를 만든다. user_id는 보내지 않는다(DB가 로그인 세션의 auth.uid()로 채운다) */
export async function createProject(db: SupabaseClient, input: { name: string; stack: unknown }): Promise<DbResult<Project>> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 100)
    return { ok: false, kind: "invalid_data", message: "프로젝트 이름은 1~100자여야 합니다.", fields: [{ path: "name", message: "1~100자" }] };
  const stack = StackSchema.safeParse(input.stack);
  if (!stack.success) return fromZodError(stack.error, "스택 설정이 올바르지 않습니다.");

  const { data, error } = await db
    .from("projects")
    .insert({ name, ...stack.data })
    .select(COLUMNS)
    .single();
  if (error) return fromDbError(error, "프로젝트를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return { ok: true, data: toProject(data as Row) };
}

/** 내 프로젝트 목록(최근 수정 순). 다른 사용자의 행은 RLS가 걸러낸다 */
export async function listProjects(db: SupabaseClient): Promise<DbResult<Project[]>> {
  const { data, error } = await db.from("projects").select(COLUMNS).order("updated_at", { ascending: false }).limit(MAX_PROJECTS);
  if (error) return fromDbError(error, "프로젝트 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return { ok: true, data: (data as Row[]).map(toProject) };
}

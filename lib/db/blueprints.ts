import type { SupabaseClient } from "@supabase/supabase-js";
import { BlueprintSchema, type Blueprint } from "../../core/schema/blueprint";
import { fromDbError, fromZodError, type DbResult } from "./result";

export type RevisionInfo = { revision: number; updatedAt: string };
export type RevisionSummary = { id: string; revision: number; title: string; generatedBy: Blueprint["generatedBy"]; createdAt: string; updatedAt: string };

const SAVE_FAILED = "설계도를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const LOAD_FAILED = "설계도를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
const BLUEPRINT_COLUMNS = "version, title, stack, route, source, generated_by, nodes";

// 평면 배열 nodes를 그대로 저장한다(children 중첩 없음). project_id는 호출 쪽이 붙인다
const toPayload = (b: Blueprint) => ({ version: b.version, title: b.title, stack: b.stack, route: b.route, source: b.source, generated_by: b.generatedBy, nodes: b.nodes });

type Row = { version: string; title: string; stack: unknown; route: string | null; source: unknown; generated_by: string; nodes: unknown };

const parseRow = (r: Row) => BlueprintSchema.safeParse({ version: r.version, title: r.title, stack: r.stack, route: r.route, source: r.source, generatedBy: r.generated_by, nodes: r.nodes });

const validate = (blueprint: unknown) => BlueprintSchema.safeParse(blueprint);

/** 편집 중 자동 저장: 가장 최근 판을 갱신한다. 판이 하나도 없으면 첫 판을 만든다 */
export async function saveBlueprint(db: SupabaseClient, projectId: string, blueprint: unknown): Promise<DbResult<RevisionInfo>> {
  const parsed = validate(blueprint);
  if (!parsed.success) return fromZodError(parsed.error, "설계도가 올바르지 않아 저장하지 않았습니다.");
  const payload = toPayload(parsed.data);

  const latest = await db.from("blueprints").select("id").eq("project_id", projectId).order("revision", { ascending: false }).limit(1).maybeSingle();
  if (latest.error) return fromDbError(latest.error, SAVE_FAILED);

  const write = latest.data
    ? db.from("blueprints").update(payload).eq("id", (latest.data as { id: string }).id)
    : db.from("blueprints").insert({ project_id: projectId, ...payload });
  const { data, error } = await write.select("revision, updated_at").single();
  if (error) return fromDbError(error, SAVE_FAILED);
  const row = data as { revision: number; updated_at: string };
  return { ok: true, data: { revision: row.revision, updatedAt: row.updated_at } };
}

/** 새 판 추가: AI 초안 생성·지시서 내보내기 시점에만 쓴다. revision 번호는 DB가 매긴다 */
export async function createBlueprintRevision(db: SupabaseClient, projectId: string, blueprint: unknown): Promise<DbResult<RevisionInfo>> {
  const parsed = validate(blueprint);
  if (!parsed.success) return fromZodError(parsed.error, "설계도가 올바르지 않아 저장하지 않았습니다.");

  const { data, error } = await db.from("blueprints").insert({ project_id: projectId, ...toPayload(parsed.data) }).select("revision, updated_at").single();
  if (error) return fromDbError(error, SAVE_FAILED);
  const row = data as { revision: number; updated_at: string };
  return { ok: true, data: { revision: row.revision, updatedAt: row.updated_at } };
}

/** 설계도 불러오기. revision을 생략하면 가장 최근 판. 없으면 data가 null */
export async function loadBlueprint(db: SupabaseClient, projectId: string, options: { revision?: number } = {}): Promise<DbResult<Blueprint | null>> {
  const base = db.from("blueprints").select(BLUEPRINT_COLUMNS).eq("project_id", projectId);
  const query = options.revision === undefined ? base.order("revision", { ascending: false }).limit(1) : base.eq("revision", options.revision);
  const { data, error } = await query.maybeSingle();
  if (error) return fromDbError(error, LOAD_FAILED);
  if (!data) return { ok: true, data: null };

  // DB에서 읽은 값도 검증한 뒤에만 돌려준다
  const parsed = parseRow(data as Row);
  if (!parsed.success) return fromZodError(parsed.error, "저장된 설계도가 올바르지 않아 불러오지 못했습니다.");
  return { ok: true, data: parsed.data };
}

/** 판 삭제. 최신 판과 지시서가 연결된 판은 DB가 거부한다(conflict). 삭제된 행이 없으면 not_found */
export async function deleteBlueprintRevision(db: SupabaseClient, projectId: string, revision: number): Promise<DbResult<{ revision: number }>> {
  const { data, error } = await db.from("blueprints").delete().eq("project_id", projectId).eq("revision", revision).select("id");
  if (error) return fromDbError(error, "판을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  if (!(data as unknown[] | null)?.length) return { ok: false, kind: "not_found", message: "대상을 찾을 수 없습니다." };
  return { ok: true, data: { revision } };
}

/** 판 목록(최신 순). nodes는 제외한 요약만 돌려준다 */
export async function listBlueprintRevisions(db: SupabaseClient, projectId: string): Promise<DbResult<RevisionSummary[]>> {
  const { data, error } = await db
    .from("blueprints")
    .select("id, revision, title, generated_by, created_at, updated_at")
    .eq("project_id", projectId)
    .order("revision", { ascending: false });
  if (error) return fromDbError(error, LOAD_FAILED);
  type R = { id: string; revision: number; title: string; generated_by: Blueprint["generatedBy"]; created_at: string; updated_at: string };
  return { ok: true, data: (data as R[]).map((r) => ({ id: r.id, revision: r.revision, title: r.title, generatedBy: r.generated_by, createdAt: r.created_at, updatedAt: r.updated_at })) };
}

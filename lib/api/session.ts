import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { internalError, unauthorized } from "../ai/draft-http";
import { createClient } from "../supabase/server";
import { respond } from "./http";

export type Session = { ok: true; db: SupabaseClient; userId: string } | { ok: false; response: Response };

/** 모든 API 라우트의 첫 단계. getClaims()로 로그인을 확인하고, 없으면 401 응답을 돌려준다 */
export async function requireSession(): Promise<Session> {
  try {
    const db = await createClient();
    const { data, error } = await db.auth.getClaims();
    if (error || !data?.claims) return { ok: false, response: respond(unauthorized()) };
    return { ok: true, db, userId: data.claims.sub };
  } catch (e) {
    console.error("session check failed:", e instanceof Error ? e.name : "unknown error");
    return { ok: false, response: respond(internalError()) };
  }
}

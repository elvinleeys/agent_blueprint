import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decideAccess, parseFeatureConfig, type Access, type FeatureConfig, type FeatureId } from "../../core/auth/feature-access";

/** 기능별 서버 설정(환경변수 이름). 새 기능은 여기에 한 줄 */
const FEATURE_ENV: Record<FeatureId, { enabled: string; allowed: string }> = {
  repoCheck: { enabled: "REPO_CHECK_ENABLED", allowed: "REPO_CHECK_ALLOWED_USERS" },
};

export function featureConfig(feature: FeatureId, env: Record<string, string | undefined> = process.env): FeatureConfig {
  const names = FEATURE_ENV[feature];
  return parseFeatureConfig(env[names.enabled], env[names.allowed]);
}

/**
 * 로그인한 사용자의 GitHub 숫자 id. getUser()가 인증 서버에서 받은 identities의 github 항목만 쓴다.
 * user_metadata(provider_id 등)는 사용자가 updateUser로 바꿀 수 있어 쓰지 않는다. 확인하지 못하면 null(허용 안 함).
 */
export async function githubIdOf(db: SupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await db.auth.getUser();
    if (error || !data.user) return null;
    const id = data.user.identities?.find((i) => i.provider === "github")?.id;
    return typeof id === "string" && /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** 서버 라우트·서버 컴포넌트 공용. 꺼져 있으면 인증 서버를 부르지 않는다 */
export async function checkFeature(feature: FeatureId, db: SupabaseClient, env: Record<string, string | undefined> = process.env): Promise<Access> {
  const config = featureConfig(feature, env);
  if (!config.enabled) return "disabled";
  return decideAccess(config, await githubIdOf(db));
}

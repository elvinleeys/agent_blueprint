import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { isUuid } from "../../lib/api/http";
import { loadBlueprint } from "../../lib/db/blueprints";
import { getProject } from "../../lib/db/projects";
import { loadSpecInput } from "../../lib/db/spec-inputs";
import { createClient } from "../../lib/supabase/server";
import Workspace from "./Workspace";

// params와 세션을 읽으므로 호출하는 쪽에서 Suspense로 감싼다. Proxy를 거치지 않은 경우를 대비해 로그인도 여기서 확인한다
export default async function WorkspaceLoader({ params }: { params: Promise<{ id: string }> }) {
  // getClaims()가 토큰 만료를 Date.now()로 확인하므로, 요청 시점에 렌더링되도록 먼저 connection()을 부른다(Next.js 16 Cache Components)
  await connection();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims) redirect(`/?next=${encodeURIComponent(`/projects/${id}`)}`);

  // 없는 프로젝트와 남의 프로젝트는 구분하지 않고 같은 404로 보여 준다(RLS)
  const project = await getProject(db, id);
  if (!project.ok && project.kind === "not_found") notFound();
  if (!project.ok)
    return (
      <div role="alert" className="flex flex-col gap-2 text-sm">
        <p className="text-destructive">{project.message}</p>
        <Link href="/projects" className="text-primary hover:underline">
          프로젝트 목록으로
        </Link>
      </div>
    );

  // 최신 설계도와 저장된 스펙 입력을 서버에서 읽어 초기값으로 넘긴다. 읽기에 실패해도 작업공간은 열고 안내만 보여 준다
  const [blueprint, spec] = await Promise.all([loadBlueprint(db, id), loadSpecInput(db, id)]);
  const loadError = [blueprint, spec].find((r) => !r.ok);
  return (
    <Workspace
      initialProject={project.data}
      structureInit={{ blueprint: blueprint.ok ? blueprint.data : null, savedInput: spec.ok ? spec.data : null }}
      structureLoadError={loadError && !loadError.ok ? loadError.message : null}
    />
  );
}

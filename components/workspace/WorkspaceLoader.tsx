import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "../../lib/api/http";
import { getProject } from "../../lib/db/projects";
import { createClient } from "../../lib/supabase/server";
import Workspace from "./Workspace";

// params와 세션을 읽으므로 호출하는 쪽에서 Suspense로 감싼다. Proxy를 거치지 않은 경우를 대비해 로그인도 여기서 확인한다
export default async function WorkspaceLoader({ params }: { params: Promise<{ id: string }> }) {
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
        <p className="text-red-600">{project.message}</p>
        <Link href="/projects" className="text-indigo-600 hover:underline">
          프로젝트 목록으로
        </Link>
      </div>
    );

  return <Workspace initialProject={project.data} />;
}

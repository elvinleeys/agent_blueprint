import { redirect } from "next/navigation";
import { listProjects } from "../../lib/db/projects";
import { createClient } from "../../lib/supabase/server";
import NewProjectForm from "./NewProjectForm";
import ProjectList from "./ProjectList";

// 세션을 읽으므로 호출하는 쪽에서 Suspense로 감싼다. Proxy를 거치지 않은 경우를 대비해 여기서도 확인한다
export default async function ProjectsContent() {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims) redirect("/?next=%2Fprojects");

  const projects = await listProjects(db);
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="new-project">
        <h2 id="new-project" className="mb-3 text-lg font-semibold text-slate-900">
          새 프로젝트
        </h2>
        <NewProjectForm />
      </section>
      <section aria-labelledby="my-projects">
        <h2 id="my-projects" className="mb-3 text-lg font-semibold text-slate-900">
          내 프로젝트
        </h2>
        {projects.ok ? (
          <ProjectList projects={projects.data} />
        ) : (
          <p role="alert" className="text-sm text-red-600">
            {projects.message}
          </p>
        )}
      </section>
    </div>
  );
}

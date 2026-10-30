import { Suspense } from "react";
import AppHeader from "@/components/layout/AppHeader";
import ProjectsContent from "@/components/projects/ProjectsContent";

export default function ProjectsPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <Suspense fallback={<p className="text-sm text-foreground-tertiary">불러오는 중…</p>}>
          <ProjectsContent />
        </Suspense>
      </main>
    </>
  );
}

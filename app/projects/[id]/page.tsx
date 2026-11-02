import { Suspense } from "react";
import AppHeader from "@/components/layout/AppHeader";
import WorkspaceLoader from "@/components/workspace/WorkspaceLoader";

export default function WorkspacePage({ params }: PageProps<"/projects/[id]">) {
  return (
    // 큰 화면에서는 작업공간이 화면 높이에 맞고, 스크롤은 각 영역 안에서 한다
    <div className="flex flex-1 flex-col lg:h-dvh lg:flex-none">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-4 lg:min-h-0 lg:py-5">
        <Suspense fallback={<p className="text-sm text-foreground-tertiary">불러오는 중…</p>}>
          <WorkspaceLoader params={params} />
        </Suspense>
      </main>
    </div>
  );
}

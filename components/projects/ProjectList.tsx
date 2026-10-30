import Link from "next/link";
import type { Project } from "../../lib/db/projects";
import { stackSummary } from "./stack-labels";

export default function ProjectList({ projects }: { projects: Project[] }) {
  if (projects.length === 0) return <p className="text-sm text-foreground-tertiary">아직 프로젝트가 없습니다. 위에서 새 프로젝트를 만들어 보세요.</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {projects.map((p) => (
        <li key={p.id}>
          <Link href={`/projects/${p.id}`} className="block rounded-lg border border-border bg-background p-4 hover:border-primary">
            <h3 className="truncate text-base font-semibold text-foreground">{p.name}</h3>
            <p className="mt-1 text-sm text-foreground-secondary">{stackSummary(p.stack)}</p>
            <p className="mt-2 text-xs text-foreground-tertiary">수정 {p.updatedAt.slice(0, 10)}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

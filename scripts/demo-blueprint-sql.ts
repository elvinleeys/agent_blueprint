// 구현 검사 화면 시연용: 예시 설계도(상품 상세)를 이미 만든 프로젝트에 넣는 SQL을 출력한다.
//   npm run demo:sql -- <프로젝트 id>
// 출력된 SQL을 Supabase 대시보드 SQL 편집기에 붙여넣어 실행한다(docs/db-migration.md와 같은 방식). 이 스크립트는 DB에 접속하지 않고 비밀값도 쓰지 않는다.
// 설계도는 fixtures/implementation-check/next/blueprint.json(core/schema/sample-blueprint.json 기반 상품 상세, Next.js + Tailwind + FSD)이고,
// 시연 코드 폴더(fixtures/demo-implementation-check)는 이 설계도에 맞춰 만들어져 있다.
import { readFileSync } from "node:fs";
import { BlueprintSchema } from "../core/schema/blueprint";

export const DEMO_BLUEPRINT = "fixtures/implementation-check/next/blueprint.json";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const lit = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;

/** 프로젝트 id에 예시 설계도 한 판을 넣는 SQL. 판 번호(revision)는 DB 트리거가 매긴다 */
export function buildDemoBlueprintSql(projectId: string): string {
  if (!UUID.test(projectId)) throw new Error("프로젝트 id(uuid)를 넣어 주세요. 프로젝트 주소 /projects/<id> 의 id입니다.");
  const b = BlueprintSchema.parse(JSON.parse(readFileSync(DEMO_BLUEPRINT, "utf8")));
  return [
    "-- 구현 검사 시연용 예시 설계도(상품 상세) 한 판 추가",
    "insert into public.blueprints (project_id, version, title, stack, route, source, generated_by, nodes)",
    `values ('${projectId}', '${b.version}', '${b.title.replaceAll("'", "''")}', ${lit(b.stack)}, ${b.route === null ? "null" : `'${b.route.replaceAll("'", "''")}'`}, ${lit(b.source)}, 'user', ${lit(b.nodes)});`,
    "",
  ].join("\n");
}

if (process.argv[1]?.endsWith("demo-blueprint-sql.ts")) {
  try {
    process.stdout.write(buildDemoBlueprintSql(process.argv[2] ?? ""));
  } catch (e) {
    console.error(e instanceof Error ? e.message : "SQL을 만들지 못했습니다.");
    process.exit(1);
  }
}

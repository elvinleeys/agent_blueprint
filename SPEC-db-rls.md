# Spec: DB 표와 RLS (F-014 프로젝트 저장·불러오기의 기반)

단일 기능이라 capability map은 만들지 않는다. 구현은 승인 후 시작한다. 작업 순서는 `tasks/plan-db-rls.md` 참조.
근거: `.claude/skills/define-schema/data-model.md`(Blueprint·SpecInput), `core/schema/blueprint.ts`·`spec-input.ts`, `CLAUDE.md`(RLS·저장 규칙), `SPEC-auth-login.md`.

## Objective
로그인한 사용자가 프로젝트를 만들고, 프로젝트별로 스펙 입력·설계도·지시서를 저장·조회할 수 있는 **DB 기반**을 만든다. 이 작업의 산출물은 (1) 직접 실행할 마이그레이션 SQL, (2) 적용·검증 절차 문서, (3) `lib/db/`의 저장·조회 함수와 mock 단위 테스트다. 화면은 이번 범위 밖이다. 핵심 조건은 **다른 사용자의 데이터가 절대 보이거나 바뀌지 않는 것**(RLS)과 **이미지·코드 원본이 DB에 남지 않는 것**이다.

## 확정된 결정 (사용자 승인 반영 — 아래 본문과 충돌하면 이 절이 우선)

| 항목 | 결정 |
| --- | --- |
| projects | `name` + 스택(`framework` html/react/next, `styling` css/css-modules/tailwind, `architecture` type-based/feature-based/fsd) 열 3개(not null, check) + 생성·수정 시각 |
| spec_inputs | 프로젝트당 1행(unique). 7개 항목 + `image_count`(0~3). 이미지 원본 저장 없음 |
| blueprints | **이력 보관**: 프로젝트 하나에 여러 행. `revision`(정수, 1부터, `unique(project_id, revision)`)과 `version`(스키마 형식 `'1.2'`)을 **별개 열**로 둔다. `revision`은 DB 트리거가 부여(INSERT 시 해당 프로젝트의 최대값 + 1)하고 UPDATE로 바꿀 수 없다 |
| 저장 시점 | 편집 중 자동 저장 = **가장 최근 행 갱신**. 새 행 추가는 **AI 초안 생성·지시서 내보내기 시점에만**(호출하는 쪽이 `createBlueprintRevision`을 선택) |
| prompt_exports | `format`(`prompt`/`claude_md`), `content`(최대 200,000자), `source_type`(`blueprint`/`cleanup`), `blueprint_id`. `source_type = 'blueprint'`이면 `blueprint_id` 필수, `cleanup`이면 null 허용. 지금은 `blueprint`만 쓴다 |
| blueprint_id 연결 | `(blueprint_id, project_id)` **복합 FK**로 같은 프로젝트의 설계도만 가리킬 수 있다(다른 사용자·다른 프로젝트의 id를 연결하지 못함). FK는 `no action`이라 프로젝트 삭제(연쇄)는 되고, 지시서가 참조하는 판만 따로 지울 수는 없다 |
| 한도 | `nodes` 1~200개, 지시서 1~200,000자 |
| 권한 | `authenticated`에만 GRANT, `anon`은 REVOKE |
| 과거 판 수정 (2차 승인) | DB 트리거가 **해당 프로젝트의 최신 판이 아닌 행의 UPDATE를 거부**(오류 `BP001`). `revision`·`project_id` 변경도 거부. 근거: 설계도 이력은 AI 초안과 지시서로 내보낸 확정본을 보존하기 위한 것이고, 지시서가 출처 판과 연결되기 때문 |
| 설계도 삭제 (2차 승인) | **조건부 허용**: 최신 판(`BP002`)과 지시서가 연결된 판(`BP003`)은 삭제 거부, 연결 없는 과거 판은 삭제 가능. 프로젝트·사용자 삭제로 인한 연쇄 삭제는 유지(삭제 트리거는 부모 프로젝트 행이 이미 없으면 검사하지 않음). `prompt_exports`의 `(blueprint_id, project_id)` FK는 연쇄 삭제 순서 문제를 피하려고 `on delete cascade`로 두고, 직접 삭제 거부는 트리거가 맡는다. `lib/db`에 `deleteBlueprintRevision` 추가, 삭제 UI는 범위 밖 |
| 회원 탈퇴 (2차 승인) | 탈퇴하면 사용자와 모든 프로젝트 데이터를 즉시 삭제. `projects.user_id`가 이미 `references auth.users(id) on delete cascade`이고 하위 표는 모두 프로젝트에 cascade이므로 SQL 변경 없음. 격리 스크립트가 사용자 삭제 시 연쇄 삭제를 검증 |
| 함수 범위 (2차 승인) | 스펙 입력·지시서 저장 함수는 해당 화면을 만들 때 추가(지금은 만들지 않음) |
| 적용 | 사용자가 대시보드 SQL 편집기에서 직접 실행. 공지는 적용 직전에 사용자가 확인. 프로젝트 생성 시점은 사용자가 확인해 알려줌 |

`lib/db` 함수(수정): `createProject(db, {name, stack})`, `listProjects(db)`, `saveBlueprint(db, projectId, blueprint)`(최근 행 갱신, 행이 없으면 첫 행 생성), `createBlueprintRevision(db, projectId, blueprint)`(새 행), `loadBlueprint(db, projectId, { revision? })`(기본 최신), `listBlueprintRevisions(db, projectId)`(revision 내림차순, nodes 제외한 요약).
(2차 승인으로 과거 판 수정은 DB 트리거가 막는다. 아래 `lib/db` 목록에 `deleteBlueprintRevision(db, projectId, revision)`이 추가된다.)

## 조사 결과

### Data API 노출 기본값 변경 (Supabase 공식 공지)
- Supabase는 `public` 스키마의 새 표를 **Data API(PostgREST)에 자동으로 노출하지 않도록** 기본값을 바꿨다. 공지 기준 새 프로젝트의 새 표는 5월 30일부터, **기존 프로젝트는 2026-10-30부터**(오늘은 10월 29일) 적용된다([변경 공지](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)). 이 프로젝트가 어느 쪽 기본값인지는 코드로 알 수 없다.
- 이전 기본값은 `anon`·`authenticated`·`service_role`에 모든 권한을 자동 부여했고, 새 기본값은 **명시적 `GRANT`가 없으면 Postgres가 RLS 평가 전에 거부**한다(오류 코드 42501). 직접 Postgres 연결(psql 등)에는 영향이 없다.
- 그래서 마이그레이션에 **`GRANT`를 명시**한다. 어느 기본값이어도 같은 결과가 되도록 `anon`은 **명시적으로 `REVOKE`**한다(옛 기본값 프로젝트에서 자동 부여된 권한이 남지 않게).
- 위 날짜·동작은 검색으로 얻은 공지 요약이다. 적용 직전에 [Supabase 변경 공지](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)와 대시보드의 Data API 설정을 한 번 더 확인해 주세요(CLAUDE.md "RLS 정책 세부 문법은 공식 문서로 재확인").
- 권한과 RLS는 별개 층이다: `GRANT`는 표에 닿을 수 있는지, RLS는 어느 행을 보는지를 정한다. 둘 다 필요하다.

### 마이그레이션 적용 방법 (이 저장소 상태)
- 저장소에 `supabase/` 폴더가 없고 Supabase CLI는 `package.json`에도 없다(`@supabase/ssr`·`supabase-js`만 있음).
| 방법 | 사용자가 직접 실행 가능? | 필요한 것 |
| --- | --- | --- |
| **A. 대시보드 SQL 편집기 (권장)** | 예 | 대시보드 로그인만. SQL을 붙여넣어 실행. 추가 설치·비밀번호 없음 |
| B. CLI (`npx supabase login` → `link` → `db push`) | 예 | 프로젝트 ref, DB 비밀번호, 첫 실행 시 패키지 내려받기(`npx`). 로컬 `supabase/` 초기화(`init`)도 필요 |
- 결정(제안): **A를 기본 절차**로 문서화하고, B는 "나중에 쓰려면" 짧게만 적는다. SQL 파일은 B와 호환되는 `supabase/migrations/<타임스탬프>_<이름>.sql` 위치에 둔다(내용이 같으므로 어느 쪽으로도 실행 가능).

## Assumptions (틀리면 알려주세요)
1. **`data-model.md`에는 `Project`와 `PromptExport`의 필드 정의가 없다**(Blueprint·SpecInput·DesignSystemSpec만 있음). 기획서 6.4는 저장소에 없어 확인하지 못했다. 그래서 아래 두 표의 열은 **제안**이다 → Open Question 1.
2. 한 프로젝트에 **스펙 입력 1개, 설계도 1개**(현재본)를 둔다(`project_id` unique, 저장은 upsert). 설계도 이력·버전 관리는 이번 범위 밖이다.
3. 지시서(`prompt_exports`)는 **누적 저장**(이력). 수정 없이 추가·삭제만 한다.
4. 검사 결과(`Violation`)는 표를 만들지 않는다. 설계도에서 `core/rules`로 다시 계산할 수 있고, 요청 범위에도 없다.
5. 모든 정책은 `authenticated` 역할에만 부여한다. `anon`(비로그인)은 어떤 표에도 접근 못 한다.
6. `service_role`에는 이번에 `GRANT`하지 않는다(사용하지 않음, 금지 사항 준수). 필요해지면 그때 먼저 질문한다.
7. 키는 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + 로그인 세션만 쓴다. 서버 클라이언트(`lib/supabase/server.ts`)의 세션 쿠키로 `auth.uid()`가 채워진다.
8. 설계도 전체 검증(Zod `BlueprintSchema`)은 **앱 코드**가 한다(저장 전, 읽은 뒤). DB는 형태 정도만 검사한다(version 값, nodes가 배열인지, 개수 범위).

## 설계

### 표 (마이그레이션 SQL의 내용)
모든 표는 `public` 스키마, 기본키는 `uuid default gen_random_uuid()`, 시간은 `timestamptz default now()`.

**projects**
| 열 | 타입 | 제약 |
| --- | --- | --- |
| id | uuid | PK |
| user_id | uuid | not null, `references auth.users(id) on delete cascade`, `default auth.uid()` |
| name | text | not null, 1~100자 |
| created_at, updated_at | timestamptz | not null |
- 인덱스: `(user_id, updated_at desc)` — 목록 조회용.

**spec_inputs** (프로젝트당 1행)
| 열 | 타입 | 제약 |
| --- | --- | --- |
| id | uuid | PK |
| project_id | uuid | not null, unique, `references projects(id) on delete cascade` |
| version | text | not null, check `= '1.2'` |
| overview, tokens, layout, component_rules, state_data, accessibility, constraints | text | null 허용(7개 항목, `SpecInput`과 1:1) |
| image_count | integer | not null, check 0~3 (개수만 저장, **이미지 파일·base64 열 없음**) |
| created_at, updated_at | timestamptz | not null |

**blueprints** (프로젝트당 1행)
| 열 | 타입 | 제약 |
| --- | --- | --- |
| id | uuid | PK |
| project_id | uuid | not null, unique, FK cascade |
| version | text | not null, check `= '1.2'` |
| title | text | not null |
| stack | jsonb | not null (`{framework, styling, architecture}`) |
| route | text | null |
| source | jsonb | not null (`{hasSpec, imageCount}`) |
| generated_by | text | not null, check `in ('ai','user')` |
| nodes | jsonb | not null, check `jsonb_typeof(nodes) = 'array'` 그리고 `jsonb_array_length(nodes) between 1 and 200` — **평면 배열 그대로**, `children` 없음 |
| created_at, updated_at | timestamptz | not null |
- 상한 200은 비정상적으로 큰 저장을 막는 안전장치(초안은 수 개~수십 개). 틀리면 알려 주세요.

**prompt_exports** (제안, 가정 1)
| 열 | 타입 | 제약 |
| --- | --- | --- |
| id | uuid | PK |
| project_id | uuid | not null, FK cascade |
| format | text | not null, check `in ('prompt','claude_md')` |
| content | text | not null, 최대 200,000자 |
| created_at | timestamptz | not null |
- 인덱스: `(project_id, created_at desc)`.

공통: `updated_at`은 **트리거**(`set_updated_at()`, `search_path` 고정)로 갱신한다. 이미지·코드 원본을 담는 열은 어느 표에도 없다.

### RLS 정책 (모든 표 `enable row level security`)
- `projects`: 역할 `authenticated`, `using`/`with check`는 `user_id = (select auth.uid())`. 동작별 정책 4개(select·insert·update·delete). 성능 권장 형태인 `(select auth.uid())`로 감싼다.
- 하위 표(`spec_inputs`, `blueprints`, `prompt_exports`): 같은 4개 정책(prompt_exports는 update 없이 3개), 조건은 **부모 소유 확인**:
  ```sql
  exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid()))
  ```
  insert·update의 `with check`에도 같은 조건을 넣어, **남의 프로젝트 id로 행을 만들거나 옮기는 것**을 막는다.
- `anon` 정책은 없다(= 접근 불가).

### GRANT / REVOKE
```sql
revoke all on public.projects, public.spec_inputs, public.blueprints, public.prompt_exports from anon;
grant select, insert, update, delete on public.projects, public.spec_inputs, public.blueprints to authenticated;
grant select, insert, delete on public.prompt_exports to authenticated;
```
(`set_updated_at()`·`auth.uid()` 외에 다른 함수 권한은 필요 없다.)

### `lib/db/` (클라이언트를 인자로 받는다 → mock 테스트 쉬움)
호출하는 쪽이 `lib/supabase/server.ts`의 `createClient()` 결과를 넘긴다. `lib/db`는 환경변수·키를 직접 읽지 않는다.
```ts
type DbResult<T> = { ok: true; data: T } | { ok: false; kind: "not_found" | "invalid_data" | "unavailable"; message: string };

createProject(db, { name })              // → { id, name, createdAt, updatedAt }
listProjects(db)                         // → Project[] (updated_at 내림차순, 최대 100개). 내 것만 RLS가 보장
saveBlueprint(db, projectId, blueprint)  // → { updatedAt }. 저장 전 BlueprintSchema 검증, project_id 기준 upsert
loadBlueprint(db, projectId)             // → Blueprint | null. 읽은 뒤 BlueprintSchema로 다시 검증
```
- `user_id`는 **보내지 않는다**(DB 기본값 `auth.uid()`가 채움). 클라이언트가 보낸 사용자 id를 믿지 않는다.
- 열 이름 변환(`generatedBy` ↔ `generated_by`)은 이 모듈 안에서만 한다.
- 오류: Supabase 원본 에러는 **서버 로그에만**(이름·코드), 반환 메시지는 한국어 사용자용. 남의/없는 프로젝트에 저장해 RLS가 거부하면 `not_found`(존재 여부를 알려주지 않음). 저장 전 스키마 위반·DB에서 읽은 값이 스키마 위반이면 `invalid_data`(+ 필드 경로 최대 10개), 그 외는 `unavailable`.
- 지시서·스펙 입력용 함수는 이번에 만들지 않는다(표만 준비, 가정 4·범위).

## Tech Stack
Supabase(PostgreSQL, RLS), `@supabase/supabase-js` 2.118(타입만), Zod 4, Vitest 5. 새 의존성 없음.

## Commands
```
npx vitest run lib/db
npx tsc --noEmit
npx eslint lib/db
npm run build
```
SQL은 **사용자가 대시보드 SQL 편집기에서 직접 실행**(실제 DB 적용은 이 작업에서 하지 않는다).

## Project Structure
```
supabase/migrations/<타임스탬프>_create_core_tables.sql   # 표·제약·인덱스·트리거·RLS·GRANT (한 파일, begin/commit)
docs/db-migration.md                                       # 적용 절차(A 권장, B 참고), 검증 쿼리, 다른 사용자 격리 확인 스크립트, 롤백 SQL
lib/db/result.ts                                           # DbResult 타입·오류 변환
lib/db/projects.ts (+ .test.ts)                            # createProject, listProjects
lib/db/blueprints.ts (+ .test.ts)                          # saveBlueprint, loadBlueprint
CLAUDE.md                                                  # 폴더 구조에 lib/db/, supabase/migrations/ 반영
```

## Code Style
```ts
// lib/db/projects.ts — 클라이언트는 인자, 결과는 던지지 않고 판별 가능한 값으로
export async function createProject(db: SupabaseClient, input: { name: string }): Promise<DbResult<ProjectRow>> {
  const { data, error } = await db.from("projects").insert({ name: input.name }).select("id, name, created_at, updated_at").single();
  if (error) return fail(error, "프로젝트를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return { ok: true, data: toProject(data) };
}
```
SQL은 소문자 키워드, 정책 이름은 `"<표>_<동작>_own"` 형식, 주석은 이유만.

## Testing Strategy
- **`lib/db` 단위 테스트(mock)**: `from().select().eq()...` 체인을 흉내 낸 가짜 클라이언트를 주입한다. 실제 DB·네트워크 없음.
  | 케이스 | 기대 |
  | --- | --- |
  | createProject 성공 | insert에 `user_id`가 **없고** name만 전달, camelCase로 변환된 값 반환 |
  | createProject 실패 | `unavailable` + 한국어 메시지, 원본 에러 문구 미노출 |
  | listProjects | `updated_at` 내림차순·limit 100 요청, 빈 목록 정상 |
  | saveBlueprint 유효 | upsert가 `onConflict: "project_id"`로 호출, 열 이름이 snake_case, nodes가 평면 배열 그대로(`children` 없음) |
  | saveBlueprint 스키마 위반 | **DB 호출 없이** `invalid_data` + 필드 경로 |
  | saveBlueprint RLS 거부(오류 42501 또는 행 없음) | `not_found` |
  | loadBlueprint 성공/없음 | Blueprint / `null` |
  | loadBlueprint 저장값이 깨짐 | `invalid_data` (검증 후 반환, 그대로 반환하지 않음) |
- **RLS는 단위 테스트로 증명할 수 없다.** 대신 `docs/db-migration.md`에 사용자가 SQL 편집기에서 실행하는 **격리 확인 스크립트**를 둔다(`set local role authenticated` + `request.jwt.claims`로 사용자 A·B를 흉내 내어 서로의 행이 안 보이는지, 남의 프로젝트에 하위 행 insert가 거부되는지, anon이 거부되는지).
- 마이그레이션 SQL 자체는 이 환경에서 실행하지 않는다. 문법 검토는 사람(사용자) 실행과 위 검증 쿼리에 의존한다.

## Boundaries
- Always: 모든 표에 RLS와 정책을 **같은 파일에서** 만든다, GRANT를 명시한다, 사용자 id는 `auth.uid()`로만 채운다, 앱 코드에서 저장 전·읽은 뒤 Zod 검증, 원본 에러는 서버 로그만
- Ask first: `service_role` 사용·GRANT, 새 의존성(Supabase CLI 포함), 표·열 추가(위 제안 밖), 설계도 이력 보관, `anon`에 어떤 접근이든 부여
- Never: 실제 DB에 SQL 적용(사용자가 직접), 이미지·코드 원본·응답 원문 저장 열, 정책 없는 표, `children` 중첩 저장, 클라이언트가 보낸 `user_id` 신뢰, `.env.local` 읽기

## Success Criteria
1. `lib/db` 테스트가 위 표의 모든 케이스를 통과하고 `tsc`·`eslint`·`npm run build`가 통과한다.
2. 마이그레이션 SQL에 **4개 표 모두** `enable row level security`와 정책이 있고, `anon`은 REVOKE, `authenticated`만 GRANT가 있다. 이미지·코드 원본 열이 없다.
3. 사용자가 SQL 편집기에서 SQL을 실행했을 때 오류가 없고, 문서의 확인 쿼리에서 4개 표 모두 `relrowsecurity = true`, 정책 개수가 기대와 같다.
4. 문서의 격리 확인 스크립트에서: A는 자기 프로젝트만 보인다 / A가 B의 프로젝트 id로 하위 행을 insert하면 거부된다 / `anon`은 접근 거부.
5. 이 작업 중 실제 DB 호출·service role 사용이 없었다.

## Risks
| 위험 | 대응 |
| --- | --- |
| 이 프로젝트의 Data API 기본값을 모른다(옛/새) | GRANT·REVOKE를 명시해 어느 쪽이든 같은 결과. 적용 후 `information_schema.role_table_grants`로 확인하는 쿼리를 문서에 포함 |
| 하위 표 정책의 `exists` 서브쿼리 비용 | `project_id`·`(user_id, …)` 인덱스, `(select auth.uid())` 형태. MVP 규모에서는 충분. 느려지면 `security definer` 함수로 교체 검토 |
| 정책을 SQL 편집기(postgres 역할)에서 그냥 조회하면 RLS가 적용되지 않아 "격리됨"을 잘못 확인할 수 있음 | 문서의 확인 스크립트는 `set local role authenticated`로 역할을 바꾼 뒤 실행하도록 명시 |
| 설계도 현재본만 저장 → 덮어쓰면 이전 버전 복구 불가 | MVP 결정(가정 2). 이력이 필요해지면 `blueprint_versions` 표를 별도 작업으로 |
| 표 열이 기획서 6.4와 다를 수 있음(가정 1) | 승인 전에 Open Question 1로 확인, 적용 전이라 변경 비용 낮음 |
| `nodes` 상한 200이 너무 작거나 큼 | 확인 요청(Open Question 4). 체크 제약 변경은 SQL 한 줄 |

## Open Questions
**→ 1~5번은 위 "확정된 결정"으로 모두 답변·승인됨. 6번(프로젝트 생성 시점)은 사용자가 대시보드에서 확인해 알려줄 예정(SQL은 양쪽 기본값에서 동일하게 동작).**

1. **`Project`·`PromptExport`의 열**을 기획서 6.4에서 확인해 주세요. 제안: `projects(name)`, `prompt_exports(format, content)`. 기획서에 다른 열(예: 프로젝트의 stack, 설명, 지시서의 blueprint 연결)이 있으면 알려 주세요.
2. **프로젝트당 설계도 1개(현재본, upsert)**로 충분한가요, 이력 보관이 필요한가요?
3. 지시서가 어느 설계도 버전에서 나왔는지 연결(`prompt_exports.blueprint_id`)이 필요한가요? (현재 설계에서는 단일 설계도라 생략)
4. `nodes` 최대 개수 **200**과 지시서 최대 **200,000자**가 적절한가요?
5. 적용은 **대시보드 SQL 편집기(A)**로 진행하는 것이 맞나요, CLI(B)를 쓰고 싶으신가요?
6. 이 프로젝트가 **2026-10-30 이전 생성**(옛 기본값 = 자동 GRANT)인지 아시나요? (몰라도 되도록 SQL은 양쪽에서 같게 만들었지만, 문서에 어느 쪽인지 적어 두면 확인 절차가 단순해집니다)

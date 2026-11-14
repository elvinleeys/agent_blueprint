# Plan: DB 표와 RLS (SPEC-db-rls.md)

> **이 문서는**: 데이터베이스(DB)의 표를 만들고, 사용자별로 데이터를 분리하는 RLS(행 단위 접근 제한) 정책을 붙이고, 그 표를 읽고 쓰는 코드를 만드는 순서를 정한 작업 계획이다. 기능 자체의 설명은 `SPEC-db-rls.md`에 있다.
> **목록에 들어 있는 것**: `T1`~`T7`은 작업 한 칸이다. 칸마다 "끝났다고 보는 기준", "확인 방법", "건드리는 파일"이 적혀 있다.

의존 순서: SQL → 적용·검증 문서 → 공통 타입 → projects 함수 → blueprints 함수 → 문서 갱신. SQL은 코드와 독립이라 먼저 만들어 사용자가 검토·적용할 수 있게 하고, `lib/db`는 mock(가짜 데이터)이라 실제 적용과 무관하게 진행한다. 단계마다 `npx vitest run`, `npx tsc --noEmit`, `npx eslint <대상>` 확인 후 커밋한다. **실제 DB 적용·service role 사용 없음.**

> 승인 반영(SPEC-db-rls.md "확정된 결정"): blueprints는 이력 구조(`revision`), `projects`에 스택 열, `prompt_exports`에 `source_type`·`blueprint_id`가 추가되었다. 아래 T1·T4·T5는 이에 맞춘다. T5는 `saveBlueprint`(최근 행 갱신), `createBlueprintRevision`, `loadBlueprint`(기본 최신·revision 지정), `listBlueprintRevisions`로 확장된다.

## 작업
- [ ] T1. **DB 표를 만드는 SQL 파일 쓰기** — 마이그레이션 SQL(DB 구조를 바꾸는 SQL 파일) `supabase/migrations/<타임스탬프>_create_core_tables.sql`
  - 끝났다고 보는 기준(Acceptance): 4개 표, 제약, 인덱스, `set_updated_at` 트리거, 표마다 `enable row level security` + 정책(projects 4개, spec_inputs 4개, blueprints 4개, prompt_exports 3개), `revoke ... from anon`, `grant ... to authenticated`. 이미지·코드 원본 열 없음. `begin; … commit;`
  - 확인 방법(Verify): 파일을 읽어 체크리스트(표별 RLS·정책·GRANT 존재, 열 이름이 `SpecInput`·`Blueprint` 필드와 1:1)를 대조. 실행은 사용자
  - 건드리는 파일(Files): `supabase/migrations/<타임스탬프>_create_core_tables.sql`
- [ ] T2. **SQL 적용 방법을 적은 문서 쓰기** — `docs/db-migration.md`
  - 끝났다고 보는 기준: 대시보드 SQL 편집기 적용 절차(권장), CLI 절차(참고, 새 도구 필요 명시), 적용 후 확인 쿼리(RLS 활성·정책 목록·권한), 사용자 A/B 격리 확인 스크립트(역할 전환 포함), 롤백 SQL(파괴적임 표시)
  - 확인 방법: 문서 검토. 스크립트의 SQL 문법은 사용자가 실행하며 확인
  - 건드리는 파일: `docs/db-migration.md`
- [ ] T3. **DB 결과와 오류를 다루는 공통 타입 만들기** — `lib/db/result.ts`
  - 끝났다고 보는 기준: `DbResult<T>` 타입, 원본 에러를 서버 로그에만 남기고 사용자용 메시지·`kind`로 바꾸는 함수(42501·PGRST116 → `not_found`)
  - 확인 방법: `tsc`, `eslint`, 변환 함수 테스트
  - 건드리는 파일: `lib/db/result.ts`, `lib/db/result.test.ts`
- [ ] T4. **프로젝트를 만들고 목록을 읽는 함수 만들기** — `lib/db/projects.ts` + 테스트 (`createProject`, `listProjects`)
  - 끝났다고 보는 기준: insert에 `user_id` 미포함, 목록은 `updated_at` 내림차순·limit 100, 실패 시 한국어 메시지·원본 비노출
  - 확인 방법: `npx vitest run lib/db`
  - 건드리는 파일: `lib/db/projects.ts`, `lib/db/projects.test.ts`
- [ ] T5. **설계도를 저장하고 불러오는 함수 만들기** — `lib/db/blueprints.ts` + 테스트 (`saveBlueprint`, `loadBlueprint`)
  - 끝났다고 보는 기준: 저장 전 `BlueprintSchema` 검증(위반 시 DB 미호출), `onConflict: "project_id"` upsert(있으면 갱신, 없으면 추가), nodes는 평면 배열 그대로, 읽은 뒤 재검증, 없음은 `null`, RLS 거부는 `not_found`
  - 확인 방법: `npx vitest run lib/db`, `tsc`, `eslint`
  - 건드리는 파일: `lib/db/blueprints.ts`, `lib/db/blueprints.test.ts`
- [ ] T6. **`CLAUDE.md` 폴더 구조 갱신** — `CLAUDE.md` 폴더 구조에 `lib/db/`, `supabase/migrations/` 반영
  - 끝났다고 보는 기준: 구조 목록이 실제와 일치
  - 확인 방법: 문서 검토
  - 건드리는 파일: `CLAUDE.md`
- [ ] T7. **마지막 확인**: `vitest`, `tsc`, `eslint`, `npm run build` 결과 보고 + **사용자 실행 체크리스트**(SQL 적용 → 확인 쿼리 → 격리 스크립트)

## 병렬·순차 (어느 칸을 먼저 해야 하나)
T1→T2는 순차(문서가 SQL을 참조). T3→T4·T5. T1·T2와 T3~T5는 서로 독립이라 어느 쪽을 먼저 해도 된다. 한 번에 한 단계씩.

## 위험 구간 (구현 중 재확인)
- Supabase 공지의 Data API 기본값·GRANT(권한 부여) 문법(공식 문서 재확인)
- `(select auth.uid())` 정책 형태와 하위 표 `with check`(저장 조건) 정확성(남의 project_id로 insert·update 불가)
- supabase-js의 `upsert`/`single()` 오류 코드(`PGRST116`, `42501`) 형태를 설치된 타입·문서로 확인
- Open Question(스펙의 미해결 질문) 1~3 답변에 따라 T1·T4·T5의 열·함수가 바뀔 수 있음

# Plan: DB 표와 RLS (SPEC-db-rls.md)

의존 순서: SQL → 적용·검증 문서 → 공통 타입 → projects 함수 → blueprints 함수 → 문서 갱신. SQL은 코드와 독립이라 먼저 만들어 사용자가 검토·적용할 수 있게 하고, `lib/db`는 mock이라 실제 적용과 무관하게 진행한다. 단계마다 `npx vitest run`, `npx tsc --noEmit`, `npx eslint <대상>` 확인 후 커밋한다. **실제 DB 적용·service role 사용 없음.**

> 승인 반영(SPEC-db-rls.md "확정된 결정"): blueprints는 이력 구조(`revision`), `projects`에 스택 열, `prompt_exports`에 `source_type`·`blueprint_id`가 추가되었다. 아래 T1·T4·T5는 이에 맞춘다. T5는 `saveBlueprint`(최근 행 갱신), `createBlueprintRevision`, `loadBlueprint`(기본 최신·revision 지정), `listBlueprintRevisions`로 확장된다.

## 작업
- [ ] T1. 마이그레이션 SQL `supabase/migrations/<타임스탬프>_create_core_tables.sql`
  - Acceptance: 4개 표, 제약, 인덱스, `set_updated_at` 트리거, 표마다 `enable row level security` + 정책(projects 4개, spec_inputs 4개, blueprints 4개, prompt_exports 3개), `revoke ... from anon`, `grant ... to authenticated`. 이미지·코드 원본 열 없음. `begin; … commit;`
  - Verify: 파일을 읽어 체크리스트(표별 RLS·정책·GRANT 존재, 열 이름이 `SpecInput`·`Blueprint` 필드와 1:1)를 대조. 실행은 사용자
  - Files: `supabase/migrations/<타임스탬프>_create_core_tables.sql`
- [ ] T2. `docs/db-migration.md`
  - Acceptance: 대시보드 SQL 편집기 적용 절차(권장), CLI 절차(참고, 새 도구 필요 명시), 적용 후 확인 쿼리(RLS 활성·정책 목록·권한), 사용자 A/B 격리 확인 스크립트(역할 전환 포함), 롤백 SQL(파괴적임 표시)
  - Verify: 문서 검토. 스크립트의 SQL 문법은 사용자가 실행하며 확인
  - Files: `docs/db-migration.md`
- [ ] T3. `lib/db/result.ts`
  - Acceptance: `DbResult<T>` 타입, 원본 에러를 서버 로그에만 남기고 사용자용 메시지·`kind`로 바꾸는 함수(42501·PGRST116 → `not_found`)
  - Verify: `tsc`, `eslint`, 변환 함수 테스트
  - Files: `lib/db/result.ts`, `lib/db/result.test.ts`
- [ ] T4. `lib/db/projects.ts` + 테스트 (`createProject`, `listProjects`)
  - Acceptance: insert에 `user_id` 미포함, 목록은 `updated_at` 내림차순·limit 100, 실패 시 한국어 메시지·원본 비노출
  - Verify: `npx vitest run lib/db`
  - Files: `lib/db/projects.ts`, `lib/db/projects.test.ts`
- [ ] T5. `lib/db/blueprints.ts` + 테스트 (`saveBlueprint`, `loadBlueprint`)
  - Acceptance: 저장 전 `BlueprintSchema` 검증(위반 시 DB 미호출), `onConflict: "project_id"` upsert, nodes는 평면 배열 그대로, 읽은 뒤 재검증, 없음은 `null`, RLS 거부는 `not_found`
  - Verify: `npx vitest run lib/db`, `tsc`, `eslint`
  - Files: `lib/db/blueprints.ts`, `lib/db/blueprints.test.ts`
- [ ] T6. `CLAUDE.md` 폴더 구조에 `lib/db/`, `supabase/migrations/` 반영
  - Acceptance: 구조 목록이 실제와 일치
  - Verify: 문서 검토
  - Files: `CLAUDE.md`
- [ ] T7. 최종 확인: `vitest`, `tsc`, `eslint`, `npm run build` 결과 보고 + **사용자 실행 체크리스트**(SQL 적용 → 확인 쿼리 → 격리 스크립트)

## 병렬·순차
T1→T2는 순차(문서가 SQL을 참조). T3→T4·T5. T1·T2와 T3~T5는 서로 독립이라 어느 쪽을 먼저 해도 된다. 한 번에 한 단계씩.

## 위험 구간 (구현 중 재확인)
- Supabase 공지의 Data API 기본값·GRANT 문법(공식 문서 재확인)
- `(select auth.uid())` 정책 형태와 하위 표 `with check` 정확성(남의 project_id로 insert·update 불가)
- supabase-js의 `upsert`/`single()` 오류 코드(`PGRST116`, `42501`) 형태를 설치된 타입·문서로 확인
- Open Question 1~3 답변에 따라 T1·T4·T5의 열·함수가 바뀔 수 있음

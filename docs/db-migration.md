# DB 마이그레이션 적용 절차 (표 4개 + RLS)

대상 SQL: `supabase/migrations/20261029120000_create_core_tables.sql` (projects, spec_inputs, blueprints, prompt_exports)
이 절차는 **대시보드 SQL 편집기**로 직접 실행하는 방법이다(추가 설치·DB 비밀번호 필요 없음). 이 작업에서 Claude는 DB에 아무것도 적용하지 않는다.

## 실행 순서 요약
0. 사전 확인 → 1. 마이그레이션 실행 → 2. 확인 쿼리 4개 → 3. 격리 확인 스크립트 → (문제가 있으면) 4. 롤백

## 0. 사전 확인
- Supabase 공지 [표가 Data API에 자동 노출되지 않음](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)의 날짜·동작이 이 문서와 같은지 확인한다(기존 프로젝트는 2026-10-30부터 새 기본값이라고 안내됨).
- 대시보드에서 프로젝트 생성 시점을 확인해 Claude에게 알려 주면 문서에 기록한다. SQL은 옛·새 기본값 양쪽에서 같은 권한이 되도록 먼저 회수(`revoke`)한 뒤 필요한 것만 부여(`grant`)한다.
- 이미 같은 이름의 표가 있으면 마이그레이션이 실패한다(전체가 `begin/commit`이라 아무것도 남지 않음). 이 프로젝트에 `projects` 등 기존 표가 있는지 Table Editor에서 먼저 본다.

## 1. 마이그레이션 실행
1. 대시보드 → 프로젝트 선택 → **SQL Editor** → New query
2. `supabase/migrations/20261029120000_create_core_tables.sql` 전체를 붙여넣고 **Run**
3. 오류 없이 "Success"가 나오면 완료. 오류가 나면 메시지를 Claude에게 전달한다(전체가 취소되어 부분 적용 상태는 없다)

## 2. 확인 쿼리 (하나씩 따로 실행: 편집기는 마지막 쿼리 결과만 보여 준다)
**2-1. RLS 활성** — 4행 모두 `relrowsecurity = true`여야 한다.
```sql
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('projects', 'spec_inputs', 'blueprints', 'prompt_exports')
order by c.relname;
```

**2-2. 정책** — 15행(projects 4, spec_inputs 4, blueprints 4, prompt_exports 3), 모든 `roles`가 `{authenticated}`.
```sql
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename in ('projects', 'spec_inputs', 'blueprints', 'prompt_exports')
order by tablename, policyname;
```

**2-3. 권한** — `anon` 행이 **없어야** 하고, `authenticated`는 아래와 같아야 한다.
- projects·spec_inputs: DELETE, INSERT, SELECT, UPDATE
- blueprints: DELETE, INSERT, SELECT, UPDATE
- prompt_exports: DELETE, INSERT, SELECT
```sql
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('projects', 'spec_inputs', 'blueprints', 'prompt_exports')
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;
```

**2-4. 열 목록** — 이미지·코드 원본을 담는 열이 없는지 눈으로 확인한다(`image_count` 숫자만 있어야 한다).
```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name in ('projects', 'spec_inputs', 'blueprints', 'prompt_exports')
order by table_name, ordinal_position;
```

## 3. 사용자 A·B 격리·이력 규칙 확인 스크립트
1. SQL Editor → New query에 `supabase/tests/rls-isolation.sql` 전체를 붙여넣고 **Run**
2. **오류 없이 끝나면 통과**다. 임시 사용자·행은 스크립트 끝의 `rollback`으로 모두 취소되어 남지 않는다.
3. `CHECK FAILED: ...` 오류가 나면 그 메시지를 Claude에게 전달한다.
4. 편집기 기본 역할(postgres)은 RLS를 우회한다. 그래서 스크립트가 `set local role authenticated`·`anon`으로 역할을 바꿔 검사한다. 편집기에서 `select * from projects`를 그냥 실행해 "내 것만 보인다"를 확인하려는 방식은 RLS 검증이 되지 않는다.
5. 스크립트가 `auth.users`에 임시 행을 넣는 부분에서 오류가 나면(필수 열 차이 등) 그 오류를 알려 달라. 데이터가 바뀌지 않았으므로 안전하다.

검사 항목:
- 격리: user_id 자동 채움 / B에게 A의 프로젝트·설계도·지시서가 안 보임 / B의 A 프로젝트·설계도 수정·삭제는 0행 / B가 A의 `project_id`로 하위 행 생성 거부 / 다른 프로젝트의 설계도를 지시서에 연결 거부 / anon 접근 거부
- 제약: revision 자동 부여(클라이언트 값 무시)·수정 불가 / nodes 0개·201개 거부 / blueprint 출처 지시서는 `blueprint_id` 필수
- **이력 규칙**: 과거 판 수정 거부(BP001), 최신 판 수정 허용 / 최신 판 삭제 거부(BP002) / 지시서와 연결된 판 삭제 거부(BP003) / 연결 없는 과거 판 삭제 허용
- **연쇄 삭제(중요)**: 프로젝트를 지우면 최신 판·지시서 연결 판을 포함해 하위 데이터가 모두 삭제됨, 사용자(회원 탈퇴)를 지우면 프로젝트와 모든 하위 데이터가 즉시 삭제됨. 이 두 검사가 실패하면 탈퇴·프로젝트 삭제가 막힐 수 있으므로 결과를 꼭 알려 달라.

## 4. 롤백 (파괴적: 표와 데이터가 모두 삭제됨. 확인 쿼리·스크립트에 문제가 있어 처음부터 다시 할 때만)
```sql
begin;
drop table if exists public.prompt_exports, public.blueprints, public.spec_inputs, public.projects cascade;
drop function if exists public.blueprints_before_write();
drop function if exists public.set_updated_at();
commit;
```

## 참고: CLI로 적용하려면 (이번에는 사용하지 않음)
`supabase/` 폴더는 이미 마이그레이션 위치(`supabase/migrations/`)를 따른다. CLI를 쓰려면 `npx supabase init`(설정 파일 생성), `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push` 순서이며 DB 비밀번호가 필요하다. 새 도구 도입이므로 쓰기 전에 Claude에게 먼저 알려 달라(승인 필요 항목).

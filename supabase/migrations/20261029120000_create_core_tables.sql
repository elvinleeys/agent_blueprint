-- AgentBlueprint 핵심 표: projects, spec_inputs, blueprints, prompt_exports
-- 기준: SPEC-db-rls.md. 모든 표에 RLS를 켜고, 권한은 authenticated에만 부여한다(anon은 회수).
-- 이미지·코드 원본을 담는 열은 만들지 않는다. 한 번에 실행하며 실패하면 전체가 취소된다(begin/commit).

begin;

-- ---------------------------------------------------------------------------
-- 공통 함수
-- ---------------------------------------------------------------------------

-- updated_at 자동 갱신
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  -- 클라이언트가 보내는 값을 믿지 않고 로그인 세션의 사용자로 채운다
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  framework text not null check (framework in ('html', 'react', 'next')),
  styling text not null check (styling in ('css', 'css-modules', 'tailwind')),
  architecture text not null check (architecture in ('type-based', 'feature-based', 'fsd')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_user_id_updated_at_idx on public.projects (user_id, updated_at desc);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- spec_inputs: 프로젝트당 1개. 이미지 파일은 저장하지 않고 개수만 둔다
-- ---------------------------------------------------------------------------

create table public.spec_inputs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects (id) on delete cascade,
  version text not null check (version = '1.2'),
  overview text,
  tokens text,
  layout text,
  component_rules text,
  state_data text,
  accessibility text,
  constraints text,
  image_count integer not null check (image_count between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger spec_inputs_set_updated_at
  before update on public.spec_inputs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- blueprints: 프로젝트 하나에 여러 판(revision)이 쌓인다.
-- version은 스키마 형식 버전('1.2'), revision은 판 번호로 서로 다른 값이다.
-- ---------------------------------------------------------------------------

create table public.blueprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  revision integer not null check (revision >= 1),
  version text not null check (version = '1.2'),
  title text not null check (char_length(title) >= 1),
  stack jsonb not null,
  route text,
  source jsonb not null,
  generated_by text not null check (generated_by in ('ai', 'user')),
  -- 평면 배열 + parentId 그대로 저장한다(children 중첩 없음)
  nodes jsonb not null check (jsonb_typeof(nodes) = 'array' and jsonb_array_length(nodes) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, revision),
  -- prompt_exports가 같은 프로젝트의 설계도만 가리키도록 복합 FK의 대상으로 쓴다
  unique (id, project_id)
);

-- revision은 INSERT 때 DB가 부여하고(프로젝트별 최대값 + 1), 이후 revision·project_id는 바꿀 수 없다.
-- 동시에 두 행을 넣으면 unique (project_id, revision) 위반으로 한쪽이 실패한다(호출자가 다시 시도).
create function public.blueprints_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := coalesce(
      (select max(b.revision) from public.blueprints b where b.project_id = new.project_id), 0
    ) + 1;
  elsif new.revision is distinct from old.revision or new.project_id is distinct from old.project_id then
    raise exception 'blueprints.revision and project_id cannot be changed';
  end if;
  return new;
end;
$$;

create trigger blueprints_before_write
  before insert or update on public.blueprints
  for each row execute function public.blueprints_before_write();

create trigger blueprints_set_updated_at
  before update on public.blueprints
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- prompt_exports: 지시서 이력(추가·삭제만, 수정 없음)
-- ---------------------------------------------------------------------------

create table public.prompt_exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  blueprint_id uuid,
  format text not null check (format in ('prompt', 'claude_md')),
  -- cleanup은 디자인 시스템 정리 기능용(지금은 blueprint만 사용)
  source_type text not null check (source_type in ('blueprint', 'cleanup')),
  content text not null check (char_length(content) between 1 and 200000),
  created_at timestamptz not null default now(),
  check (source_type <> 'blueprint' or blueprint_id is not null),
  -- blueprint_id가 null이면 검사하지 않고, 값이 있으면 같은 프로젝트의 설계도여야 한다
  foreign key (blueprint_id, project_id) references public.blueprints (id, project_id)
);

create index prompt_exports_project_id_created_at_idx on public.prompt_exports (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: 모든 표 활성화. 정책은 authenticated 전용(anon 정책 없음 = 접근 불가)
-- ---------------------------------------------------------------------------

alter table public.projects enable row level security;
alter table public.spec_inputs enable row level security;
alter table public.blueprints enable row level security;
alter table public.prompt_exports enable row level security;

-- projects: 내 것만
create policy "projects_select_own" on public.projects
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "projects_insert_own" on public.projects
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "projects_update_own" on public.projects
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "projects_delete_own" on public.projects
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- spec_inputs: 내 프로젝트에 속한 행만 (insert·update의 with check로 남의 project_id 사용 차단)
create policy "spec_inputs_select_own" on public.spec_inputs
  for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

create policy "spec_inputs_insert_own" on public.spec_inputs
  for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

create policy "spec_inputs_update_own" on public.spec_inputs
  for update to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

create policy "spec_inputs_delete_own" on public.spec_inputs
  for delete to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

-- blueprints: select·insert·update만(이력 보존을 위해 delete 정책 없음)
create policy "blueprints_select_own" on public.blueprints
  for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

create policy "blueprints_insert_own" on public.blueprints
  for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

create policy "blueprints_update_own" on public.blueprints
  for update to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

-- prompt_exports: select·insert·delete만(수정 없음)
create policy "prompt_exports_select_own" on public.prompt_exports
  for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

create policy "prompt_exports_insert_own" on public.prompt_exports
  for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

create policy "prompt_exports_delete_own" on public.prompt_exports
  for delete to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- 권한: Data API 기본값(옛: 자동 부여 / 새: 부여 없음)과 무관하게 같은 결과가 되도록 명시한다
-- ---------------------------------------------------------------------------

-- 옛 기본값 프로젝트는 anon·authenticated에 모든 권한이 자동 부여되므로 먼저 회수한 뒤 필요한 것만 다시 준다
revoke all on public.projects, public.spec_inputs, public.blueprints, public.prompt_exports from anon, authenticated;

grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.spec_inputs to authenticated;
grant select, insert, update on public.blueprints to authenticated;
grant select, insert, delete on public.prompt_exports to authenticated;

commit;

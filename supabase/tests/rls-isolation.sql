-- RLS·이력 규칙 확인 스크립트 (마이그레이션 적용 후 SQL 편집기에서 한 번에 실행)
-- 임시 사용자 A·B(·C)를 만들어 다음을 확인한다.
--   - 서로의 데이터가 보이지 않고, 남의 프로젝트에 쓰기가 막히는지
--   - 과거 판 수정 거부 / 최신 판·지시서 연결 판 삭제 거부 / 연결 없는 과거 판 삭제 허용
--   - 프로젝트 삭제·사용자(회원 탈퇴) 삭제 시 모든 하위 데이터가 연쇄 삭제되는지
-- 맨 끝의 rollback으로 만든 사용자·행이 모두 취소되므로 데이터가 남지 않는다.
-- 오류 없이 끝나면 통과다(편집기에 따라 notice "ALL CHECKS PASSED"는 보이지 않을 수 있다).
-- 하나라도 어긋나면 오류로 멈추고, 메시지의 "CHECK FAILED: ..."가 어떤 검사인지 알려 준다.
-- SQL 편집기의 기본 역할(postgres)은 RLS를 우회하므로, 아래에서 set local role로 authenticated·anon으로 바꿔 검사한다.
-- 오류 코드: BP001 = 과거 판 수정 거부, BP002 = 최신 판 삭제 거부, BP003 = 지시서 연결 판 삭제 거부 (마이그레이션의 blueprints 트리거)

begin;

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  pa uuid;
  pb uuid;
  pc uuid;
  ba uuid;
  n integer;
  rev integer;
begin
  -- 임시 사용자 (postgres 역할로 생성)
  insert into auth.users (id, aud, role, email) values
    (a, 'authenticated', 'authenticated', 'rls-test-a@example.invalid'),
    (b, 'authenticated', 'authenticated', 'rls-test-b@example.invalid'),
    (c, 'authenticated', 'authenticated', 'rls-test-c@example.invalid');

  -- ===== 사용자 A =====
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- user_id를 보내지 않아도 로그인 사용자로 채워진다
  insert into public.projects (name, framework, styling, architecture)
    values ('A project', 'next', 'tailwind', 'feature-based') returning id into pa;
  if (select user_id from public.projects where id = pa) is distinct from a then
    raise exception 'CHECK FAILED: projects.user_id가 auth.uid()로 채워지지 않음';
  end if;

  -- revision은 DB가 부여한다(클라이언트가 99를 보내도 무시)
  insert into public.blueprints (project_id, revision, version, title, stack, source, generated_by, nodes)
    values (pa, 99, '1.2', 'bp1', '{}'::jsonb, '{}'::jsonb, 'ai', '[{"id":"x"}]'::jsonb) returning id, revision into ba, rev;
  if rev <> 1 then raise exception 'CHECK FAILED: 첫 revision이 1이 아님(%)', rev; end if;
  insert into public.blueprints (project_id, version, title, stack, source, generated_by, nodes)
    values (pa, '1.2', 'bp2', '{}'::jsonb, '{}'::jsonb, 'ai', '[{"id":"x"}]'::jsonb) returning revision into rev;
  if rev <> 2 then raise exception 'CHECK FAILED: 두 번째 revision이 2가 아님(%)', rev; end if;

  -- revision·project_id는 수정할 수 없다
  begin
    update public.blueprints set revision = 7 where id = ba;
    raise exception 'CHECK FAILED: revision 수정이 허용됨';
  exception when sqlstate 'BP001' then null;
  end;

  -- 제약: nodes가 빈 배열이면 거부, 200개 초과 거부
  begin
    insert into public.blueprints (project_id, version, title, stack, source, generated_by, nodes)
      values (pa, '1.2', 'bad', '{}'::jsonb, '{}'::jsonb, 'ai', '[]'::jsonb);
    raise exception 'CHECK FAILED: 빈 nodes가 허용됨';
  exception when check_violation then null;
  end;
  begin
    insert into public.blueprints (project_id, version, title, stack, source, generated_by, nodes)
      select pa, '1.2', 'bad', '{}'::jsonb, '{}'::jsonb, 'ai', jsonb_agg(jsonb_build_object('id', g)) from generate_series(1, 201) g;
    raise exception 'CHECK FAILED: 201개 nodes가 허용됨';
  exception when check_violation then null;
  end;

  -- 지시서: blueprint 출처는 blueprint_id 필수
  begin
    insert into public.prompt_exports (project_id, format, source_type, content) values (pa, 'prompt', 'blueprint', 'x');
    raise exception 'CHECK FAILED: blueprint_id 없는 blueprint 지시서가 허용됨';
  exception when check_violation then null;
  end;
  -- 1판(ba)을 출처로 하는 지시서
  insert into public.prompt_exports (project_id, blueprint_id, format, source_type, content) values (pa, ba, 'prompt', 'blueprint', 'ok');

  -- ----- 과거 판 수정 거부 / 최신 판 수정 허용 -----
  begin
    update public.blueprints set title = 'edited' where id = ba;
    raise exception 'CHECK FAILED: 과거 판(1판) 수정이 허용됨';
  exception when sqlstate 'BP001' then null;
  end;
  update public.blueprints set title = 'bp2-edited' where project_id = pa and revision = 2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CHECK FAILED: 최신 판(2판) 수정이 막힘'; end if;

  -- ----- 삭제 규칙 -----
  -- 지시서가 연결된 판(1판)은 삭제 불가
  begin
    delete from public.blueprints where id = ba;
    raise exception 'CHECK FAILED: 지시서와 연결된 판 삭제가 허용됨';
  exception when sqlstate 'BP003' then null;
  end;
  -- 최신 판(2판)은 삭제 불가
  begin
    delete from public.blueprints where project_id = pa and revision = 2;
    raise exception 'CHECK FAILED: 최신 판 삭제가 허용됨';
  exception when sqlstate 'BP002' then null;
  end;
  -- 3판을 추가하면 2판은 "연결 없는 과거 판"이 되어 삭제된다
  insert into public.blueprints (project_id, version, title, stack, source, generated_by, nodes)
    values (pa, '1.2', 'bp3', '{}'::jsonb, '{}'::jsonb, 'user', '[{"id":"x"}]'::jsonb) returning revision into rev;
  if rev <> 3 then raise exception 'CHECK FAILED: 세 번째 revision이 3이 아님(%)', rev; end if;
  delete from public.blueprints where project_id = pa and revision = 2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CHECK FAILED: 연결 없는 과거 판(2판) 삭제가 거부됨'; end if;
  select count(*) into n from public.blueprints where project_id = pa;
  if n <> 2 then raise exception 'CHECK FAILED: 삭제 후 판 개수가 2가 아님(%)', n; end if;
  -- 새로 최신이 된 3판은 삭제 불가
  begin
    delete from public.blueprints where project_id = pa and revision = 3;
    raise exception 'CHECK FAILED: 새 최신 판(3판) 삭제가 허용됨';
  exception when sqlstate 'BP002' then null;
  end;

  -- ===== 사용자 B =====
  reset role;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.projects (name, framework, styling, architecture)
    values ('B project', 'react', 'css', 'type-based') returning id into pb;

  -- B에게는 자기 프로젝트만 보인다
  select count(*) into n from public.projects;
  if n <> 1 then raise exception 'CHECK FAILED: B에게 프로젝트 %개가 보임(기대 1)', n; end if;
  select count(*) into n from public.blueprints;
  if n <> 0 then raise exception 'CHECK FAILED: B에게 A의 설계도 %개가 보임', n; end if;
  select count(*) into n from public.prompt_exports;
  if n <> 0 then raise exception 'CHECK FAILED: B에게 A의 지시서 %개가 보임', n; end if;

  -- B가 A의 프로젝트·설계도를 수정·삭제해도 0행에만 영향
  update public.projects set name = 'hacked' where id = pa;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: B가 A의 프로젝트를 수정함'; end if;
  delete from public.projects where id = pa;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: B가 A의 프로젝트를 삭제함'; end if;
  update public.blueprints set title = 'hacked' where project_id = pa;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: B가 A의 설계도를 수정함'; end if;
  delete from public.blueprints where project_id = pa;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: B가 A의 설계도를 삭제함'; end if;

  -- B가 A의 project_id로 하위 행을 만들면 거부
  begin
    insert into public.blueprints (project_id, version, title, stack, source, generated_by, nodes)
      values (pa, '1.2', 'x', '{}'::jsonb, '{}'::jsonb, 'user', '[{"id":"x"}]'::jsonb);
    raise exception 'CHECK FAILED: B가 A의 프로젝트에 설계도를 만듦';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.spec_inputs (project_id, version, image_count) values (pa, '1.2', 0);
    raise exception 'CHECK FAILED: B가 A의 프로젝트에 스펙을 만듦';
  exception when insufficient_privilege then null;
  end;

  -- B가 자기 프로젝트에 A의 설계도 id를 연결하면 거부(같은 프로젝트의 설계도만 가능)
  begin
    insert into public.prompt_exports (project_id, blueprint_id, format, source_type, content) values (pb, ba, 'prompt', 'blueprint', 'x');
    raise exception 'CHECK FAILED: B가 A의 설계도를 지시서에 연결함';
  exception when foreign_key_violation then null;
  end;

  -- ===== 사용자 A: 프로젝트 삭제 시 연쇄 삭제 (최신 판·지시서 연결 판 포함) =====
  reset role;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from public.projects where id = pa;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CHECK FAILED: A가 자기 프로젝트를 삭제하지 못함(연쇄 삭제 규칙과 충돌 가능)'; end if;
  reset role;
  select count(*) into n from public.blueprints where project_id = pa;
  if n <> 0 then raise exception 'CHECK FAILED: 프로젝트 삭제 후 설계도 %개가 남음', n; end if;
  select count(*) into n from public.prompt_exports where project_id = pa;
  if n <> 0 then raise exception 'CHECK FAILED: 프로젝트 삭제 후 지시서 %개가 남음', n; end if;

  -- ===== 회원 탈퇴: 사용자 삭제 시 프로젝트와 모든 하위 데이터가 연쇄 삭제된다 =====
  insert into public.projects (user_id, name, framework, styling, architecture)
    values (c, 'C project', 'html', 'css', 'type-based') returning id into pc;
  insert into public.spec_inputs (project_id, version, overview, image_count) values (pc, '1.2', 'x', 0);
  insert into public.blueprints (project_id, version, title, stack, source, generated_by, nodes)
    values (pc, '1.2', 'c1', '{}'::jsonb, '{}'::jsonb, 'ai', '[{"id":"x"}]'::jsonb) returning id into ba;
  insert into public.blueprints (project_id, version, title, stack, source, generated_by, nodes)
    values (pc, '1.2', 'c2', '{}'::jsonb, '{}'::jsonb, 'user', '[{"id":"x"}]'::jsonb);
  insert into public.prompt_exports (project_id, blueprint_id, format, source_type, content) values (pc, ba, 'claude_md', 'blueprint', 'x');
  delete from auth.users where id = c;
  select count(*) into n from public.projects where id = pc;
  if n <> 0 then raise exception 'CHECK FAILED: 사용자 삭제 후 프로젝트가 남음'; end if;
  select count(*) into n from public.spec_inputs where project_id = pc;
  if n <> 0 then raise exception 'CHECK FAILED: 사용자 삭제 후 스펙 입력이 남음'; end if;
  select count(*) into n from public.blueprints where project_id = pc;
  if n <> 0 then raise exception 'CHECK FAILED: 사용자 삭제 후 설계도 %개가 남음', n; end if;
  select count(*) into n from public.prompt_exports where project_id = pc;
  if n <> 0 then raise exception 'CHECK FAILED: 사용자 삭제 후 지시서가 남음'; end if;

  -- ===== 비로그인(anon) =====
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform 1 from public.projects limit 1;
    raise exception 'CHECK FAILED: anon이 projects를 조회함';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.blueprints limit 1;
    raise exception 'CHECK FAILED: anon이 blueprints를 조회함';
  exception when insufficient_privilege then null;
  end;

  reset role;
  raise notice 'ALL CHECKS PASSED';
end;
$$;

-- 임시 사용자와 행을 모두 취소한다
rollback;

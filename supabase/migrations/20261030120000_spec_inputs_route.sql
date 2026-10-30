-- spec_inputs에 화면 주소(route) 열을 추가한다. 작업공간에 다시 들어왔을 때 입력칸에 불러오기 위한 값이다.
-- 기존 RLS 정책·GRANT는 그대로 적용된다(표 단위 권한). 한 번에 실행하며 실패하면 전체가 취소된다.
begin;

alter table public.spec_inputs
  add column route text check (route is null or route ~ '^/[^[:space:]]{0,199}$');

commit;

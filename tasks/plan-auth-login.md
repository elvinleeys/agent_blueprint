# Plan: GitHub 로그인 (SPEC-auth-login.md)

> **이 문서는**: GitHub로 로그인하는 기능을 어떤 순서로 만들지 정한 작업 계획이다. 기능 자체의 설명은 `SPEC-auth-login.md`에 있다.
> **목록에 들어 있는 것**: `T1`~`T7`은 작업 한 칸이다. 칸마다 "무엇을 만드는지", "끝났다고 보는 기준", "확인 방법", "건드리는 파일"이 적혀 있다.

의존 순서: 순수 로직 → Supabase 클라이언트 → 콜백 → Proxy → 화면 → 문서. 각 단계 뒤에 `npx vitest run`, `npx tsc --noEmit`, `npx eslint <대상>`을 확인하고 단계마다 커밋한다.

## 작업
- [ ] T1. **로그인 뒤 어디로 보낼지 안전하게 정하는 코드와 테스트 만들기** — `core/auth/redirect.ts` + 테스트 (`safeNextPath`: 보내도 안전한 주소인지 걸러냄, `isProtectedPath`: 로그인이 필요한 주소인지 판정, `decideRedirect`: 어디로 보낼지 결정)
  - 끝났다고 보는 기준(Acceptance): 스펙의 "차단할 입력" 표에 있는 입력은 모두 기본 화면으로 돌아가고(fallback), 정상 경로는 `?쿼리`와 `#해시`가 유지되며, 보호 주소 판정과 이동 결정이 스펙과 같다
  - 확인 방법(Verify): `npx vitest run core/auth`
  - 건드리는 파일(Files): `core/auth/redirect.ts`, `core/auth/redirect.test.ts`
- [ ] T2. **Supabase 연결 코드 만들기** — 브라우저용 `lib/supabase/client.ts`, 로그인 세션을 갱신하는 `lib/supabase/proxy.ts`(`updateSession`)
  - 끝났다고 보는 기준: 서버 전용 키는 쓰지 않고(`NEXT_PUBLIC_` 변수만), `updateSession`이 `{ response, claims }`를 돌려주며 쿠키를 요청과 응답 양쪽에 기록한다
  - 확인 방법: `tsc`, `eslint`
  - 건드리는 파일: `lib/supabase/client.ts`, `lib/supabase/proxy.ts`
- [ ] T3. **GitHub 로그인이 끝나고 돌아오는 주소 처리** — `app/auth/callback/route.ts` + 가짜(mock) 테스트
  - 끝났다고 보는 기준: `code`가 없거나 세션 교환이 실패하거나 예외가 나면 `/login?error=auth`로, 성공하면 `safeNextPath(next)`로 보낸다. `next=//evil.com`처럼 바깥 주소를 넣으면 `/projects`로 보낸다
  - 확인 방법: 테스트에서 응답의 `Location` 헤더를 비교한다. 실제 로직은 `lib/auth/callback-handler.ts`에 두고 라우트 파일은 연결만 한다(`app/`에는 라우팅 파일만 둔다는 규칙, draft와 같은 방식)
  - 건드리는 파일: `app/auth/callback/route.ts`, `lib/auth/callback-handler.ts`, `lib/auth/callback-handler.test.ts`
- [ ] T4. **로그인 상태에 따라 주소를 이동시키는 루트 `proxy.ts` 적용**
  - 끝났다고 보는 기준: 로그인하지 않은 사용자가 `/projects`·`/account`에 가면 `/login?next=...`로 보낸다(세션 쿠키도 복사). 로그인한 사용자가 `/login`에 오면 안전한 `next`로 보낸다. `matcher`가 이미지·스타일 같은 정적 파일을 제외하고, `/api/*`는 이동시키지 않는다
  - 확인 방법: `npm run build`의 Proxy 항목, `npm run dev`로 직접 이동 확인
  - 건드리는 파일: `proxy.ts`
- [ ] T5. **로그인·계정 화면과 버튼 만들기**
  - 끝났다고 보는 기준: `/login`·`/account`가 로딩 대기 구간(`Suspense`) 안에서 요청 데이터를 읽고 빌드를 통과한다. `?error=auth`일 때 오류 문구가 나온다. 계정 화면에는 GitHub 이름·이메일·로그아웃만 표시하고, 로그아웃하면 `/login`으로 간다
  - 확인 방법: `npm run build`, 사용자가 직접 로그인·로그아웃
  - 건드리는 파일: `app/login/page.tsx`, `app/account/page.tsx`, `components/auth/LoginButton.tsx`, `components/auth/LogoutButton.tsx`
- [ ] T6. **설명 문서 `docs/auth-login.md`를 쓰고 `CLAUDE.md` 폴더 구조 갱신**
  - 끝났다고 보는 기준: Supabase·GitHub 설정 체크리스트, 내 컴퓨터에서 확인하는 절차, 콘솔 예시 2개(400이 나오는지 확인하는 것 / 실제 호출, 비용 표기), `CLAUDE.md` 폴더 구조 반영
  - 확인 방법: 문서를 읽어 확인
  - 건드리는 파일: `docs/auth-login.md`, `CLAUDE.md`
- [ ] T7. **마지막 확인**: `vitest`, `tsc`, `eslint`, `npm run build` 결과를 보고하고, 사용자가 직접 확인할 체크리스트(스펙 Success Criteria 2~7번)를 준다

## 병렬·순차 (어느 칸을 먼저 해야 하나)
T1은 다른 칸과 상관없이 먼저 할 수 있다. T2를 끝낸 뒤 T3·T4를 한다(T4는 T1·T2 둘 다 필요). T5는 T1·T2가 필요하다. T6은 마지막이다. 한 번에 한 단계씩 구현한다.

## 위험 구간 (구현 중 다시 확인할 것)
- `@supabase/ssr` 0.12.7의 `getClaims()`가 무엇을 돌려주는지, `user_metadata`가 들어 있는지(공식 문서·설치된 타입으로 확인)
- Proxy에서 쿠키를 복사하는 방식(`NextResponse.next({ request })` + `setAll`)
- Cache Components 빌드에서 `searchParams`·`cookies()`를 읽는 위치

# Plan: GitHub 로그인 (SPEC-auth-login.md)

의존 순서: 순수 로직 → Supabase 클라이언트 → 콜백 → Proxy → 화면 → 문서. 각 단계 뒤에 `npx vitest run`, `npx tsc --noEmit`, `npx eslint <대상>`을 확인하고 단계마다 커밋한다.

## 작업
- [ ] T1. `core/auth/redirect.ts` + 테스트 (`safeNextPath`, `isProtectedPath`, `decideRedirect`)
  - Acceptance: 스펙의 차단 입력 표 전부 fallback, 정상 경로는 쿼리·해시 유지, 보호 경로 판정·리다이렉트 결정 일치
  - Verify: `npx vitest run core/auth`
  - Files: `core/auth/redirect.ts`, `core/auth/redirect.test.ts`
- [ ] T2. `lib/supabase/client.ts`(브라우저), `lib/supabase/proxy.ts`(`updateSession`)
  - Acceptance: 서버 키 참조 없음(`NEXT_PUBLIC_`만), `updateSession`이 `{ response, claims }` 반환·쿠키를 요청과 응답에 기록
  - Verify: `tsc`, `eslint`
  - Files: `lib/supabase/client.ts`, `lib/supabase/proxy.ts`
- [ ] T3. `app/auth/callback/route.ts` + mock 테스트
  - Acceptance: code 없음/교환 실패/예외 → `/login?error=auth`, 성공 → `safeNextPath(next)`, `next=//evil.com` → `/projects`
  - Verify: 테스트의 `Location` 헤더 단언. 로직은 `lib/auth/callback-handler.ts`로 두고 라우트는 연결만(app/ 규칙, draft와 같은 방식)
  - Files: `app/auth/callback/route.ts`, `lib/auth/callback-handler.ts`, `lib/auth/callback-handler.test.ts`
- [ ] T4. `proxy.ts`(루트) 적용
  - Acceptance: 비로그인 `/projects`·`/account` → `/login?next=...`(쿠키 복사), 로그인+`/login` → 안전한 next, `matcher`가 정적 자산 제외, `/api/*`는 리다이렉트 안 함
  - Verify: `npm run build`의 Proxy 항목, `npm run dev` 수동 확인(리다이렉트)
  - Files: `proxy.ts`
- [ ] T5. 로그인·계정 화면과 버튼
  - Acceptance: `/login`·`/account`가 Suspense 안에서 요청 데이터를 읽고 빌드 통과, `?error=auth` 문구, GitHub 이름·이메일·로그아웃만 표시, 로그아웃 후 `/login`
  - Verify: `npm run build`, 수동 로그인·로그아웃(사용자)
  - Files: `app/login/page.tsx`, `app/account/page.tsx`, `components/auth/LoginButton.tsx`, `components/auth/LogoutButton.tsx`
- [ ] T6. `docs/auth-login.md` + `CLAUDE.md` 구조 갱신
  - Acceptance: Supabase·GitHub 설정 체크리스트, 로컬 확인 절차, 콘솔 예시 2개(400 확인 / 실제 호출, 비용 표기), CLAUDE.md 폴더 구조 반영
  - Verify: 문서 검토
  - Files: `docs/auth-login.md`, `CLAUDE.md`
- [ ] T7. 최종 확인: `vitest`, `tsc`, `eslint`, `npm run build` 결과 보고 + 사용자 수동 확인 체크리스트(Success Criteria 2~7)

## 병렬·순차
T1은 독립. T2→T3·T4(T4는 T1·T2 필요). T5는 T1·T2 필요. T6은 마지막. 한 번에 한 단계씩 구현.

## 위험 구간 (구현 중 재확인)
- `@supabase/ssr` 0.12.7의 `getClaims()` 반환 형태와 `user_metadata` 포함 여부(공식 문서·설치된 타입으로 확인)
- Proxy에서 쿠키 복사 방식(`NextResponse.next({ request })` + `setAll`)
- Cache Components 빌드에서 `searchParams`·`cookies()` 읽는 위치

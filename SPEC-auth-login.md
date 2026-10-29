# Spec: GitHub 로그인 (F-015, S-08 로그인 · S-09 계정 최소 버전)

단일 기능이라 capability map은 만들지 않는다. 구현은 승인 후 시작한다. 작업 순서는 `tasks/plan-auth-login.md` 참조.
근거: `CLAUDE.md`(인증·Supabase 규칙), `SPEC-draft-route.md`(서버 클라이언트·`getClaims()` 결정), Next.js 16.4.3 로컬 문서(`node_modules/next/dist/docs/01-app/`의 `proxy.md`, `authentication-with-cache-components.md`).

## Objective
GitHub OAuth(Supabase Auth)로 로그인·로그아웃하고, 비로그인 사용자가 `/projects`·`/account`에 접근하면 `/login`으로 보낸다. 로그인 후에는 원래 가려던 화면으로 돌아온다. 계정 화면은 이메일·GitHub 이름·로그아웃 버튼만 둔다. 이 작업이 끝나면 `/api/draft`를 로그인 상태에서 호출해 401이 풀리는 것을 브라우저에서 확인할 수 있다.

## 조사 결과

### 세션 갱신: Next 16에서는 `middleware`가 아니라 `proxy`
- 로컬 문서(`proxy.md`): `middleware` 파일 규칙은 Next 16에서 **deprecated, `proxy`로 이름 변경**. 프로젝트 루트(`app/`와 같은 층)에 `proxy.ts`를 두고 `export function proxy(request)`와 `export const config = { matcher }`를 내보낸다. 기본 런타임은 **Node.js**(`runtime` 옵션은 쓸 수 없음).
- 따라서 `middleware.ts`는 만들지 않고 **`proxy.ts`**를 쓴다. `SPEC-draft-route.md` Risks의 "세션 갱신 Proxy는 로그인 흐름 구현 때 처리"가 이 작업이다.
- `@supabase/ssr` 패턴: 요청마다 `createServerClient`로 `getClaims()`를 호출하면 만료된 토큰이 갱신되고, 새 쿠키를 **요청과 응답 양쪽**에 써야 한다. 리다이렉트 응답을 새로 만들 때도 갱신된 쿠키를 복사해야 세션이 끊기지 않는다.
- 로컬 문서는 Proxy를 유일한 인증 장치로 두지 말라는 취지다(렌더 코드와 별개로 호출될 수 있음). 그래서 **2중 방어**: Proxy는 리다이렉트 UX·세션 갱신, `/account` 페이지는 렌더 시 `getClaims()`로 한 번 더 확인하고, API는 기존대로 자체 401.

### Cache Components가 켜져 있음 (`cacheComponents: true`)
- 요청 시점 데이터(`cookies()`, `searchParams`)를 읽는 컴포넌트는 **`<Suspense>` 경계 안**에 있어야 한다. 밖에서 읽으면 빌드 오류다(`authentication-with-cache-components.md`). `/login`(`searchParams`로 `next`·`error`를 읽음)과 `/account`(세션을 읽음) 모두 이 규칙을 따른다.

### 환경변수 이름 점검 (값은 읽지 않음)
| 위치 | 이름 |
| --- | --- |
| `.env.example` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` |
| `CLAUDE.md` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (URL 변수는 언급 없음) |
| 코드(`lib/supabase/server.ts`) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
- 위 세 곳은 서로 일치한다.
- **`.env.local`은 이 세션의 권한 규칙(`Read(.env.local)` 거부)이 읽는 명령을 막아 확인하지 못했다.** 규칙을 우회하지 않았다. 사용자가 직접 `! cut -d= -f1 .env.local`을 실행하면 이름만 출력된다(값은 나오지 않음). 위 이름 중 `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`가 있는지 확인해 주세요. 옛 이름 `NEXT_PUBLIC_SUPABASE_ANON_KEY`가 남아 있으면 바꿔야 한다.

## Assumptions (틀리면 알려주세요)
1. 로그인 방식은 Supabase의 **PKCE 흐름**(기본값): 브라우저에서 `signInWithOAuth` → GitHub → Supabase → `/auth/callback?code=...` → 서버에서 `exchangeCodeForSession`.
2. 로그인 후 `next`가 없거나 안전하지 않으면 **`/projects`**로 보낸다(S-02 목록).
3. 보호 대상 화면은 `/projects`와 그 하위, `/account`와 그 하위. `/`, `/login`, `/auth/*`는 공개. `/api/*`는 Proxy가 리다이렉트하지 않고 각 라우트가 401을 낸다(CLAUDE.md "모든 API 라우트는 세션 확인 후 401").
4. 로그인 상태에서 `/login`에 오면 안전한 `next`(없으면 `/projects`)로 보낸다.
5. 로그아웃은 브라우저에서 `supabase.auth.signOut()` 후 `/login`으로 이동한다(서버 액션 없음, 가장 작은 방식).
6. GitHub 이름은 JWT claims의 `user_metadata.user_name`(없으면 `full_name`, 그것도 없으면 `name`)을 쓴다. 이메일은 `claims.email`. 값이 없으면 "-"를 표시한다.
7. 화면 디자인은 이번 범위 밖이다. 기존 Tailwind 최소 마크업만 쓴다(`app/login/page.tsx`의 임시 페이지를 교체).
8. 새 의존성은 없다(`@supabase/ssr`·`@supabase/supabase-js` 설치됨).
9. `/auth/callback`의 리다이렉트 기준은 요청 URL의 origin이다. Vercel 프리뷰·프로덕션 도메인 전환은 Supabase의 Redirect URLs 허용 목록이 맡는다.

## 설계

### 파일과 책임
| 파일 | 책임 | 비고 |
| --- | --- | --- |
| `core/auth/redirect.ts` | **순수 함수**: `safeNextPath`, `isProtectedPath`, `decideRedirect` | React·Next import 금지. 단위 테스트 대상 |
| `lib/supabase/client.ts` | 브라우저용 `createBrowserClient`(`NEXT_PUBLIC_` 값만) | 신규 |
| `lib/supabase/server.ts` | 기존 그대로 재사용 | 변경 없음 |
| `lib/supabase/proxy.ts` | `updateSession(request)`: 세션 갱신 + claims 반환, 쿠키를 응답에 기록 | 신규, `server-only` 아님(Proxy 런타임) |
| `proxy.ts`(루트) | `updateSession` → `decideRedirect` → 통과 또는 리다이렉트(쿠키 복사). `matcher`는 정적 자산 제외 | 신규. 파일 규칙상 루트에 둔다 |
| `app/login/page.tsx` | `searchParams`(`next`, `error`)를 읽어 `<Suspense>` 안에서 로그인 버튼 렌더 | 라우팅만. 임시 페이지 교체 |
| `components/auth/LoginButton.tsx` | 클라이언트: `signInWithOAuth({provider:"github", redirectTo: <origin>/auth/callback?next=<safeNext>})` | 신규 |
| `app/auth/callback/route.ts` | `code`를 세션으로 교환 → 성공 시 `safeNextPath(next)`로, 실패·code 없음은 `/login?error=auth` | 임시 501 스텁 교체 |
| `app/account/page.tsx` | `<Suspense>` 안에서 `getClaims()`로 이메일·GitHub 이름 표시, 없으면 `/login?next=/account` | 임시 페이지 교체 |
| `components/auth/LogoutButton.tsx` | 클라이언트: `signOut()` 후 `/login` 이동 | 신규 |
| `docs/auth-login.md` | Supabase·GitHub 설정 절차, 로컬 확인 방법, `/api/draft` 콘솔 예시 | 신규 |
| `CLAUDE.md` | 폴더 구조에 `core/auth/`, `proxy.ts`, `lib/supabase/client.ts`·`proxy.ts` 반영 | 구조가 바뀌면 갱신하라는 비고 준수 |

### 리다이렉트·`next` 판단 (`core/auth/redirect.ts`)
```ts
safeNextPath(next: unknown, fallback = "/projects"): string
isProtectedPath(pathname: string): boolean               // /projects, /account 및 하위
decideRedirect(a: { pathname: string; search: string; isAuthed: boolean }): string | null
// 비로그인 + 보호 경로 → "/login?next=<경로+쿼리 인코딩>", 로그인 + /login → safeNextPath(...), 그 외 null
```
`safeNextPath`가 **같은 사이트 안의 경로만** 통과시킨다. 아래는 모두 `fallback`으로 바꾼다:

| 입력 | 이유 |
| --- | --- |
| `//evil.com`, `/\evil.com`, `/` + 탭 + `/evil.com` | 프로토콜 상대 URL·역슬래시·제어문자(브라우저가 `//`로 해석) |
| `https://evil.com`, `javascript:alert(1)`, `evil.com` | `/`로 시작하지 않음 |
| 문자열이 아님(배열·undefined·null), 빈 문자열, 512자 초과 | 입력 검증 |
| `/login...`, `/auth/...` | 로그인 루프 방지 |

통과 조건은 `/`로 시작하고 `//`·`\`·제어문자가 없으며, `new URL(next, "http://localhost")`의 origin이 그대로인 것. 쿼리·해시는 유지한다(`/projects?tab=1`).

### 흐름
1. 비로그인으로 `/projects?tab=1` 접근 → Proxy가 `/login?next=%2Fprojects%3Ftab%3D1`로 리다이렉트.
2. 로그인 버튼 → GitHub → Supabase → `/auth/callback?code=...&next=<위 값>`.
3. 콜백이 `exchangeCodeForSession(code)` → 세션 쿠키 설정 → `safeNextPath(next)`로 리다이렉트. 실패·code 없음은 `/login?error=auth`(`next`는 보존하지 않아도 됨).
4. 이후 요청마다 Proxy가 `getClaims()`로 토큰을 갱신한다.

### 오류 처리
- `/login?error=auth` → 사용자용 한국어 문구("로그인에 실패했습니다. 다시 시도해 주세요."). Supabase 원본 에러는 서버 로그에만(CLAUDE.md).
- `signInWithOAuth` 실패(네트워크 등) → 버튼 아래 문구, 버튼은 다시 누를 수 있다.
- 콜백에서 던져진 예외도 `/login?error=auth`로 수렴시킨다.

## Tech Stack
Next.js 16.4.3 App Router(Cache Components), TypeScript, Tailwind, `@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.118, Vitest 5.

## Commands
```
npx vitest run core lib
npx tsc --noEmit
npx eslint core lib app components proxy.ts
npm run build
npm run dev      # 로컬 수동 확인: http://localhost:3000/projects → /login
```

## Code Style
```ts
// core/auth/redirect.ts — 순수 함수, 한국어 주석은 이유만
const UNSAFE = /[\x00-\x1f\x7f\\]/;
export function safeNextPath(next: unknown, fallback = "/projects"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || UNSAFE.test(next)) return fallback;
  // 브라우저가 해석한 결과가 같은 origin인지 한 번 더 확인한다
  const url = new URL(next, "http://localhost");
  if (url.origin !== "http://localhost" || /^\/(login|auth)(\/|$|\?)/.test(next)) return fallback;
  return url.pathname + url.search + url.hash;
}
```

## Testing Strategy
- **단위 테스트(`core/auth/redirect.test.ts`)**: 위 표의 모든 차단 입력, 정상 경로(쿼리·해시 유지), `fallback` 지정, `isProtectedPath`(`/projects`, `/projects/1`, `/account`는 보호, `/projectsx`·`/`·`/login`은 비보호), `decideRedirect`(비로그인+보호→`/login?next=...`가 인코딩되어 있고 다시 `safeNextPath`를 통과, 로그인+`/login`→안전한 next, 로그인+보호→null, 비로그인+공개→null).
- 콜백 라우트 테스트(mock): code 없음 → `/login?error=auth`, 교환 실패 → 같은 곳, 성공 → `next` 경로, 성공 + `next=//evil.com` → `/projects`. 외부 주소로 나가지 않는 것을 `Location` 헤더로 확인.
- Proxy·로그인 화면·계정 화면은 자동 테스트 없이 `npm run build` + 로컬 수동 확인(아래 Success Criteria). 실제 GitHub 로그인은 사용자가 브라우저에서 확인한다.

## Boundaries
- Always: 서버에서 사용자 확인은 `getClaims()`, 리다이렉트 목적지는 `safeNextPath`를 거친다, 브라우저에는 `NEXT_PUBLIC_` 값만 쓴다, 에러 원문은 서버 로그만
- Ask first: 새 의존성, `proxy.ts` 외의 전역 설정 변경, 로그인 방식 변경(이메일·다른 OAuth 추가), `/api/*`까지 Proxy에서 막는 것
- Never: `SUPABASE_SERVICE_ROLE_KEY`를 이 작업에서 사용, `getSession()`으로 로그인 판단, `next`를 검증 없이 리다이렉트, `.env.local` 읽기·커밋, DB 표·RLS(다음 작업), 인라인 스타일, `app/`에 라우팅 외 로직

## Success Criteria
1. 단위·콜백 테스트가 통과하고 `tsc`·`eslint`·`npm run build`가 통과한다(`/login`, `/account`가 Suspense 규칙 위반 없이 빌드됨).
2. 비로그인으로 `/projects`·`/account` 접근 시 `/login?next=...`로 이동하고, 로그인 후 원래 주소로 돌아온다.
3. `next=//evil.com`, `next=https://evil.com`을 붙여도 로그인 후 `/projects`로 간다(외부로 나가지 않음).
4. 인증 실패(예: GitHub에서 취소) 시 `/login?error=auth`와 안내 문구가 보인다.
5. `/account`에 이메일·GitHub 이름·로그아웃 버튼만 있고, 로그아웃 후 `/projects` 접근은 다시 `/login`으로 간다.
6. 로그인 상태에서 `docs/auth-login.md`의 콘솔 예시 1이 `/api/draft`에서 **400(`invalid_input`, 입력 없음)**을 받는다. 즉 401이 아니다 = 세션이 서버에 전달됨. 로그아웃 상태에서는 같은 코드가 401.
7. `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 이름이 `.env.local`에 있음을 사용자가 확인한다.

## 콘솔 확인 예시 (docs/auth-login.md에 그대로 넣을 내용)
```js
// 1) 비용 없는 확인: spec이 비어 있으면 OpenAI 호출 전에 400이 난다
//    (로그아웃 상태 → 401, 로그인 상태 → 400 invalid_input)
const f = new FormData();
f.set("stack", JSON.stringify({ framework: "next", styling: "tailwind", architecture: "feature-based" }));
f.set("spec", JSON.stringify({}));
const r = await fetch("/api/draft", { method: "POST", body: f });
console.log(r.status, await r.json());

// 2) 실제 초안 생성 (OpenAI 호출, 1회 약 $0.01~0.02, 약 30초). 직접 실행할 때만
f.set("spec", JSON.stringify({ overview: "상품 상세 페이지: 갤러리, 정보, 장바구니 담기" }));
const r2 = await fetch("/api/draft", { method: "POST", body: f });
console.log(r2.status, await r2.json());
```

## Risks
| 위험 | 대응 |
| --- | --- |
| Supabase 대시보드 설정 누락(GitHub provider 비활성, Redirect URLs에 `http://localhost:3000/auth/callback`·배포 주소 없음)이면 로그인이 코드와 무관하게 실패 | `docs/auth-login.md`에 단계별 체크리스트. GitHub OAuth App의 Callback URL은 `https://<프로젝트>.supabase.co/auth/v1/callback`(앱 주소가 아님) |
| 리다이렉트 응답에 갱신된 쿠키를 복사하지 않으면 세션이 끊김 | `proxy.ts`에서 갱신 응답의 쿠키를 리다이렉트 응답에 복사(문서화된 `@supabase/ssr` 주의점) |
| Proxy가 모든 요청에서 `getClaims()`를 호출 | 비대칭 키 프로젝트는 서명 검증이 로컬(JWKS 캐시)이라 비용이 작다. 대칭 키 프로젝트면 Auth 서버 호출이 생길 수 있음 → 구현 시 확인. `matcher`로 정적 자산은 제외 |
| 로컬 문서의 Proxy 안내(렌더와 분리 호출) 때문에 Proxy만 믿으면 우회 가능 | `/account`는 렌더에서 재확인, API는 자체 401 |
| 사용자 단위 호출 제한 없음(비용) | 이전 스펙 Risks와 동일, 범위 밖 |

## Open Questions
1. **Supabase 대시보드에서 GitHub provider와 GitHub OAuth App은 이미 만드셨나요?** 아직이면 `docs/auth-login.md`의 절차를 따라 사용자가 설정해야 합니다(코드로 할 수 없음).
2. **기본 복귀 화면을 `/projects`로 해도 되나요?** (현재 홈 `/`는 공개 S-01)
3. **로그아웃 방식**: 브라우저 `signOut()` 후 이동(제안)으로 충분한가요, 서버 액션이 필요하신가요?
4. **`.env.local` 이름 확인**: `! cut -d= -f1 .env.local` 결과를 알려 주시겠어요? (제가 실행하면 권한 규칙에 막힙니다)
5. 로그인 상태에서 `/login`에 오면 **자동으로 `next`/`/projects`로 보내는 것**(가정 4)에 동의하시나요?

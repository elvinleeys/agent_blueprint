# GitHub 로그인 설정과 확인 (F-015)

## 1. 설정 체크리스트 (코드 밖)
- Supabase 대시보드 → Authentication → Providers → GitHub 켜기(GitHub OAuth App의 Client ID·Secret 입력)
- GitHub OAuth App의 Authorization callback URL: `https://<프로젝트>.supabase.co/auth/v1/callback` (앱 주소가 아님)
- Supabase → Authentication → URL Configuration → Redirect URLs에 `http://localhost:3000/auth/callback`과 배포 주소의 `/auth/callback` 추가
- `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (이 작업에서는 `SUPABASE_SERVICE_ROLE_KEY`를 쓰지 않는다)

## 2. 동작
| 상황 | 결과 |
| --- | --- |
| 비로그인으로 `/projects`, `/account` 접근 | `/login?next=<원래 경로>`로 이동 (`proxy.ts`) |
| 로그인 성공 | `next`(같은 사이트 안의 경로만 허용, 없으면 `/projects`)로 이동 |
| 로그인 실패·취소 | `/login?error=auth`와 안내 문구 |
| 로그인 상태에서 `/login` | `next` 또는 `/projects`로 이동 |
| 로그아웃 | `signOut()` → `/login` 이동 + `router.refresh()` |

## 3. 로컬 확인
1. `npm run dev` 후 로그아웃 상태에서 `http://localhost:3000/projects` → `/login?next=%2Fprojects`
2. `http://localhost:3000/login?next=//evil.com` 에서 로그인 → `/projects`로 도착(외부로 나가지 않음)
3. `/account`에서 이메일·GitHub 이름 확인 → 로그아웃 → `/projects` 접근 시 다시 `/login`

## 4. `/api/draft` 브라우저 콘솔 확인
로그인한 탭의 개발자 도구 콘솔에서 실행한다.

```js
// 1) 비용 없는 확인: spec이 비어 있으면 OpenAI 호출 전에 400이 난다
//    (로그아웃 상태 → 401, 로그인 상태 → 400 invalid_input)
const f = new FormData();
f.set("stack", JSON.stringify({ framework: "next", styling: "tailwind", architecture: "feature-based" }));
f.set("spec", JSON.stringify({}));
const r = await fetch("/api/draft", { method: "POST", body: f });
console.log(r.status, await r.json());

// 2) 실제 초안 생성 (OpenAI 호출, 1회 약 $0.01~0.02, 약 15~30초). 직접 실행할 때만
//    예시 1과 별개로 단독 실행된다(FormData를 새로 만든다)
const g = new FormData();
g.set("stack", JSON.stringify({ framework: "next", styling: "tailwind", architecture: "feature-based" }));
g.set("spec", JSON.stringify({ overview: "상품 상세 페이지: 갤러리, 정보, 장바구니 담기" }));
const r2 = await fetch("/api/draft", { method: "POST", body: g });
console.log(r2.status, await r2.json());
```

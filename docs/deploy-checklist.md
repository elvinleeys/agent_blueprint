# 배포 체크리스트 (Vercel + Supabase)

값은 이 문서에 적지 않는다. 환경변수 값은 `.env.local`(커밋 금지)과 Vercel 설정에만 둔다.

## 0. 사전 점검 결과 (2026-11-02)

- `npx next build` 통과(경고·오류 없음). 환경변수를 비운 채로도 빌드는 통과한다(값은 실행 때 읽는다). 단 `NEXT_PUBLIC_*`는 **빌드 때 브라우저 번들에 박힌다**(아래 2절).
- 코드에 박힌 로컬 주소: `core/auth/redirect.ts`의 `http://localhost`뿐이고, 이동 경로가 같은 사이트 안인지 검사하려고 `URL`을 만드는 가짜 기준 주소다. 배포에서 깨지지 않는다.
- 로그인 주소는 모두 현재 접속 주소에서 만든다: `LoginButton`은 `window.location.origin`, `/auth/callback`은 요청 URL의 origin을 쓴다. 코드에 도메인을 적을 곳이 없다.
- `app/api/draft/route.ts`의 `maxDuration = 70`(초). 요금제의 함수 최대 실행 시간이 70초보다 짧으면 초안 생성이 중간에 끊긴다(3절).

## 1. 환경변수 이름

코드에서 읽는 것(`process.env`)만 찾았다. 값은 읽지 않았다.

| 이름 | 어디서 읽나 | 노출 | Vercel에 설정 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase/client.ts`, `server.ts`, `proxy.ts` | 브라우저 공개 | 필요 (Production·Preview) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 위와 같음 | 브라우저 공개(publishable key) | 필요 (Production·Preview) |
| `OPENAI_API_KEY` | `lib/ai/draft-blueprint.ts`가 `new OpenAI()`로 SDK 기본 동작에 맡겨 읽음(코드에 이름이 직접 보이지 않는다). `scripts/test-draft.ts`도 읽음 | 서버 전용 | 필요 (**`NEXT_PUBLIC_` 접두사 금지**) |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.example`에만 있고 코드에서 읽지 않는다 | 서버 전용 | **설정하지 않는다** (필요해질 때만) |

- 모델 이름·가격은 환경변수가 아니라 코드(`lib/ai/draft-blueprint.ts`)에 있다.
- `.env.local`은 `.gitignore`에 있고 저장소에 올라가 있지 않다(`.env.example`만 추적).

## 2. Vercel 설정

1. 저장소를 Vercel 프로젝트로 가져온다. Framework는 Next.js로 자동 인식된다. Build Command·Output은 기본값(`next build`)을 쓴다. `vercel.json`은 없다.
2. Settings → Environment Variables에 1절의 필요한 3개를 넣는다. `OPENAI_API_KEY`는 Sensitive로 둔다.
3. **환경변수를 넣은 뒤에 배포(또는 재배포)한다.** `NEXT_PUBLIC_*`는 빌드 때 번들에 들어가므로, 나중에 값을 바꾸면 재배포해야 반영된다. 비어 있는 채로 빌드해도 빌드는 통과하지만 로그인이 깨진다.
4. Node.js 버전은 프로젝트 기본값을 쓴다(`package.json`에 `engines` 지정 없음).
5. 함수 실행 시간: `/api/draft`는 최대 70초를 요청한다. Settings → Functions의 최대 실행 시간(요금제·Fluid Compute 설정에 따라 다름)이 70초 이상인지 확인한다. 부족하면 초안 생성이 끝나기 전에 끊기고 화면은 "연결이 끊겼습니다"를 보여 준다.
6. 요청 본문 한도: Vercel 함수는 4.5MB다. 이미지는 브라우저에서 합계 4MB 이하로 줄여 보내도록 이미 맞춰 두었다.
7. 도메인이 정해지면 Production URL을 적어 둔다(아래 Supabase 설정에 쓴다).

## 3. Supabase 설정

1. **마이그레이션 적용 확인**: `supabase/migrations/`의 두 파일(`20261029120000_create_core_tables.sql`, `20261030120000_spec_inputs_route.sql`)이 배포에 쓰는 프로젝트에 적용돼 있어야 한다(절차: `docs/db-migration.md`). 개발용과 배포용 프로젝트를 나눴다면 배포용에 다시 적용한다. 표 4개(`projects`, `spec_inputs`, `blueprints`, `prompt_exports`)에 RLS가 켜져 있는지 본다.
2. **로그인 주소 추가** (Authentication → URL Configuration):
   - Site URL: 배포 주소 `https://<배포 도메인>`
   - Redirect URLs에 `https://<배포 도메인>/**`와 `http://localhost:3000/**`를 추가한다(`/auth/callback`만 적은 항목은 `?next=` 같은 쿼리가 붙은 돌아올 주소와 맞지 않을 수 있어 `/**`로 넓힌다). 앱이 실제로 돌아올 주소가 이 목록에 없으면 Supabase는 로그인 후 **Site URL(배포 주소)로 보낸다**.
   - **로그인이 필요한 화면은 로컬에서 개발 서버 3000번 포트로만 확인한다.** 다른 포트(예: 3100)로 띄우면 그 주소(`http://localhost:3100/**`)도 Redirect URLs에 추가해야 하고, 추가하지 않으면 로그인 뒤 배포 사이트로 넘어간다.
   - 로그인 설정을 바꾼 뒤에는 **시크릿 창**에서 확인한다(이전 세션 쿠키와 캐시가 섞이지 않는다).
   - Vercel 미리보기 배포를 로그인까지 쓸 때만 `https://*-<팀 슬러그>.vercel.app/auth/callback` 같은 패턴을 추가한다(와일드카드 범위가 넓으니 필요할 때만).
3. **GitHub 로그인**(Authentication → Providers → GitHub): 켜져 있고 Client ID·Secret이 들어 있어야 한다.
4. **GitHub OAuth App**: Authorization callback URL은 앱 주소가 아니라 **Supabase의 콜백** `https://<project-id>.supabase.co/auth/v1/callback`이다. 배포 도메인을 바꿔도 이 값은 그대로다.

## 4. 배포 후 확인 항목

OpenAI 호출은 초안 생성 한 번뿐이다(비용이 든다). 텍스트만 짧게 입력해 한 번만 확인한다.

1. **로그인**
   - 배포 주소 `/`에서 "GitHub로 시작하기" → GitHub 승인 → `/projects`로 돌아오는지.
   - 로그아웃 후 `/projects` 직접 접근 시 `/?next=%2Fprojects`로 가고, 로그인하면 원래 주소로 돌아오는지.
   - 실패하면 `/?error=auth` 안내가 뜬다(3절 2·4번을 먼저 의심).
   - 로컬(`http://localhost:3000`)에서 로그인했는데 배포 사이트로 넘어가면 Redirect URLs 불일치다(3절 2번, 5절 표). 시크릿 창에서 다시 확인한다.
2. **프로젝트 생성**: 새 프로젝트를 만들면 작업공간으로 이동하는지. 새로고침해도 유지되는지.
3. **초안 생성 스트리밍과 하트비트**: 스펙 항목을 하나 이상 적고 "초안 생성". 진행 단계(요청 접수 → 생성 중 → 검증 …)가 차례로 바뀌고 끝나면 트리·미리보기가 나오는지. 10초마다 하트비트(`ping`)가 와서 30초 무수신으로 끊김 처리되지 않는지(브라우저 개발자 도구 Network의 `/api/draft` 응답이 완료 전에 조금씩 도착하는지). 응답이 끝까지 모아서 한 번에 오면 스트리밍이 막힌 것이다(중간에 응답을 버퍼링하는 프록시가 없는지 확인).
4. **편집 자동 저장**: 노드 이름이나 책임을 고치면 약 1초 뒤 "저장됨"이 뜨는지. 새로고침 후 수정이 남아 있는지. 처음 수정하면 AI 초안은 그대로 두고 새 판이 생기는지(Supabase `blueprints` 행).
5. **검사**: 검사 결과 카드에 오류·경고가 나오고 노드 표시가 붙는지. 노드를 고쳐 위반이 사라지면 결과가 바뀌는지.
6. **내보내기** (지시서 탭): 화면 주소 입력 → "내보내기" → 화면 규칙 파일·지시서 두 문서가 나오는지, 복사와 `.md` 내려받기가 되는지. Supabase `prompt_exports`에 행 2개가 생기는지, 같은 내용으로 다시 내보내면 행이 늘지 않는지(`recorded`가 false). 내보낸 뒤 노드를 하나 고치면 새 판이 생기는지.
7. **삭제**: 설정 탭 → 프로젝트 삭제 → 이름 입력 → 삭제 후 목록으로 이동하는지. Supabase에서 그 프로젝트의 `blueprints`·`spec_inputs`·`prompt_exports` 행이 함께 사라졌는지.
8. **다른 계정 격리**: 다른 GitHub 계정으로 로그인하면 첫 계정의 프로젝트가 목록에 보이지 않고, 첫 계정의 프로젝트 주소로 직접 가면 찾을 수 없다고 나오는지(RLS).

## 5. 문제가 생겼을 때 볼 곳

| 증상 | 볼 곳 |
| --- | --- |
| 빌드 실패 | Vercel → Deployments → 해당 배포 → Build Logs. 로컬에서 `npx tsc --noEmit`, `npm run lint`, `npm run build` 재현 |
| 로그인이 `/?error=auth`로 돌아옴 | Supabase Redirect URLs·Site URL(3절 2), GitHub OAuth App의 callback URL(3절 4), Supabase → Logs → Auth |
| 로컬에서 로그인했더니 Vercel 사이트로 넘어감(그래서 방금 만든 화면이 "준비 중" 같은 **예전 배포** 모습으로 보임) | 원인: Supabase Redirect URLs에 실제로 돌아올 주소(`http://localhost:3000/...`)가 없어 Site URL(Vercel)로 보내진 것. 해결: Redirect URLs에 `http://localhost:3000/**`와 `<배포 주소>/**` 추가(3절 2). 확인은 시크릿 창에서. 다른 포트로 띄웠다면 그 주소도 추가하거나 3000번으로 확인 |
| 로그인했는데 곧바로 로그아웃됨, 모든 API가 401 | `NEXT_PUBLIC_SUPABASE_*` 값이 맞는지, 값을 바꾼 뒤 **재배포**했는지. 브라우저 쿠키 `sb-…` 존재 여부 |
| 초안 생성이 "연결이 끊겼습니다" | Vercel → Logs(Functions)에서 `/api/draft`의 실행 시간·타임아웃. 최대 실행 시간 설정(2절 5). 하트비트가 안 오면 스트리밍 버퍼링 의심 |
| 초안 생성이 502·429·504 | OpenAI 계정의 키·결제·한도·모델 접근 권한. `OPENAI_API_KEY`가 Production에 있는지. Vercel Function 로그(원문 오류는 서버 로그에만 남는다) |
| 초안이 422로 실패 | 응답의 실패 항목(화면에 표시). 같은 입력으로 다시 시도 |
| 저장·내보내기가 503 | Supabase → Logs(Postgres·API), 마이그레이션 적용 여부(3절 1). Vercel Function 로그의 `db error:` 줄에 오류 코드·이름만 남는다 |
| 저장·내보내기가 404 | 프로젝트 소유(RLS)나 판 없음. 로그인한 계정이 만든 프로젝트인지 |
| 새 프로젝트가 안 만들어짐·행이 안 보임 | Supabase RLS 정책·GRANT(마이그레이션 SQL의 정책 부분), Table Editor에서 RLS 켜짐 확인 |
| 화면이 예전 값으로 동작 | 환경변수 변경 후 재배포 여부, 브라우저 캐시 |

## 6. 알려진 한계 (배포 관점)

- 경쟁 상태(동시 저장·동시 내보내기)는 처리하지 않았다(`docs/HANDOFF.md`).
- `prompt_exports`와 프로젝트 삭제의 RLS·연쇄 삭제는 아직 실제 Supabase에서 확인하지 못했다. 4절 6·7·8번이 그 확인이다.
- 사용량 제한(요청 횟수·일일 한도)이 없다. 배포 주소를 공개하면 로그인한 누구나 초안 생성을 호출할 수 있어 OpenAI 비용이 늘 수 있다. OpenAI 대시보드에 월 한도를 걸어 두는 것을 권한다.
- 커스텀 도메인·미리보기 배포의 로그인 주소는 도메인마다 3절 2번을 다시 해야 한다.

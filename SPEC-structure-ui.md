# Spec: 구조 설계 흐름 화면 (프로젝트 목록 → 작업공간 → AI 초안 → 트리 보기)

단일 기능(화면 1겹)이라 capability map은 만들지 않는다. 구현은 승인 후 시작한다. 작업 순서는 `tasks/plan-structure-ui.md` 참조.
근거: `CLAUDE.md`, `SPEC-projects-api.md`·`docs/projects-api.md`(API 계약), `SPEC-draft-route.md`, `SPEC-auth-login.md`, `.claude/skills/define-schema/data-model.md`, Next.js 16.4.3 로컬 문서(`cacheComponents: true`).

## Objective
로그인한 사용자가 (1) `/projects`에서 내 프로젝트를 보고 새 프로젝트(이름, 프레임워크·스타일·디렉토리 구조)를 만들고, (2) `/projects/[id]` 작업공간에서 화면 스펙 7개 항목 또는 이미지로 AI 초안을 만들고, (3) 초안을 컴포넌트 트리로 본다. 작업공간에 다시 들어오면 최신 판이 바로 보인다.

진행 순서와 확인 시점(각 단계 끝에 vitest·tsc·eslint·build 결과 보고, 작업 단위 커밋, 사용자 확인 후 다음 단계). 실제 OpenAI 호출은 하지 않는다(B 이후 사용자가 브라우저에서 1회 확인).
- **A0·A**: 끝(사용자 확인 완료). 아래 P부터 새로 시작.
- **A0**: API 404 통일(설계도 불러오기·판 목록).
- **A**: `/projects` 목록·생성 폼, `/projects/[id]` 작업공간 틀(탭 4개), 설정 탭의 이름 수정(`PATCH /api/projects/[id]` 추가).
- **P**: 진입점(홈이 소개+로그인)과 공통 헤더(계정 메뉴).
- **D**: 디자인 기준값(몽타주 토큰)·shadcn/ui 공통 부품.
- **S**: `/api/draft` 스트리밍 전환(단계 알림, lib/ai 콜백, test:draft 진행 출력).
- **B**: 구조 설계 탭(스펙 입력, 이미지, 초안 생성·진행·실패, **구조 미리보기**, 트리 보기, 노드 정보 보기, 자동 보정 내역).

새 순서: **P → D → S → B**(A0·A 완료). 각 단계 끝에 vitest·tsc·eslint·build 결과를 보고하고 작업 단위로 커밋한 뒤 확인을 받는다.

제외: 노드 편집·드래그, 검사 규칙과 결과 표시, 디자인 시스템 정리, 지시서 탭, 판 목록·판 선택 화면, 프로젝트 스택 수정·삭제, 저장하지 않은 수정 확인창(노드 편집 때 추가), AI가 만드는 중인 노드의 부분 표시, 다크 모드, 자체 가입(이메일) 로그인, 몽타주 값 외의 세부 디자인 다듬기.

## 현재 코드에서 확인한 것
- `app/projects/page.tsx`는 "Login Page" 문구가 든 임시 파일, `app/projects/[id]/`는 빈 폴더. `components/`엔 `auth/`만, `store/`는 비어 있음.
- `core/schema/tree.ts`(`buildTree`)는 **아직 없다**(data-model 6절에만 정의). 이번에 만든다.
- `@xyflow/react`, `dagre`, `zustand`는 설치돼 있고 사용처는 없음. 컴포넌트 테스트 도구(jsdom 등)는 없다.
- `/api/draft` 응답: `{ blueprint, meta: { attempts, elapsedMs, normalized: NormalizeChange[], saved | saveError } }`. 실패는 `{ error: { code, message, retryable, fields? } }`.
- `getProject`(lib/db)는 있다. 현재 `GET .../blueprint`·`GET .../revisions`는 프로젝트 소유를 확인하지 않는다.

## Assumptions (틀리면 알려주세요)
1. 목록·작업공간 **첫 화면 데이터는 서버 컴포넌트가 `lib/db`를 직접 호출**해 읽는다(`listProjects`, `getProject`, `loadBlueprint`). 없는·남의 프로젝트는 `notFound()`. 쓰기(생성·초안)는 클라이언트가 `fetch`로 기존 API를 호출한다. `GET` API 404 통일은 별도 개선이며 이 화면이 의존하지는 않는다.
2. `cacheComponents: true`라서 로그인·params를 읽는 부분은 `<Suspense>` 안에 둔다(`/account` 패턴).
3. 탭은 URL이 아니라 **클라이언트 상태**다. 프로젝트 설정·구조 설계만 활성, 디자인 시스템 정리·지시서는 비활성("준비 중"). **프로젝트 설정** 탭은 이름만 수정할 수 있고(`PATCH`), 스택 3가지는 읽기 전용이며 "스택을 바꾸려면 새 프로젝트를 만드세요" 안내를 붙인다.
4. 스택 선택 3개(프레임워크 3 × 스타일 3 × 구조 3)는 27개 조합을 모두 허용한다. 기본값은 next / tailwind / feature-based.
5. 초안 생성은 서버가 새 판으로 저장하므로, 이미 판이 있어도 생성하면 **새 판이 추가되고 화면은 새 초안으로 바뀐다**. 이전 판은 DB에 남는다(보는 화면은 이번 범위 밖).
6. 상태: 스펙 입력·이미지·진행·오류·현재 설계도는 Zustand 스토어 1개(`store/structure-store.ts`)에 둔다. 탭을 오가도 입력이 유지된다.
7. `route` 입력은 선택 1칸이다. 이름 "화면 주소 (선택)", 안내 "Next.js에서 페이지 파일 위치를 정하는 데 쓰입니다. 예: /products/[id]".
8. 서버 변경은 A0의 `GET` 두 개, A의 `PATCH /api/projects/[id]`, S의 `/api/draft` 스트리밍 전환뿐이다. DB 마이그레이션·새 의존성 없음.
9. 초안이 이미 있을 때 생성 버튼 근처에 "새 판으로 추가되며 기존 초안은 보존됩니다" 한 줄을 보여 준다(확인창 없음).

## 단계 A0 — API 404 통일 (선행, 작은 서버 변경)
- `GET /api/projects/[id]/blueprint`, `GET /api/projects/[id]/revisions`가 `getProject`로 먼저 확인한다. 없거나 남의 프로젝트면 404 `not_found`(OpenAI와 무관, DB 1회 추가). 내 프로젝트인데 판이 없으면 200 `{ blueprint: null }` / `{ revisions: [] }` 유지.
- 두 핸들러 테스트(`lib/api/*-handler.test.ts`)에 404 케이스 추가·기존 기대 수정. `docs/projects-api.md`(엔드포인트 표·블록 3 설명)와 `SPEC-projects-api.md` 표기, CLAUDE.md API 표를 맞춘다.
- `revision=N`이 없는 판이어도 프로젝트가 내 것이면 기존처럼 200 `null`.

## 단계 A — 목록·생성·작업공간 틀

### 화면
| 경로 | 내용 |
| --- | --- |
| `/projects` | 헤더(앱 이름, 계정 링크, 로그아웃은 기존 `LogoutButton`). "새 프로젝트" 폼과 프로젝트 카드 목록(이름, 스택 요약, 수정일). 비어 있으면 안내 문구. 카드 클릭 → `/projects/[id]` |
| `/projects/[id]` | 프로젝트 이름·스택 요약 + 탭 4개(프로젝트 설정 / 구조 설계 / 디자인 시스템 정리 / 지시서). 기본 탭은 구조 설계, 단계 A에서는 "단계 B에서 채움" 자리 표시. 비활성 탭은 `disabled`·`aria-disabled` |

### 새 프로젝트 폼
- 필드: 이름(1~100자, 필수), 프레임워크·스타일 방식·디렉토리 구조(각각 라디오 또는 select, 한국어 라벨 + 값 병기).
- 제출: `POST /api/projects` → 201이면 `router.push("/projects/" + id)`. 실패는 `error.message`를 폼 아래에 표시(401이면 `/login`으로), 입력 유지. 제출 중 버튼 비활성·중복 제출 방지.
- 클라이언트 검사는 이름 길이만(나머지는 서버·Zod가 판정). 접근성: label 연결, 오류는 `role="alert"`.

### 프로젝트 이름 수정 (설정 탭)
- `PATCH /api/projects/[id]` 본문 `{ name }`(JSON만, 1MB 이하, 이름만 받음. 다른 필드가 있으면 400). 이름은 trim 후 1~100자(생성 폼과 같은 규칙, `createProject`와 검증 공유), 빈 이름은 거부(`invalid_data`, `fields`). 없는·남의 프로젝트는 404, 성공 200 `{ project }`, 비로그인 401. 로직은 `lib/db/projects.ts`의 `renameProject` + `lib/api/project-handler.ts`, 라우트는 얇게(`app/api/projects/[id]/route.ts`).
- 화면: 설정 탭에서 이름 입력 + 저장 버튼, 실패 메시지 표시, 성공 시 헤더 이름 갱신.
- 스택 3가지는 라벨로만 표시하고 안내 문구를 붙인다. 새 프로젝트 생성 폼은 3가지를 모두 자유롭게 고른다.

### 단계 A 완료 기준
- 로그인 후 `/projects`에서 생성 → 작업공간으로 이동 → 새로고침해도 유지. 남의·없는 id는 404 화면. 비로그인은 `/login`(기존 Proxy).
- 모바일 폭에서 가로 스크롤 없음.

## 단계 P — 진입점·공통 헤더

### 진입점
- 홈 `/`가 서비스 소개와 로그인을 함께 맡는다. 비로그인이면 소개 + "GitHub로 시작하기" 버튼 하나(GitHub 첫 로그인이 곧 회원가입). 로그인 상태면 바로 `/projects`로 보낸다.
- `/login`은 남긴다. 접속하면 쿼리(`next`, `error`)를 유지한 채 `/`로 보낸다(`/login?next=%2Fprojects%2F1` → `/?next=%2Fprojects%2F1`). `next`는 지금처럼 `safeNextPath`로 내부 경로만 허용한다.
- 비로그인의 `/projects`·`/account` 접근은 지금처럼 막되, 이동 목적지를 `/login?next=…`에서 `/?next=…`로 바꾼다(한 번 덜 거침).
- OAuth 실패는 `/auth/callback`이 `/login?error=auth`로 보내고 있다. `/login`이 `error`도 유지해 넘기므로 callback 코드는 건드리지 않는다. 홈에서 `error=auth`면 기존 실패 문구를 보여 준다.

### 구현 방식(제안)
- 판단 규칙은 `core/auth/redirect.ts`의 `decideRedirect`를 고친다(순수 함수, vitest): `/login` → `/` + 같은 쿼리, 로그인 상태의 `/` → `safeNextPath(next)`(기본 `/projects`), 비로그인 보호 경로 → `/?next=…`. 이렇게 하면 홈 페이지가 세션을 읽지 않아도 돼 정적 소개 화면 + `<Suspense>` 안의 로그인 버튼(`next`·`error`용 `searchParams`)으로 둘 수 있다.
- `app/login/page.tsx`는 같은 이동을 하는 안전망(서버 `redirect`)으로 남기고 `LoginPanel`은 홈이 대체하므로 삭제한다. `LoginButton`은 홈에서 재사용하고 문구만 "GitHub로 시작하기"로 바꾼다.
- 로그인 상태의 `/`가 `next`를 따르는 점은 요청의 "바로 /projects"의 확장이다(`next`가 없으면 정확히 `/projects`).

### 공통 헤더
- 구성: 로고(로그인 상태에서 바로 `/projects`로 연결, 홈을 거치지 않음), 계정 영역(텍스트 "프로젝트" 링크는 두지 않는다). 작업공간 상단에는 "프로젝트 › {프로젝트 이름}" 경로 안내를 두고 "프로젝트"는 목록으로 이동한다. `/account`에는 경로 안내 없이 로고로 돌아간다. `components/layout/AppHeader`(기존 `components/projects/AppHeader` 대체)를 목록·작업공간·계정 화면이 함께 쓴다.
- 계정 영역: GitHub 이름 + 프로필 사진(`user_metadata.avatar_url`, 없으면 이름 첫 글자 원형). 이름·사진·이메일은 `getClaims()` 결과에서 읽는다(서버 컴포넌트, `<Suspense>` 안). 자체 가입 사용자가 생겨도 같은 필드(`name`·`avatar_url`)를 같은 자리에 쓴다.
- 프로필 클릭 → 작은 메뉴: 계정 설정(`/account`), 로그아웃. 메뉴는 shadcn 드롭다운 메뉴(단계 D 부품)를 쓰므로 순서를 지키기 위해 **P에서는 이름·사진 표시까지만 만들고, 클릭 메뉴는 D 끝에 붙인다**(P 동안 로그아웃은 기존 버튼 유지).
- 로그아웃 처리 코드는 `LogoutButton` 한 곳에만 둔다. `/account`는 이 컴포넌트를 그대로 쓰고, 헤더 메뉴 항목도 같은 컴포넌트를 `DropdownMenuItem` 안에서 쓴다(`signOut` 호출·`/` 이동·실패 문구가 한 벌).
- 아바타 이미지는 외부 도메인(`avatars.githubusercontent.com`)이라 `next/image` 설정을 건드리지 않고 `<img>`를 쓴다(eslint `no-img-element` 한 줄 예외, 사유 주석, `referrerPolicy="no-referrer"`, 고정 크기).
- 로그아웃 후 이동 목적지는 `/login` → `/`.

### 단계 P 완료 기준
비로그인 `/` = 소개 + 버튼 하나 / 로그인 상태 `/` → `/projects` / `/login?next=%2Fprojects` → `/?next=%2Fprojects` 후 로그인하면 원래 경로 / `next=//evil.com`은 `/projects`로 대체 / 비로그인 `/projects`·`/account` 막힘 / 헤더에 이름·사진 또는 첫 글자 / `decideRedirect` vitest.

## 단계 D — 디자인 기준값·공통 부품

### 기준값(원티드 몽타주)
- 출처: 공식 저장소 `wanteddev/montage-web`의 `packages/theme`(wds-theme 토큰). 라이선스는 **MIT**(Copyright 2026 Wanted Lab, Inc., 저장소 `LICENSE.md`로 확인). 사용 조건: 사본 사용 시 저작권·라이선스 고지 포함. 로고·이름 사용권은 MIT에 포함되지 않으므로 **원티드 로고·이름은 쓰지 않는다**(저장소의 `packages/brand`도 쓰지 않음). 몽타주 Claude Code 플러그인은 설치하지 않는다. 값은 토큰 파일과 대조한 결과를 D 단계 보고에 표로 적고, 다르면 저장소 값을 우선할지 요청값을 우선할지 묻는다.
- 요청된 값: 대표 색 `#0066FF`(호버 `#005EEB`, 누름 `#0054D1`), 옅은 면 `#EAF2FE`. 상태: 정상 `#00BF40`, 경고 `#FF9200`, 오류 `#FF4242`(배경은 각 8% 투명도). 글자 `#171719`, 보조 글자는 같은 회색의 투명도 단계, 구역 배경 `#F7F7F8`, 선은 회색 투명도. 글꼴 Pretendard, 간격 4px 단위, 카드·입력창·큰 버튼 모서리 12px.
- 사용 규칙: 파란색은 행동(버튼·선택)에만, 초록·주황·빨강은 상태 표시에만.


### D0 대조 결과 (2026-10-30, montage-web `d2d49a5`)
| 항목 | 요청 값 | 공식 토큰(`packages/theme`) | 판정 |
| --- | --- | --- | --- |
| 대표 색 / 호버 / 누름 | #0066FF / #005EEB / #0054D1 | blue 50 / 45 / 40 = 같은 값 (`surface.brand.primary·strong·heavy`) | 일치 |
| 옅은 면 | #EAF2FE | blue 95 = #EAF2FE. 단 공식 의미 토큰 `surface.brand.subtle`은 blue 50의 5% 투명도 | 값 일치, 쓰임은 다름(요청대로 #EAF2FE 사용) |
| 정상 / 경고 / 오류 | #00BF40 / #FF9200 / #FF4242 | green 50 / orange 50 / red 50 = 같은 값 | 일치 |
| 상태 배경 | 각 색의 8% | `surface.positive·cautionary·negative.primary` = 각 색 50의 opacity 8 | 일치 |
| 글자 | #171719 | coolNeutral 10 = #171719 (`foreground.neutral.primary`) | 일치 |
| 보조 글자 | 같은 회색의 투명도 단계 | secondary = coolNeutral 22(#2E2F33) 88%, tertiary = coolNeutral 25(#37383C) 61%, quaternary = 25의 28% | 공식 값 사용(회색 두 단계 + 투명도 3단계) |
| 구역 배경 | #F7F7F8 | coolNeutral 99 = #F7F7F8 (`background.neutral.secondary`) | 일치 |
| 선 | 회색 투명도 | coolNeutral 50(#70737C)의 22% / 16% / 8% (`line.neutral`) | 공식 값 사용(기본 선 22%) |
| 글꼴 | Pretendard | `reset.mjs`의 font-family가 Pretendard Variable 우선, 로드는 CDN 안내(jsdelivr, v1.3.9) | 일치. 이 프로젝트는 파일을 `app/fonts/`에 두고 `next/font/local`로 불러옴(OFL) |
| 간격 단위 | 4px | spacing 단계 2·4·6·8·10·12·14·16·20·24… (4의 배수만은 아님) | Tailwind 기본 4px 단위 사용, 기준값과 충돌 없음 |
| 모서리 | 카드·입력창·큰 버튼 12px | radius 단계 4·8·10·12·14·16·20·24·28·32, full | 12px 단계 존재. 컴포넌트별 사용값은 대조하지 않음 |

### 적용 방식
- `app/globals.css`에 값을 CSS 변수로 정의한다(`:root` = 라이트). Tailwind 4의 `@theme inline`과 shadcn/ui의 색 변수(`--primary`, `--background`, `--border`, `--ring`, `--destructive` 등)에 연결한다. **화면 코드에는 색상값을 직접 쓰지 않는다**(클래스는 `bg-primary` 같은 의미 이름만).
- 다크 모드는 지금 넣지 않는다. 현재 `globals.css`의 `prefers-color-scheme: dark` 블록은 제거해(다크 값이 몽타주 기준이 아니므로), 나중에 `.dark { … }` 변수만 추가하면 되는 구조로 둔다.
- Pretendard는 npm 패키지 자체 호스팅 대신 `next/font/local` 또는 공식 서브셋 파일로 불러온다(외부 CDN 의존 안 함). 구체 방식은 D 시작 때 라이선스(SIL OFL)·파일 크기를 확인해 보고한다.
- 간격은 Tailwind 기본 4px 단위, 모서리는 `--radius`(12px)에 연결.
- shadcn/ui 부품: 버튼, 입력칸(Input), 여러 줄 입력(Textarea), 선택 상자(Select), 카드, 탭, 배지, 드롭다운 메뉴, 대화상자(Dialog), 알림(Alert). `components/ui/`에 둔다.
- **설치 전 확인**: 현재 Next 16.4.3·React 19.3·Tailwind 4.3에서 shadcn CLI(`components.json`, 스타일, Tailwind 4 지원, React 19 peer 의존성)가 맞는지 공식 문서로 확인하고 보고한 뒤 설치한다. shadcn은 새 의존성(Radix UI, `class-variance-authority`, `clsx`, `tailwind-merge`, 아이콘 라이브러리 등)을 가져오므로 **이 스펙 승인이 새 의존성 승인**이다(Boundaries의 "Ask first" 해당).
- 기존 화면(`/projects`, 작업공간, 계정)의 `slate`·`indigo` 임의 선택 클래스는 새 토큰 클래스로 교체한다(동작·구조는 그대로, 겉모습만).

### 디자인 시스템 스펙 JSON — 이번에 만들지 않음
- 디자인 값의 정본은 CSS 변수다. 기준 문서(`data-model.md`)와 다른 옛 형식(현재 `DesignSystemSpecSchema`의 `tokens.colors…`)으로 예시 JSON을 저장하지 않는다.
- **기능 B 시작 시** `DesignSystemSpecSchema`를 `data-model.md` 기준(`color`·`spacing`·`radius`·`font`·`layout` 단수형 그룹)으로 맞춘 뒤(스키마 변경은 별도 커밋), 이 CSS 변수 값으로 예시 JSON을 생성한다.

### 출처·라이선스 고지
- 저장소 루트에 `THIRD_PARTY_NOTICES.md`를 두고 몽타주 토큰 값의 출처(저장소·경로·확인 날짜)와 MIT 라이선스 전문(Copyright 2026 Wanted Lab, Inc.)을 남긴다. Pretendard 등 함께 쓰는 서드파티도 같은 파일에 적는다.

### 단계 D 완료 기준
토큰이 CSS 변수로 한 곳에 정의되고 화면 코드에 색상값(`#…`·`rgb`·임의값)이 없다 / 부품 10종이 `components/ui/`에서 임포트되며 샘플이 build 통과 / 헤더 계정 메뉴(P에서 미룬 부분) 동작 / `THIRD_PARTY_NOTICES.md` 작성 / 라이선스·토큰 대조 결과 보고.

## 단계 S — `/api/draft` 스트리밍 전환 (단계 알림)

### 범위
"단계 알림"만 스트리밍한다. AI가 만드는 중인 노드의 부분 결과는 보내지 않고, **검증을 통과한 설계도만** `done`에 담는다. 시간 기준(텍스트만 45초, 이미지 포함 60초)과 재시도 조건(`남은 시간 ≥ max(첫 시도 시간, 15초)`), 자동 보정, OpenAI SDK 재시도 끔은 그대로다.

### 스트림 전 / 후 오류
| 시점 | 방식 |
| --- | --- |
| 시작 전에 알 수 있음: 401, 400(입력), 413(이미지 합계), 404(projectId), 503(projectId 조회 실패) | **지금처럼 상태 코드 + JSON 오류 본문**(`Content-Type: application/json`) |
| 시작 후: 검증 최종 실패(422), 시간 초과(504), OpenAI 오류(429·502·503 등), 저장 실패 | 200 스트림 안의 **`error` 알림**. 지금의 오류 코드 이름(`code`)·`message`·`retryable`·`fields`를 그대로 담고, 원래 HTTP 상태 값은 `status`에 담는다 |

클라이언트는 응답의 `Content-Type`으로 구분한다: `application/json` → 기존 방식, `application/x-ndjson` → 스트림.

### 스트림 형식 제안: NDJSON (줄마다 JSON 1개)
```
{"type":"stage","stage":"accepted"}       요청 확인(인증·입력·프로젝트 소유 확인 완료)
{"type":"stage","stage":"generating","attempt":1}    AI 생성 중
{"type":"stage","stage":"validating","attempt":1}    검증
{"type":"stage","stage":"normalizing","changes":3}   자동 보정(일어났을 때만)
{"type":"stage","stage":"regenerating","attempt":2}  다시 생성 중(재시도할 때만, 이후 validating이 한 번 더)
{"type":"stage","stage":"saving"}         저장(projectId가 있을 때만)
{"type":"ping"}                           하트비트(10초마다, 단계 알림이 없는 동안 연결 유지용)
{"type":"done","blueprint":{...},"meta":{...}}       완료
{"type":"error","status":504,"error":{"code":"timeout","message":"...","retryable":true}}
```
- **하트비트**: 서버는 10초마다 `{"type":"ping"}` 줄을 보낸다(Vercel 문서: HTTP/1.1 연결이나 중간 네트워크 장치는 유휴 연결을 닫을 수 있어, 작업 중 진행·하트비트 데이터를 스트리밍하라고 안내). `done`·`error`를 보낸 뒤 스트림이 닫히면 타이머를 반드시 정리한다(테스트 포함). 클라이언트는 `ping`을 무시한다.
- **끊김 감지(클라이언트)**: 마지막 줄(하트비트 포함)을 받은 뒤 30초 동안 아무것도 오지 않으면 연결이 끊긴 것으로 보고 읽기를 중단한다. 입력을 보존한 채 "연결이 끊겼습니다" 오류와 다시 시도 버튼을 보여 준다(`retryable`). 스트림이 `done`·`error` 알림 없이 끝난 경우도 같은 오류로 처리한다(Vercel이 `maxDuration`에서 강제 종료한 경우 포함, 시작된 스트림의 상태 코드는 바꿀 수 없음). 기존 클라이언트 전체 타임아웃(텍스트 50초·이미지 65초)은 유지한다.
- **압축·버퍼링**: 응답은 `Content-Type: application/x-ndjson`. S2에서 로컬 `next start`로 줄이 도착 시점에 나뉘어 오는지 확인하고, 묶여 오면 `Cache-Control: no-cache, no-transform` 등 압축 방지 헤더를 추가한다. 실제 Vercel 배포에서의 동작은 배포 체크리스트(계획 문서)로 남긴다.
- 저장 실패 알림에는 이미 만든 초안을 버리지 않도록 `blueprint`를 함께 담는다(기존 "초안 보존" 결정 유지, Open Question 1).
- 이유: SSE는 `EventSource`가 GET만 지원해 multipart POST를 못 쓰고, NDJSON은 `fetch` + `response.body.getReader()` + `TextDecoder`로 줄 단위 파싱하면 되어 화면 코드가 가장 단순하다. 잘린 줄은 버퍼에 이어 붙인다.

### 구조
- `lib/ai/draft-blueprint.ts`: 호출·검증·보정·재시도 로직은 그대로 두고 `onProgress(event)` 콜백으로 단계를 알린다(콜백이 없어도 동작은 같음).
- `lib/ai/draft-handler.ts`: 사전 검증은 상태 코드로 응답, 통과하면 `ReadableStream`을 만들어 콜백 이벤트를 NDJSON 줄로 쓴다. 스트림 변환은 라우트 쪽 얇은 계층에서만 한다(호출 로직은 스트림을 모른다).
- `scripts/test-draft.ts`는 같은 콜백으로 단계를 터미널에 출력한다.
- 기존 `/api/draft` 테스트는 새 방식(응답 본문 읽기)에 맞게 고치고, **단계 순서**(정상, 자동 보정, 재시도, 저장 단계 유무)와 **오류 알림**(검증 최종 실패, 시간 초과, 저장 실패)을 검증하는 테스트를 추가한다.
- Vercel 문서 확인(S0 완료, 2026-10-30): 스트리밍 응답에도 `maxDuration`이 적용되고(요청 처리·응답 전송·스트리밍 포함, 초과 시 504 강제 종료), 현재 `maxDuration = 70`은 Fluid compute 한도(Hobby 300초·Pro 800초) 안이라 변경하지 않는다. Node.js 런타임에는 명시된 유휴 제한이 없으나 HTTP/1.1 구간 보호를 위해 하트비트를 둔다.
- CLAUDE.md `/api/draft` 행, `SPEC-draft-route.md`, `docs/projects-api.md`(콘솔 예시)를 갱신한다.

### 단계 S 완료 기준
정상·보정·재시도·실패 시나리오에서 단계 순서가 테스트로 고정되고, 사전 오류는 기존 상태 코드를 유지하며, test:draft가 단계를 출력한다(mock으로만 검증).

## 단계 B — 구조 설계 탭

### 입력 영역
- 스펙 7개 텍스트 영역(화면 개요, 디자인 토큰, 레이아웃·반응형, 컴포넌트 규칙, 상태·데이터, 접근성, 금지·제약 사항) + 선택 `route`.
- 이미지 첨부 0~3장(PNG·JPEG·WebP, 장당 원본 5MB 이하는 **선택 시 클라이언트 검사**, 초과 파일은 거절 메시지). 썸네일과 삭제 버튼.
- **초안 생성 버튼 활성 조건**: 7개 항목 중 공백이 아닌 것이 1개 이상 **또는** 이미지 1장 이상. 생성 중에는 비활성(중복 호출 방지).
- 이미지가 있고 7개 항목이 모두 비어 있으면 안내: "이미지만으로는 데이터 조회 위치·상태·토큰이 빠지기 쉽습니다. 최소한 **화면 개요**와 **상태·데이터**를 채워 주세요"(`tasks/draft-test-result.md` 근거). 막지는 않는다.

### 이미지 처리 (브라우저)
- 장마다 가로 1,200px 초과면 1,200px로 축소(비율 유지, 작으면 그대로). 캔버스로 JPEG 재인코딩. 합계가 4MB(4,000,000바이트)를 넘으면 품질을 단계적으로 낮춰(0.85 → 0.6) 재시도, 그래도 넘으면 폭을 줄여 재시도, 끝내 안 되면 오류 안내.
- 장 수에 맞춰 `imageMeta: [{ originalWidth }]`를 같은 순서로 전송(원본 가로 px).
- 크기 계산은 순수 함수(`core/image`)로 분리해 vitest로 검증, 캔버스 처리는 `lib/client/`.
- 알려진 한계: PNG 투명도는 JPEG 변환 시 흰 배경이 됨, 축소 결과를 사용자에게 따로 미리 보여 주지 않음.

### 초안 생성 요청·진행·실패
- `POST /api/draft` multipart(응답은 스트림, 사전 오류는 JSON): `projectId`, `spec`(비어 있지 않은 항목만 JSON), `route`(있으면), `images`, `imageMeta`. `stack`은 보내지 않는다(서버가 프로젝트 값 사용).
- **진행 표시**: 스트림의 단계 알림을 그대로 보여 준다: 이미지 줄이는 중(브라우저) → 요청 확인 → AI 생성 중 → 검증 → 자동 보정(있을 때) → 다시 생성 중(있을 때) → 저장 → 완료. 가짜 시간 전환은 없다. 경과 시간도 함께 표시.
- **실패**: HTTP 상태 코드(스트림 안 오류는 `status`)와 `error.code`·`message`를 보여 주고, `error.fields`가 있으면 경로·메시지 목록으로 표시. `retryable: true`(429·502·503·504 등)거나 422이면 **다시 시도** 버튼. 입력(7개 항목·route·이미지 선택 상태)은 그대로 보존. 클라이언트 타임아웃은 서버 마감보다 길게(텍스트 50초·이미지 포함 65초) 두고 지나면 "응답 지연" 오류로 같은 재시도 UI를 쓴다. 401은 `/login` 안내.
- **저장 실패**(스트림 `error` 알림에 `blueprint` 포함): 초안은 표시하고 "저장되지 않았습니다. 새로고침하면 사라질 수 있습니다" 경고. 자동 재저장은 이번 범위 밖(편집 저장 기능과 함께).
- 성공 시 스토어의 설계도를 교체하고 트리를 다시 그린다.

### 작업공간 배치 (구조 설계 탭)
```
┌ 스펙 입력(왼쪽) ┬ 가운데: [화면 미리보기 | 트리 보기] ┬ 노드 정보(오른쪽, 보기만) ┐
│ 초안 생성 후 접기 │ 기본은 미리보기                    │ 선택한 노드의 속성          │
└──────────────────┴──────────────────────────────────┴────────────────────────────┘
                     아래: 검사 결과 자리(비어 있음, 규칙은 다음 단계)
```
- 좁은 폭(모바일)에서는 세로로 쌓고 스펙 입력은 접힌 상태로 시작한다.
- 선택 상태(`selectedNodeId`)는 스토어에 두고 미리보기·트리·정보 패널이 공유한다. 편집·드래그·삭제는 다음 단계(제외).
- 검사 결과 자리는 "검사 결과는 다음 단계에서 표시됩니다" 안내만 둔다.

### 구조 미리보기 (신규, 우선 구현)
- 목적: 트리만으론 화면 배치가 안 보여 편집 판단이 어려우므로, 설계도의 배치 정보를 **그대로** 상자로 그린다. **AI를 다시 호출하지 않는다**. 로직은 `core/preview/`(순수, 평면 `nodes` → 상자 트리와 배치 값, vitest), 그리기는 `components/structure/`.
- 입력으로 쓰는 필드(`data-model.md` 기준): 부모의 `layout`(`type` grid/flex, `direction`, `columns`, gap 토큰), 자식의 `placement`(그리드 차지 칸), `order`(형제 순서), 반응형 정보(`responsive` 오버라이드).
- 그리기 규칙: 부모 상자는 `layout`대로 flex(행/열) 또는 grid(열 수)로 자식 상자를 배치하고, 자식은 `placement`의 차지 칸을 따르며 `order`로 정렬한다. gap은 토큰 이름을 간격 단계로 변환해 적용한다(변환표는 `core/preview`에 둔다, 토큰 값 자체는 쓰지 않음). 상자 내용은 **노드 이름 + 배치 방식 표시**(예: `grid 3열`, `flex 가로`)뿐이다. 실제 스타일 값·내용은 그리지 않는다.
- 클릭 → `selectedNodeId` 설정(선택 상자는 대표 색 외곽선). 트리·미리보기에서 같은 노드가 강조된다.
- **반응형 전환**: 데스크톱·모바일 버튼. 설계도 `responsive` 정보로 해당 폭의 `layout`·`placement`를 적용한다(정보가 없으면 기본 값). 중간 폭 값(브레이크포인트)은 설계도에 정의된 이름만 쓴다. 폭은 미리보기 영역 안에서 고정 컨테이너 폭(데스크톱 전체, 모바일 약 390px 상당)으로 시뮬레이션한다(실제 CSS 미디어 쿼리가 아니라 계산한 값 적용 — 뷰포트와 무관하게 전환되도록).
- **그려지지 않는 노드**(훅 등 `kind: hook`처럼 화면에 상자가 없는 것)는 미리보기 아래 "화면에 그려지지 않는 노드" 목록으로 분리한다(이름·종류, 클릭 시 선택). 어떤 노드가 여기에 속하는지는 `data-model.md`의 kind 정의로 판단한다(구현 시 확인).
- 한계(알려진): 정확한 픽셀·색은 아니다(구조 판단용). 누락·잘못된 `placement`는 상자를 줄바꿈 순서로 두고 노드 카드에 "배치 정보 없음" 경고 표시. 중첩이 깊은 설계도(최대 200노드 가정)는 상자를 최소 높이로 줄이고 스크롤한다.

### 트리 보기 (보조, 단순하게)
- 일정이 밀리면 이 부분을 줄이고 미리보기를 우선한다(CLAUDE.md 우선순위 원칙과 같은 방향).
- 작업공간 진입 시 서버가 최신 판(`loadBlueprint`)을 읽어 초기값으로 넘긴다. 판이 없으면 "아직 초안이 없습니다" 안내.
- 평면 `nodes`를 `buildTree()`(신규 `core/schema/tree.ts`, 저장 안 함)로 변환하고, dagre(위→아래)로 좌표를 계산해 React Flow에 그린다. 노드 카드는 **이름과 kind 배지 정도로 단순화**(나머지는 오른쪽 정보 패널). 읽기 전용, 확대·축소·화면 맞춤만, 클릭하면 선택.
- React Flow·dagre는 클라이언트 전용이라 트리 컴포넌트만 `"use client"`로 분리한다.

### 노드 정보 패널 (보기만)
선택한 노드의 이름, kind, 부모, `renderMode`(Next.js), `dataFetch`, 책임 목록, `location.dir`, `layout`·`placement` 요약, `assumed`면 "AI 가정" 표시. 선택이 없으면 안내 문구. 편집 입력은 만들지 않는다.

### 자동 보정 내역
- `meta.normalized`가 비어 있지 않으면 트리 위/옆에 "자동으로 고친 항목" 접이식 목록(노드 id → 이름, `path`, `detail`). 새 초안 생성 때만 표시(저장된 판을 다시 불러온 경우 내역은 DB에 없으므로 안 보임, 이것은 의도). 노드 이름은 설계도에서 id로 찾아 표시하고, 못 찾으면 id 그대로.

## Tech Stack
Next.js 16.4.3(App Router, `cacheComponents`), React 19.3, TypeScript, Tailwind 4, `@xyflow/react` 12, `dagre` 0.8, Zustand 5, Zod 4, vitest 5. **새 의존성(사용자 승인 완료): shadcn/ui 부품 설치로 따라오는 것들**(Radix UI, `class-variance-authority`, `clsx`, `tailwind-merge`, 아이콘 라이브러리 등, D 단계에서 호환성 확인 후 설치). 그 외 없음.

## Commands
```
npm run dev
npm run build
npm run lint
npx vitest run
npx tsc --noEmit
```

## Project Structure (추가·변경 파일)
```
app/projects/page.tsx                    # 목록 (라우팅 + Suspense만, 본문은 components)
app/projects/[id]/page.tsx               # 작업공간 진입 (params, notFound)
components/layout/AppHeader.tsx         # 공통 헤더(로고·계정), 작업공간 경로 안내는 Workspace
components/ui/                           # shadcn/ui 부품 (D)
components/auth/                         # LoginButton(홈에서 재사용), LogoutButton(헤더 메뉴·/account 공용), 계정 메뉴
app/page.tsx                             # 홈: 소개 + 로그인 (라우팅만, 본문은 components/home)
components/home/                         # 소개 화면
THIRD_PARTY_NOTICES.md                   # 몽타주 출처·MIT 고지 (D)
core/preview/ (+ test)                   # 구조 미리보기 계산(순수)
components/structure/PreviewCanvas·NodeInfoPanel 등  # 미리보기·정보 패널
components/projects/                     # ProjectList, NewProjectForm
components/workspace/                    # WorkspaceTabs, ProjectSettingsTab
components/structure/                    # StructurePanel, PreviewCanvas, NodeInfoPanel, SpecForm, ImagePicker, DraftProgress, DraftError, NormalizedList, TreeView, TreeNodeCard
core/schema/tree.ts (+ test)             # buildTree
core/image/fit-size.ts (+ test)          # 축소 크기·합계 4MB 판정(순수)
lib/client/resize-images.ts              # 캔버스 축소 (브라우저 전용)
lib/client/draft-request.ts (+ test)     # FormData 구성, 응답/오류 해석(순수 부분 테스트)
store/structure-store.ts                 # Zustand
lib/api/blueprint-handler.ts, revisions-handler.ts (+ tests)   # A0
lib/db/projects.ts(renameProject), lib/api/project-handler.ts, app/api/projects/[id]/route.ts (+ tests)   # A PATCH
lib/ai/draft-blueprint.ts, draft-handler.ts, scripts/test-draft.ts (+ tests)   # S 스트리밍
lib/client/draft-stream.ts (+ test)      # B: NDJSON 읽기
```
CLAUDE.md 폴더 구조 표에 `components/projects·workspace·structure`, `lib/client`, `core/image`, `core/schema/tree.ts`, `store/structure-store.ts`를 반영한다.

## Code Style
기존 규칙 그대로: 컴포넌트 PascalCase, 스토어·훅 camelCase, `core/`는 React·브라우저 API 금지, 인라인 스타일·`!important`·대괄호 임의값 금지(Tailwind 기본 토큰만). 단계 D 이후 색·모서리·간격은 몽타주 기준 CSS 변수에 연결된 의미 이름 클래스(`bg-primary`, `text-foreground`, `border-border`, `rounded-xl` 등)만 쓰고 색상값을 직접 쓰지 않는다. A 단계까지 쓴 `slate`·`indigo`는 D에서 교체한다. `app/` 안엔 라우팅 파일만.
```tsx
// components/projects/ProjectList.tsx
export function ProjectList({ projects }: { projects: Project[] }) {
  if (projects.length === 0) return <p className="text-sm text-slate-500">아직 프로젝트가 없습니다.</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {projects.map((p) => (
        <li key={p.id}><Link href={`/projects/${p.id}`} className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-indigo-400">…</Link></li>
      ))}
    </ul>
  );
}
```
디자인은 과한 장식 없이 몽타주 기준값을 따른다. 폰트 Pretendard, 레이아웃 `max-w-5xl` 중앙 정렬(작업공간 3열은 더 넓게).

## Testing Strategy
- vitest(자동): `decideRedirect`(`/login`→`/`, 로그인 상태의 `/`, `next` 안전 검사), `core/preview`(flex·grid·order·placement·반응형 전환·그려지지 않는 노드 분리), `buildTree`(order 정렬, 루트 1개, 자식 포함), dagre 좌표 변환 함수, `fit-size`(축소 비율, 1,200 이하 유지, 합계 4MB 판정, 품질 단계), `draft-request`(FormData 필드·imageMeta 순서, 오류 본문·네트워크 오류·타임아웃 해석), A0 핸들러 404/200-null.
- 컴포넌트 단위 테스트 도구가 없어 **새 도구는 추가하지 않는다**. UI는 `npm run build`·`tsc`·`eslint`와 **로컬에서 직접 확인**으로 검증한다(아래 체크리스트). 실제 OpenAI 호출(1회 약 $0.01~0.02)은 사용자가 직접 실행.
- 수동 체크리스트(P·D): 비로그인 `/` 소개와 버튼 / 로그인 후 `/`·`/login` 이동 / 헤더 이름·사진·첫 글자 / 메뉴·로그아웃 / 색상값 직접 사용 검색(`grep` 으로 `#` 색상 코드 없음) / 모바일 폭.
- 수동 체크리스트(B): 입력 없음 → 버튼 비활성 / 개요만 입력 → 활성 / 이미지만 → 안내 문구 / 큰 이미지 3장 → 합계 4MB 이하·`imageMeta` 전송 / 생성 중 단계·경과 / 서버를 잠시 막아 실패 → 상태 코드·fields·입력 보존·다시 시도 / 성공 → 트리 / 새로고침 → 최신 판 / 판 없는 프로젝트 → 안내 / 미리보기 상자 클릭 → 트리·정보 패널 동기화 / 데스크톱·모바일 전환 / 훅 목록 분리.

## Boundaries
- Always: `core/`에 React·브라우저 API를 넣지 않기, 클라이언트에 service role·OpenAI 키를 참조하지 않기, 사용자 입력·이미지를 DB·로그에 남기지 않기(이미지는 요청 후 폐기), 서버 응답 오류 본문을 그대로 노출하기보다 `error.message` 사용, 단계마다 `vitest`·`tsc`·`eslint`·`build` 통과 후 보고.
- Ask first: 새 의존성(shadcn/ui 관련은 이 스펙 승인으로 허용, 그 외), 위에 적은 것 외의 API 계약·DB·마이그레이션 변경, 탭을 URL 라우트로 바꾸기.
- Never: 실제 OpenAI 호출(테스트·확인 모두 mock), 노드 편집·검사 규칙·지시서 기능을 슬쩍 넣기, 인라인 스타일·임의값 사용, `app/` 아래에 컴포넌트 파일 두기, 동작 확인 전 커밋.

## Success Criteria
0. (P) 비로그인 `/`는 소개 + 로그인 버튼 1개, 로그인 상태 `/`는 `/projects`로 이동, `/login?next=…`는 `/?next=…`로 이동해 로그인 후 원래 경로로 돌아온다(외부 경로는 거부). 헤더에 GitHub 이름·사진(없으면 첫 글자)과 계정 메뉴(계정 설정·로그아웃)가 있고 로그아웃 처리 코드는 한 곳이다. (D) 색은 CSS 변수 한 곳에서 정의되고 화면 코드에 색상값이 없다. shadcn 부품 10종이 준비되고 `THIRD_PARTY_NOTICES.md`가 있다.
1. (A0) 없는·남의 프로젝트 id로 `GET .../blueprint`·`GET .../revisions` → 404 `not_found`. 내 새 프로젝트 → 200 `{ blueprint: null }` / `{ revisions: [] }`.
2. (A) `PATCH /api/projects/[id]`가 이름만 받아 수정하고(빈 이름 거부, 남의·없는 프로젝트 404), `/projects`에서 이름·스택을 골라 프로젝트를 만들면 작업공간으로 이동하고, 목록에 최근 수정 순으로 보인다. 4개 탭이 보이며 디자인 시스템 정리·지시서는 비활성. 설정 탭에서 이름을 바꾸면 목록·헤더에 반영되고, 빈 이름은 거부된다.
3. (B) 7개 항목이 모두 비고 이미지도 없으면 생성 버튼이 비활성이고, 하나라도 채우거나 이미지를 넣으면 활성이다.
4. (B) 큰 이미지 3장을 넣으면 각 장이 가로 1,200px 이하로, 합계 4MB 이하로 전송되고 `imageMeta`에 원본 가로가 들어간다(서버 413이 나지 않는다).
5. (S) 스트림 단계 순서·오류 알림이 테스트로 고정되고 사전 오류는 상태 코드를 유지한다. (B) 생성 중 단계 표시, 실패 시 상태 코드·`fields`·다시 시도, 입력 보존이 된다.
6. (B) 성공한 초안이 구조 미리보기(기본)와 React Flow 트리(전환)로 보이고, 미리보기 상자 클릭이 정보 패널·트리 선택과 연결되며, 데스크톱·모바일 전환과 "그려지지 않는 노드" 목록이 동작한다. 작업공간 3열 배치(왼쪽 입력은 접기 가능)와 검사 결과 자리가 있다. 작업공간 재진입 시 최신 판이 보인다. `meta.normalized`가 있으면 "자동으로 고친 항목"이 보인다.
7. `npx vitest run`·`npx tsc --noEmit`·`npx eslint`·`npm run build` 통과.

## 결정 완료 (사용자 답변)
진행 순서 P → D → S → B, 홈이 소개+로그인(버튼 하나), 몽타주 기준값·shadcn/ui, 구조 미리보기를 B에 추가(트리는 단순화) / 진행 표시는 스트리밍 단계 알림 / 첫 로딩은 서버 컴포넌트 직접 읽기 / `route` 입력 선택 1칸 / 설정 탭은 이름만 수정 / 다시 생성 시 한 줄 안내(확인창 없음).

## Open Questions
1. 저장 실패 알림에 `blueprint`를 함께 담는 것: "저장 실패는 오류 알림"과 "비용 든 초안은 버리지 않는다"를 함께 만족하려는 제안. 반대하시면 오류만 보내고 초안은 버려진다.
2. Vercel 스트리밍과 함수 실행 시간 한도의 관계는 S 구현 전에 공식 문서로 확인 후 보고한다(결과에 따라 `maxDuration` 조정 가능).
3~5. (해결) 홈은 로그인 상태에서 `next` 우선·없으면 `/projects`, 디자인 JSON은 이번에 만들지 않음(위 절), 헤더 메뉴는 D 끝에 붙임, 새 의존성은 승인됨.
3. 미리보기 훅 판정, 반응형 데이터 형태, gap 토큰 변환은 `data-model.md`를 정확히 읽고 확정한다(B 시작 때 보고). 이번 스펙은 `data-model.md` 본문을 아직 읽지 않았다.

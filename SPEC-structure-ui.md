# Spec: 구조 설계 흐름 화면 (프로젝트 목록 → 작업공간 → AI 초안 → 트리 보기)

단일 기능(화면 1겹)이라 capability map은 만들지 않는다. 구현은 승인 후 시작한다. 작업 순서는 `tasks/plan-structure-ui.md` 참조.
근거: `CLAUDE.md`, `SPEC-projects-api.md`·`docs/projects-api.md`(API 계약), `SPEC-draft-route.md`, `SPEC-auth-login.md`, `.claude/skills/define-schema/data-model.md`, Next.js 16.4.3 로컬 문서(`cacheComponents: true`).

## Objective
로그인한 사용자가 (1) `/projects`에서 내 프로젝트를 보고 새 프로젝트(이름, 프레임워크·스타일·디렉토리 구조)를 만들고, (2) `/projects/[id]` 작업공간에서 화면 스펙 7개 항목 또는 이미지로 AI 초안을 만들고, (3) 초안을 컴포넌트 트리로 본다. 작업공간에 다시 들어오면 최신 판이 바로 보인다.

진행 순서와 확인 시점(각 단계 끝에 vitest·tsc·eslint·build 결과 보고, 작업 단위 커밋, 사용자 확인 후 다음 단계). 실제 OpenAI 호출은 하지 않는다(B 이후 사용자가 브라우저에서 1회 확인).
- **A0**: API 404 통일(설계도 불러오기·판 목록).
- **A**: `/projects` 목록·생성 폼, `/projects/[id]` 작업공간 틀(탭 4개), 설정 탭의 이름 수정(`PATCH /api/projects/[id]` 추가).
- **S**: `/api/draft` 스트리밍 전환(단계 알림, lib/ai 콜백, test:draft 진행 출력).
- **B**: 구조 설계 탭(스펙 입력, 이미지, 초안 생성·진행·실패, 트리 보기, 자동 보정 내역).

제외: 노드 편집·드래그, 검사 규칙과 결과 표시, 디자인 시스템 정리, 지시서 탭, 판 목록·판 선택 화면, 프로젝트 스택 수정·삭제, 저장하지 않은 수정 확인창(노드 편집 때 추가), AI가 만드는 중인 노드의 부분 표시, 세부 디자인 다듬기.

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
{"type":"done","blueprint":{...},"meta":{...}}       완료
{"type":"error","status":504,"error":{"code":"timeout","message":"...","retryable":true}}
```
- 저장 실패 알림에는 이미 만든 초안을 버리지 않도록 `blueprint`를 함께 담는다(기존 "초안 보존" 결정 유지, Open Question 1).
- 이유: SSE는 `EventSource`가 GET만 지원해 multipart POST를 못 쓰고, NDJSON은 `fetch` + `response.body.getReader()` + `TextDecoder`로 줄 단위 파싱하면 되어 화면 코드가 가장 단순하다. 잘린 줄은 버퍼에 이어 붙인다.

### 구조
- `lib/ai/draft-blueprint.ts`: 호출·검증·보정·재시도 로직은 그대로 두고 `onProgress(event)` 콜백으로 단계를 알린다(콜백이 없어도 동작은 같음).
- `lib/ai/draft-handler.ts`: 사전 검증은 상태 코드로 응답, 통과하면 `ReadableStream`을 만들어 콜백 이벤트를 NDJSON 줄로 쓴다. 스트림 변환은 라우트 쪽 얇은 계층에서만 한다(호출 로직은 스트림을 모른다).
- `scripts/test-draft.ts`는 같은 콜백으로 단계를 터미널에 출력한다.
- 기존 `/api/draft` 테스트는 새 방식(응답 본문 읽기)에 맞게 고치고, **단계 순서**(정상, 자동 보정, 재시도, 저장 단계 유무)와 **오류 알림**(검증 최종 실패, 시간 초과, 저장 실패)을 검증하는 테스트를 추가한다.
- Vercel에서 스트리밍 응답과 함수 실행 시간 한도(`maxDuration = 70`)의 관계는 **S 구현 전에 공식 문서로 확인**해 보고한다.
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

### 트리 보기
- 작업공간 진입 시 서버가 최신 판(`loadBlueprint`)을 읽어 초기값으로 넘긴다. 판이 없으면 "아직 초안이 없습니다" 안내.
- 평면 `nodes`를 `buildTree()`(신규 `core/schema/tree.ts`, 저장 안 함)로 변환하고, dagre(위→아래)로 좌표를 계산해 React Flow에 그린다. 노드 카드: 이름, kind 배지, Next.js면 `renderMode`, `dataFetch` 표시, `location.dir`. `assumed: true` 노드는 "AI 가정" 표시. 읽기 전용(`nodesDraggable={false}`, 연결·선택 편집 없음), 확대·축소·화면 맞춤만.
- React Flow·dagre는 클라이언트 전용이라 트리 컴포넌트만 `"use client"`로 분리(필요하면 동적 import로 번들 분리).
- 노드가 많을 때(최대 200개 가정) 가로로 넓어지는 것은 스크롤·줌으로 처리.

### 자동 보정 내역
- `meta.normalized`가 비어 있지 않으면 트리 위/옆에 "자동으로 고친 항목" 접이식 목록(노드 id → 이름, `path`, `detail`). 새 초안 생성 때만 표시(저장된 판을 다시 불러온 경우 내역은 DB에 없으므로 안 보임, 이것은 의도). 노드 이름은 설계도에서 id로 찾아 표시하고, 못 찾으면 id 그대로.

## Tech Stack
Next.js 16.4.3(App Router, `cacheComponents`), React 19.3, TypeScript, Tailwind 4, `@xyflow/react` 12, `dagre` 0.8, Zustand 5, Zod 4, vitest 5. 새 의존성 없음.

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
components/projects/                     # ProjectList, NewProjectForm
components/workspace/                    # WorkspaceTabs, ProjectSettingsTab
components/structure/                    # StructurePanel, SpecForm, ImagePicker, DraftProgress, DraftError, NormalizedList, TreeView, TreeNodeCard
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
기존 규칙 그대로: 컴포넌트 PascalCase, 스토어·훅 camelCase, `core/`는 React·브라우저 API 금지, 인라인 스타일·`!important`·대괄호 임의값 금지(Tailwind 기본 토큰만). 색·간격은 일관되게 `slate` 계열 + 강조 1색(`indigo`), 카드는 `rounded-lg border border-slate-200 bg-white`, 본문 `text-sm`. 세부 꾸미기는 나중. `app/` 안엔 라우팅 파일만.
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
디자인 참고: `frontend-design` 스킬의 "일관된 선택" 원칙만 가볍게 적용(과한 장식 없음). 기본 폰트(Geist)·레이아웃 `max-w-5xl` 중앙 정렬.

## Testing Strategy
- vitest(자동): `buildTree`(order 정렬, 루트 1개, 자식 포함), dagre 좌표 변환 함수, `fit-size`(축소 비율, 1,200 이하 유지, 합계 4MB 판정, 품질 단계), `draft-request`(FormData 필드·imageMeta 순서, 오류 본문·네트워크 오류·타임아웃 해석), A0 핸들러 404/200-null.
- 컴포넌트 단위 테스트 도구가 없어 **새 도구는 추가하지 않는다**. UI는 `npm run build`·`tsc`·`eslint`와 **로컬에서 직접 확인**으로 검증한다(아래 체크리스트). 실제 OpenAI 호출(1회 약 $0.01~0.02)은 사용자가 직접 실행.
- 수동 체크리스트(B): 입력 없음 → 버튼 비활성 / 개요만 입력 → 활성 / 이미지만 → 안내 문구 / 큰 이미지 3장 → 합계 4MB 이하·`imageMeta` 전송 / 생성 중 단계·경과 / 서버를 잠시 막아 실패 → 상태 코드·fields·입력 보존·다시 시도 / 성공 → 트리 / 새로고침 → 최신 판 / 판 없는 프로젝트 → 안내.

## Boundaries
- Always: `core/`에 React·브라우저 API를 넣지 않기, 클라이언트에 service role·OpenAI 키를 참조하지 않기, 사용자 입력·이미지를 DB·로그에 남기지 않기(이미지는 요청 후 폐기), 서버 응답 오류 본문을 그대로 노출하기보다 `error.message` 사용, 단계마다 `vitest`·`tsc`·`eslint`·`build` 통과 후 보고.
- Ask first: 새 의존성, 위에 적은 것 외의 API 계약·DB·마이그레이션 변경, 탭을 URL 라우트로 바꾸기.
- Never: 실제 OpenAI 호출(테스트·확인 모두 mock), 노드 편집·검사 규칙·지시서 기능을 슬쩍 넣기, 인라인 스타일·임의값 사용, `app/` 아래에 컴포넌트 파일 두기, 동작 확인 전 커밋.

## Success Criteria
1. (A0) 없는·남의 프로젝트 id로 `GET .../blueprint`·`GET .../revisions` → 404 `not_found`. 내 새 프로젝트 → 200 `{ blueprint: null }` / `{ revisions: [] }`.
2. (A) `PATCH /api/projects/[id]`가 이름만 받아 수정하고(빈 이름 거부, 남의·없는 프로젝트 404), `/projects`에서 이름·스택을 골라 프로젝트를 만들면 작업공간으로 이동하고, 목록에 최근 수정 순으로 보인다. 4개 탭이 보이며 디자인 시스템 정리·지시서는 비활성. 설정 탭에서 이름을 바꾸면 목록·헤더에 반영되고, 빈 이름은 거부된다.
3. (B) 7개 항목이 모두 비고 이미지도 없으면 생성 버튼이 비활성이고, 하나라도 채우거나 이미지를 넣으면 활성이다.
4. (B) 큰 이미지 3장을 넣으면 각 장이 가로 1,200px 이하로, 합계 4MB 이하로 전송되고 `imageMeta`에 원본 가로가 들어간다(서버 413이 나지 않는다).
5. (S) 스트림 단계 순서·오류 알림이 테스트로 고정되고 사전 오류는 상태 코드를 유지한다. (B) 생성 중 단계 표시, 실패 시 상태 코드·`fields`·다시 시도, 입력 보존이 된다.
6. (B) 성공한 초안이 React Flow 트리로 보이고, 작업공간 재진입 시 최신 판이 보인다. `meta.normalized`가 있으면 "자동으로 고친 항목"이 보인다.
7. `npx vitest run`·`npx tsc --noEmit`·`npx eslint`·`npm run build` 통과.

## 결정 완료 (사용자 답변)
진행 표시는 스트리밍 단계 알림 / 첫 로딩은 서버 컴포넌트 직접 읽기 / `route` 입력 선택 1칸 / 설정 탭은 이름만 수정 / 다시 생성 시 한 줄 안내(확인창 없음).

## Open Questions
1. 저장 실패 알림에 `blueprint`를 함께 담는 것: "저장 실패는 오류 알림"과 "비용 든 초안은 버리지 않는다"를 함께 만족하려는 제안. 반대하시면 오류만 보내고 초안은 버려진다.
2. Vercel 스트리밍과 함수 실행 시간 한도의 관계는 S 구현 전에 공식 문서로 확인 후 보고한다(결과에 따라 `maxDuration` 조정 가능).

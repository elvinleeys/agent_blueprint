# Spec: 프로젝트·설계도 저장/불러오기 연결 (F-014)

> **개정 (2026-10-30)**: `/api/draft`는 NDJSON 스트림 응답으로 바뀌었다. 아래의 `meta.saved`/`saveError`·"저장 실패 시 200" 표기는 폐지되고, 저장 실패는 스트림의 `error`(503 `db_unavailable`)에 `blueprint`를 함께 담아 알린다. 현재 형식은 `SPEC-draft-route.md`의 "응답 스트림"과 `docs/projects-api.md`를 따른다.

단일 기능(서버 쪽 연결 1겹)이라 capability map은 만들지 않는다. 구현은 승인 후 시작한다. 작업 순서는 `tasks/plan-projects-api.md` 참조.
근거: `SPEC-db-rls.md`, `lib/db/*`(이미 구현·테스트됨), `SPEC-draft-route.md`, `SPEC-auth-login.md`, `CLAUDE.md`(API 라우트 개요·에러 처리), Next.js 16.4.3 로컬 문서.

## Objective
로그인한 사용자가 (1) 프로젝트를 이름·스택(프레임워크, 스타일 방식, 디렉토리 구조)과 함께 만들고, (2) 자기 프로젝트만 목록으로 보고, (3) 설계도를 불러오고 저장하며, (4) AI 초안이 만들어지면 자동으로 **새 판**으로 저장되게 한다. 이번 범위는 **서버 쪽 연결**(HTTP 층 + `/api/draft` 연동 + 테스트 + 호출 예시 문서)이다. 화면은 만들지 않는다. 화면은 나중에 이 연결을 `fetch`로 호출한다.

저장 규칙(확정, `SPEC-db-rls.md`):
| 시점 | 동작 | 사용하는 함수 |
| --- | --- | --- |
| 편집 중 자동 저장 | **최신 판 갱신** | `saveBlueprint` |
| AI 초안 생성 성공 | **새 판 추가** | `createBlueprintRevision` |
| 지시서 내보내기 | **새 판 추가** (내보내기 기능은 이번 범위 밖, 호출 경로만 열어 둠) | `createBlueprintRevision` |

## 구현 방식 비교: API 라우트 vs 서버 컴포넌트 + 서버 액션

| 기준 | A. API 라우트 | B. 서버 컴포넌트 + 서버 액션 |
| --- | --- | --- |
| 파일 수 | 라우트 3개(+ `lib/api` 핸들러·헬퍼). 쓰기·읽기 모두 같은 구조 | 읽기는 서버 컴포넌트가 `lib/db`를 직접 호출(파일 적음), 쓰기는 `"use server"` 파일 + 각 화면의 폼. 대신 화면(JSX)이 먼저 있어야 호출·확인 가능 |
| 로그인 확인 위치 | 핸들러 첫 줄에서 `getClaims()` → 없으면 **401 JSON**. `/api/draft`와 동일한 패턴, CLAUDE.md "모든 API 라우트는 세션 확인 후 401"과 일치 | 서버 컴포넌트는 `getClaims()` 후 `redirect("/login")`, **서버 액션도 공개 POST 엔드포인트라 각각 다시 확인**해야 함(Proxy 보호 안 됨). 확인 지점이 두 종류(페이지·액션)로 늘어남 |
| 테스트 방법 | 기존 `draft-handler.test.ts`와 같은 방식: 핸들러에 `Request`를 넘기고 Supabase·`lib/db`를 mock. **화면 없이** 상태 코드·본문까지 확인 | 액션 함수는 mock으로 테스트 가능하지만 `redirect`·`revalidatePath`(Next 내부)를 mock해야 하고, 서버 컴포넌트의 읽기 경로는 단위 테스트가 어렵다(빌드·수동 확인에 의존) |
| 화면에서 호출 | `fetch("/api/projects/...")`. **자동 저장·초안 생성이 이미 `fetch`** 이므로 편집기(Zustand)가 한 가지 방식만 쓴다. 상태 코드(401/404/409/422/503)로 재시도 버튼·오류 안내를 구분하기 쉽다(CLAUDE.md 에러 처리 규칙) | 폼 제출(`<form action>`)은 간단하지만, 편집기의 **debounce 자동 저장**은 클라이언트에서 액션을 함수처럼 호출해야 하고, 서버 액션은 **한 번에 하나씩 순서대로** 실행되어 긴 호출을 앞세우면 뒤가 막힘. 상태 코드가 아니라 반환 객체로 오류를 구분 |
| 기타 | CLI·VS Code 확장 같은 다른 클라이언트도 같은 HTTP 계약을 쓸 수 있음(`core/` 재사용 방침과 맞음). 단, 쿠키 세션이라 외부 클라이언트는 별도 인증이 필요(이번 범위 밖) | 외부에서 호출 불가. 목록 화면에서 `revalidatePath` 같은 캐시 갱신은 편리 |

**제안: A. API 라우트.** 이유: (1) CLAUDE.md에 `/api/projects`가 이미 계약으로 적혀 있고 `/api/draft`가 같은 구조(얇은 라우트 + `lib` 핸들러 + mock 테스트)라 **새 방식 도입이 없다**, (2) 화면이 없어도 테스트·콘솔 확인이 가능해 지금 단계에 맞다, (3) 편집기의 자동 저장·초안 생성이 모두 `fetch`+상태 코드 방식이라 한 가지로 통일된다. 목록 화면은 나중에 서버 컴포넌트에서 `listProjects`를 직접 호출해도 된다(이 결정과 충돌하지 않음).

## Assumptions (틀리면 알려주세요)
1. 위 비교에 따라 **A(API 라우트)** 로 진행한다.
2. 라우트는 얇게 두고 로직은 `lib/api/`에 둔다(`app/`에는 라우팅만, CLAUDE.md 규칙). `lib/db`는 수정하지 않는다(Open Question 2의 `getProject` 제외).
3. 로그인 확인은 `createClient()`(서버 클라이언트) + `getClaims()`. 실패는 **401** JSON. DB 접근은 같은 클라이언트(로그인 세션 → RLS가 사용자 격리). service role 사용 없음.
4. 오류 본문은 `/api/draft`와 같은 형식 `{ error: { code, message, retryable, fields? } }`.
5. 쓰기 요청(POST·PUT)은 `Content-Type: application/json`만 받고, 본문은 **1MB 이하**(nodes 최대 200개 기준 충분)로 제한한다. JSON 형식 요구는 다른 사이트에서의 폼 전송을 막는 기본 방어도 겸한다.
6. 경로의 `[id]`는 uuid 형식을 먼저 검사한다(아니면 400). 설계도 본문은 `lib/db`가 `BlueprintSchema`로 다시 검증한다.
7. `/api/draft`는 **새 선택 필드 `projectId`** 를 받는다. 있으면 성공한 초안을 새 판으로 저장한다(Open Question 1·2 참조). 없으면 지금처럼 저장 없이 반환만 한다.
8. 초안 저장이 실패해도 **초안은 버리지 않는다**: 비용이 이미 들었으므로 HTTP 200으로 `blueprint`를 돌려주고 `meta.saveError`로 알린다(클라이언트는 `PUT`으로 다시 저장 가능).
9. 자동 저장 충돌(두 탭 동시 편집 등)은 **마지막 저장이 이긴다**. 낙관적 동시성 제어(버전 비교)는 이번 범위 밖.

## 설계

### 엔드포인트
| 메서드·경로 | 동작 | 사용 함수 | 성공 응답 |
| --- | --- | --- | --- |
| `GET /api/projects` | 내 프로젝트 목록(최근 수정 순, 최대 100) | `listProjects` | 200 `{ projects }` |
| `POST /api/projects` | 프로젝트 생성. 본문 `{ name, stack }` | `createProject` | 201 `{ project }` |
| `GET /api/projects/[id]/blueprint?revision=N` | 설계도 불러오기. `revision` 생략 시 최신 판. 내 프로젝트인데 판이 없으면 `{ blueprint: null }`, 없거나 남의 프로젝트면 404(`getProject`로 먼저 확인) | `loadBlueprint` | 200 `{ blueprint }` |
| `PUT /api/projects/[id]/blueprint` | **자동 저장**: 최신 판 갱신(판이 없으면 첫 판 생성). 본문 `Blueprint` | `saveBlueprint` | 200 `{ revision, updatedAt }` |
| `GET /api/projects/[id]/revisions` | 판 목록(요약, nodes 제외) | `listBlueprintRevisions` | 200 `{ revisions }` |
| `POST /api/projects/[id]/revisions` | **새 판 추가**(지시서 내보내기 시점용). 본문 `Blueprint` | `createBlueprintRevision` | 201 `{ revision, updatedAt }` |
| `POST /api/draft` (기존) | 새 필드 `projectId`(선택). 성공 시 새 판으로 저장 | `createBlueprintRevision` | 200 `{ blueprint, meta: { ..., saved?, saveError? } }` |

판 삭제(`deleteBlueprintRevision`)와 판 목록 화면은 이번 범위 밖이다(삭제 라우트 없음).

### 오류 매핑 (`lib/api`)
| `lib/db` 결과 | 상태 | `code` | `retryable` |
| --- | --- | --- | --- |
| 세션 없음 | 401 | `unauthorized` | false |
| 입력 형식 오류(JSON 아님·content-type·uuid·필수 필드) | 400 | `invalid_input` | false |
| 본문 1MB 초과 | 413 | `payload_too_large` | false |
| `not_found` (없거나 남의 것, RLS 거부 포함) | 404 | `not_found` | false |
| `invalid_data` (저장·생성 입력이 스키마 위반) | 422 | `invalid_data` + `fields`(최대 10) | false |
| `invalid_data` (**읽은 저장값이 손상**) | 500 | `stored_data_invalid` | false |
| `conflict` | 409 | `conflict` | false |
| `unavailable` (동시 판 추가 충돌 23505 포함) | 503 | `db_unavailable` | true |
| 그 밖의 예외 | 500 | `internal_error` | true |
남의 프로젝트와 없는 프로젝트는 구분하지 않는다(존재 여부를 알려주지 않음). 오류 원문은 서버 로그(코드·이름만), 응답은 한국어 사용자용 문구.

### `/api/draft` 연동 (변경점)
- 요청: multipart에 선택 필드 `projectId`(uuid). 형식이 틀리면 400. `parseDraftRequest`가 읽는다.
- 순서: 세션 확인 → 입력 검증 → (**프로젝트 소유 확인**, Open Question 2) → AI 호출 → 성공 시 `createBlueprintRevision(projectId, blueprint)` → 응답.
- 응답 `meta`: `saved: { revision, updatedAt }`(저장 성공) 또는 `saveError: { code, message }`(저장 실패, 200 유지). `projectId`가 없으면 둘 다 없음.
- 서버 로그에는 `saved` 여부만 추가한다(설계도·원문 없음).
- 이미지·코드 원본은 저장하지 않는다(기존 규칙 그대로, 저장 대상은 설계도뿐).

### 파일과 책임
| 파일 | 책임 |
| --- | --- |
| `app/api/projects/route.ts` | `GET`·`POST` 연결만 |
| `app/api/projects/[id]/blueprint/route.ts` | `GET`·`PUT` 연결만 (`params`는 Next 16에서 Promise) |
| `app/api/projects/[id]/revisions/route.ts` | `GET`·`POST` 연결만 |
| `lib/api/http.ts` | `ApiError` 타입, `DbFailure` → 응답 매핑(위 표), JSON 본문 읽기(content-type·크기·파싱) |
| `lib/api/session.ts` | `requireSession()`: 서버 클라이언트 생성 + `getClaims()`, 실패 시 401 응답 |
| `lib/api/projects-handler.ts` | 위 6개 핸들러(세션 → 검증 → `lib/db` → 응답) |
| `lib/ai/draft-http.ts`·`draft-handler.ts` | `projectId` 파싱, 저장 연동, `meta.saved`/`saveError` |
| `docs/projects-api.md` | 브라우저 콘솔 호출 예시(생성→목록→초안→저장→불러오기), 오류 코드표 |
| `CLAUDE.md` | API 라우트 개요 표 갱신 |

## Tech Stack
Next.js 16.4.3 Route Handlers(Cache Components 켜짐), TypeScript, Zod 4, `@supabase/ssr`, Vitest 5. 새 의존성 없음.

## Commands
```
npx vitest run lib
npx tsc --noEmit
npx eslint lib app
npm run build          # 라우트 컴파일(동적 세그먼트 [id] 포함) 확인
```
실제 OpenAI 호출은 이 작업에서 하지 않는다(사용자가 콘솔로 직접).

## Code Style
```ts
// lib/api/projects-handler.ts — 핸들러는 Request를 받아 Response를 돌려주고, 로직은 lib/db에 맡긴다
export async function handleProjectsPost(request: Request): Promise<Response> {
  const session = await requireSession();
  if (!session.ok) return session.response;
  const body = await readJson(request);
  if (!body.ok) return respond(body.error);
  const r = await createProject(session.db, body.value as { name: string; stack: unknown });
  return r.ok ? Response.json({ project: r.data }, { status: 201 }) : respond(dbError(r));
}
```
`/api/draft`의 `respond`·오류 형식과 같은 이름·모양을 쓴다.

## Testing Strategy
- **핸들러 단위 테스트(mock)**: Supabase 서버 클라이언트와 `lib/db` 함수를 mock하고 `Request`를 직접 넘긴다(기존 `draft-handler.test.ts` 방식). 실제 DB·OpenAI 호출 없음.
  | 대상 | 케이스 |
  | --- | --- |
  | 공통 | 세션 없음 401(DB 미호출), content-type 아님 400, JSON 깨짐 400, 본문 1MB 초과 413, `[id]`가 uuid 아님 400 |
  | 프로젝트 | 생성 201(본문 전달), 스키마 위반 422, 목록 200(빈 목록 포함), DB 오류 503 |
  | 설계도 | GET: 최신/`revision` 지정/없음(`null`)/손상 500, PUT: 성공·422·404(RLS)·409(이전 판 보호), 응답에 원본 에러 문구 없음 |
  | 판 | 목록 200, POST 새 판 201, 동시 충돌 503 |
  | draft 연동 | `projectId` 있음+성공 → `createBlueprintRevision` 호출(전달한 blueprint), `meta.saved` 포함 / 저장 실패 → **200**, `meta.saveError`, blueprint 유지 / `projectId` 없음 → 저장 호출 없음, `saved` 없음 / `projectId` 형식 오류 400 / (승인 시) 남의 프로젝트 → 404이고 **AI 호출 안 함** |
- 라우트 파일은 연결만 하므로 `npm run build`(동적 라우트 컴파일)로 확인한다.
- 실제 저장·조회는 사용자가 `docs/projects-api.md`의 콘솔 예시로 확인한다(마지막에 RLS가 실제 API 경로에서 작동하는지 처음 검증됨 — `SPEC-db-rls.md` 후속 위험).

## Boundaries
- Always: 처리 전 `getClaims()`로 세션 확인, 응답은 사용자용 메시지만, 설계도는 `lib/db`의 검증을 통과한 것만 저장, 쓰기는 `application/json`만
- Ask first: `lib/db`에 함수 추가(`getProject`), `saveBlueprint` 동작 변경(Open Question 1), 새 의존성, `/api/projects` 외 경로 추가, 낙관적 동시성 제어
- Never: service role key 사용, 클라이언트가 보낸 사용자 id 신뢰(소유는 RLS·세션이 결정), 이미지·코드 원본 저장, 응답에 DB 원본 에러 노출, 실제 OpenAI 호출(이번 구현 중), `app/`에 라우팅 외 로직

## Success Criteria
1. 핸들러·draft 연동 테스트가 위 표의 모든 케이스를 통과하고 `tsc`·`eslint`·`npm run build`가 통과한다.
2. 세션 없이 모든 새 엔드포인트가 **401**이고 DB를 호출하지 않는다.
3. 사용자가 콘솔 예시로 확인한다: 프로젝트 생성 201 → 목록에 보임 → 설계도 `PUT`(첫 저장)과 `GET` 일치 → `PUT` 재호출 시 같은 `revision`의 `updatedAt`만 갱신 → `POST revisions`로 `revision`이 1 증가.
4. `projectId`를 붙인 `/api/draft` 성공 후 `GET /api/projects/[id]/revisions`에 새 판이 생기고 `generatedBy: "ai"`다. 저장 실패 시에도 초안이 응답에 있다.
5. 다른 계정으로 같은 `[id]`를 호출하면 404이고 본문에 존재 여부가 드러나지 않는다.
6. 이 작업 중 실제 OpenAI 호출·service role 사용이 없었다.

## Risks
| 위험 | 대응 |
| --- | --- |
| **AI 초안이 편집으로 덮어써짐**(Open Question 1): 초안이 새 판으로 저장된 뒤 자동 저장은 *그 최신 판을 갱신*하므로, "AI가 처음 만든 초안"은 첫 자동 저장에서 사라진다. 이후 내보내기 때 새 판이 생기지만 그 사이 원본 초안은 보존되지 않는다 | 승인 전에 결정. 권장안은 아래 Open Question 1 |
| 동시에 두 번 자동 저장하면 마지막 저장이 이김 | 클라이언트 쪽에서 직렬화(저장 중이면 대기). 필요해지면 버전 비교를 별도 작업으로 |
| 초안 생성 후 저장 실패(DB 장애) | 초안은 200으로 반환, `saveError`와 재저장(`PUT`) 경로를 열어 둠 |
| 소유하지 않은 `projectId`로 `/api/draft`를 호출하면 AI 비용만 소모 | Open Question 2의 `getProject`로 AI 호출 **전에** 소유 확인(권장) |
| 프로젝트의 스택과 설계도의 `stack`이 어긋남 | 권장안: `projectId`가 있으면 서버가 **프로젝트의 스택**으로 초안을 만들도록 덮어씀(Open Question 3) |
| RLS는 단위 테스트로 증명되지 않음 | 콘솔 예시(다른 계정으로 404 확인)와 `SPEC-db-rls.md`의 격리 스크립트가 이미 SQL 수준 검증 |
| 사용자 단위 호출 제한 없음(비용) | 이전 스펙과 동일, 범위 밖(S-09 사용량·429 작업) |

## Open Questions
1. **초안 보존 vs 자동 저장 (중요)**: 말씀하신 "AI가 처음 만든 초안을 그대로 보존"하려면 *초안으로 만든 판(generatedBy `ai`)은 첫 편집 저장 때 갱신하지 않고 새 판(`user`)을 만들어야* 합니다. 지금 규칙(자동 저장은 항상 최신 판 갱신)대로면 초안 판이 편집 내용으로 덮어써집니다. 권장: `saveBlueprint`가 "최신 판이 `ai`이고 저장하려는 설계도가 `user` 수정본이면 새 판 추가, 그 뒤 자동 저장은 그 판을 갱신"하도록 `lib/db`를 한 군데 고친다(테스트 포함). 이 범위에 포함할까요, 아니면 지금 규칙 그대로 두고 나중에 다룰까요?
2. **`lib/db`에 `getProject(db, id)` 추가**를 승인하시나요? 이 함수가 있으면 (a) `/api/draft`가 AI 호출 **전에** 프로젝트 소유를 확인(남의/없는 프로젝트면 404, 비용 없음), (b) 프로젝트의 스택을 단일 기준으로 쓸 수 있습니다. 없으면 소유 확인 없이 AI를 호출하고 저장 단계에서 실패합니다. 권장: 추가.
3. `/api/draft`에 `projectId`가 있을 때 요청의 `stack`은? 권장: 선택으로 두고 **프로젝트에 저장된 스택으로 덮어쓴다**(요청값은 무시). 요청의 `stack`을 그대로 쓰는 쪽이 좋으면 알려 주세요.
4. **구현 방식 A(API 라우트)** 제안에 동의하시나요?
5. `GET .../blueprint`에서 판이 하나도 없을 때 **200 `{ blueprint: null }`**(새 프로젝트의 정상 상태)로 해도 되나요? (→ 결정: 내 프로젝트만 200 null, 없거나 남의 프로젝트는 404로 통일. `GET .../revisions`도 동일)
6. 지시서 내보내기 기능은 아직 없지만 **`POST .../revisions` 라우트는 지금 열어 둘까요?** (권장: 예, 판 추가 경로가 하나로 모이고 테스트가 쉬움)
7. 본문 크기 한도 **1MB**와 목록 **최대 100개(페이지네이션 없음)** 가 적절한가요?

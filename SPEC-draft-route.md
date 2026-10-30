# Spec: /api/draft — AI 구조 초안 생성 (F-004)

단일 기능(스키마 검증된 초안을 만들어 주는 라우트 1개)이라 capability map은 만들지 않는다. 구현은 승인 후 시작한다. 작업 순서는 `tasks/plan-draft-route.md` 참조.
근거 문서: `tasks/draft-test-result.md`(결정 사항·채점 사례), `CLAUDE.md`, `.claude/skills/define-schema/data-model.md`.

## Objective
사용자가 입력한 스펙 7개 항목(일부)·이미지(선택)·스택으로 `BlueprintSchema`를 통과하는 설계도 초안을 서버에서 만들어 반환한다. 사전 검증(test:draft)에서 쓴 호출·검증·비용 계산 로직을 `lib/ai/draft-blueprint.ts`로 옮겨 **API와 테스트 스크립트가 같은 로직**을 쓰게 한다. 검증 실패 시 오류 목록을 붙여 **1회만** 재시도한다.

## 조사 결과 (공식 문서, 2026-10-29 확인)

### Vercel 실행 시간과 `maxDuration`
| 항목 | 내용 |
| --- | --- |
| 설정 방법 | App Router 라우트 파일에서 `export const maxDuration = <초>` ([Vercel 문서](https://vercel.com/docs/functions/configuring-functions/duration), Next.js 16 로컬 문서 `route-segment-config/maxDuration.md`도 동일) |
| 한도 (Fluid compute 기준) | Hobby: 기본·최대 300초. Pro/Enterprise: 기본 300초, 최대 800초(GA), 1800초는 베타 |
| 초과 시 | Vercel이 **504 `FUNCTION_INVOCATION_TIMEOUT`**을 반환(우리 JSON 형식이 아님) |
| 비용 | 활성 CPU 시간 + 메모리 시간 과금. AI 호출 같은 I/O 대기는 활성 CPU에 포함되지 않음 |
- 우리 최대 예산(60초)은 요금제와 관계없이 한도 안이다. 단, 위 표는 **Fluid compute가 켜진 프로젝트** 기준이다(신규 프로젝트는 기본 켜짐). 꺼진 기존 프로젝트의 한도는 이번에 확인하지 못했으므로 프로젝트 설정에서 켜져 있는지 확인이 필요하다. 어떤 요금제인지는 코드로 알 수 없어 확인하지 못했다.
- **설정값은 `maxDuration = 70`** 으로 한다. 앱 내부 마감(45/60초)이 먼저 도래해 **우리 형식의 504**를 반환하게 하고, 플랫폼이 먼저 끊어 형식이 다른 504가 나오는 일을 피한다.

### 요청 본문 크기
- Vercel Functions의 요청·응답 본문 최대는 **4.5MB**이며, 초과하면 **413 `FUNCTION_PAYLOAD_TOO_LARGE`**를 플랫폼이 반환한다([Limits](https://vercel.com/docs/functions/limitations)).
- 따라서 **CLAUDE.md의 "이미지 5MB × 3장"은 그대로 전송할 수 없다.** 한 장 5MB도 불가(multipart로 보내도 5MB > 4.5MB), JSON base64는 용량이 약 4/3배가 된다.
| 대안 | 내용 | 평가 |
| --- | --- | --- |
| **A. 업로드 전 축소 (권장)** | 클라이언트가 선택한 이미지를 긴 변·품질 기준으로 줄여 **합계 4MB 이하**로 만든 뒤 `multipart/form-data`(base64 없이 바이너리)로 전송 | 추가 인프라 없음. OpenAI가 이미지를 내부적으로 축소해 처리하므로 와이어프레임 용도에는 손실이 작다고 본다(이번 테스트 이미지는 원본이 226KB였음). CLAUDE.md의 "업로드 전 클라이언트에서 검사" 규칙과 일치 |
| B. Storage 경유 | 이미지를 Supabase Storage·Vercel Blob에 올리고 서버는 URL만 받음 | 본문 제한은 회피하지만 "이미지 원본은 분석 후 저장하지 않는다" 규칙과 충돌(임시 저장 후 삭제 로직·RLS·정리 작업 필요). 비용·복잡도 증가 |
- 서버 계약: **본문 합계 4MB 초과 → 413**(플랫폼 한도 4.5MB보다 먼저 우리 형식으로 거절, 4.0~4.5MB 구간만 우리가 처리). 이미지 3장 초과 → 400. 사용자 선택 단계의 "장당 5MB, 3장" 검사는 유지하되 **전송 직전 합계 4MB 이하**가 새 기준이 된다(클라이언트 구현은 이번 범위 밖).

### Supabase 서버 인증
- Supabase 문서는 서버에서 사용자를 신뢰해야 할 때 **`getClaims()`**(토큰 서명 검증)를 쓰라고 한다. `getSession()`은 서버에서 신뢰하지 말 것(쿠키 위조 가능). 우리 라우트는 `getClaims()`로 세션을 확인하고 없으면 401.
- 서버 클라이언트는 요청마다 새로 만들고 `@supabase/ssr`의 `createServerClient`에 `next/headers`의 `cookies()`(Next 16은 비동기)를 연결한다.
- 문서의 환경변수는 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`다. **결정**: 이 프로젝트의 키가 `sb_publishable_`로 시작하므로 변수명을 이 이름으로 바꿨다(`.env.example`·CLAUDE.md 반영, `.env.local`은 사용자가 직접 수정).

### 측정된 지연 (tasks/draft-test-result.md, terra, effort low)
text 27.2초, image 22.1초, both 35.7초(전체 응답 시간, 호출 1회 기준).

## Assumptions (틀리면 알려주세요)
1. 모델은 `gpt-6.1-terra`, 추론 강도 `low`, 호출당 `max_output_tokens` 16000(`lib`의 옵션으로 변경 가능, 기본값만 위 값).
2. 이 라우트는 `projectId`가 없으면 초안을 **반환만** 한다. `projectId`가 있으면 소유를 확인하고 성공한 초안을 새 판으로 저장한다(`SPEC-projects-api.md`). 응답 원문·이미지는 서버에 저장하지 않는다.
3. 요청은 항상 `multipart/form-data`(텍스트만이어도 동일): 필드 `stack`(JSON), `spec`(JSON, 7개 텍스트 항목), `images`(0~3개 파일).
4. `imageCount`는 요청 필드가 아니라 **전송된 파일 수**로 서버가 계산한다. 클라이언트 값을 믿지 않는다.
5. AI 응답은 받는 즉시 검증하고, `stack`·`source`·`generatedBy`·`version`은 서버가 **요청값으로 덮어쓴다**(모델이 바꾸거나 틀리는 일을 원천 차단, CLAUDE.md "AI 응답을 검증 없이 반영하지 않는다"를 더 강하게 적용). 스키마 변경 없음.
6. OpenAI SDK의 자동 재시도는 끈다(`maxRetries: 0`). 429·5xx는 우리가 재시도하지 않고 클라이언트의 "재시도 버튼"에 맡긴다(CLAUDE.md 에러 처리 규칙). 재시도는 **스키마 검증 실패 1회**뿐이다.
7. 사용자 단위 호출 제한(비용 보호)은 이번 범위가 아니다 → Risks.

## 설계

### 요청·응답 계약
| 구분 | 내용 |
| --- | --- |
| 요청 | `POST /api/draft`, `multipart/form-data`: `stack`(JSON `{framework, styling, architecture}`), `spec`(JSON, `overview`~`constraints` 선택 문자열), `images`(0~3개, png·jpeg·webp, 파일 시그니처로 확인) |
| 입력 조건 | 스펙 7개 중 1개 이상 또는 이미지 1장 이상(`SpecInputSchema`), `stack`은 `BlueprintSchema.shape.stack` |
| 성공 200 | **줄 단위 JSON(NDJSON) 스트림**(`application/x-ndjson`). 마지막 줄 `{ "type": "done", "blueprint": Blueprint, "meta": { "attempts": 1\|2, "elapsedMs": number, "normalized": { "nodeId", "path", "detail" }[], "saved"?: { "revision", "updatedAt" } } }`. 앞 줄은 단계 알림(아래 "응답 스트림") |
| 실패 | 시작 전 오류는 상태 코드 + `{ "error": { "code": string, "message": string(사용자용, 한국어), "retryable": boolean, "fields"?: { "path": string, "message": string }[] } }`(JSON). 시작 후 오류는 200 스트림의 마지막 줄 `{ "type": "error", "status": number, "error": 같은 형식 }` |
| 로그(서버만) | 시도 횟수, 소요 시간, 토큰, 예상 비용, 오류 종류, 사용자 id(claims `sub`). 키·이미지·응답 원문·원본 에러는 남기지 않거나 서버 로그에만 남긴다 |

### 응답 스트림 (개정 2026-10-30, `SPEC-structure-ui.md` 단계 S)
시작 전에 알 수 있는 오류(401·400·413·404·503)는 위 표처럼 **상태 코드 + JSON**(`Content-Type: application/json`)이고, 통과하면 200 `Content-Type: application/x-ndjson`(`Cache-Control: no-cache, no-transform`) 스트림이다. 줄마다 JSON 하나:

| 줄 | 의미 |
| --- | --- |
| `{"type":"stage","stage":"accepted"}` | 요청 확인(세션·입력·프로젝트 소유 확인 끝) |
| `{"type":"stage","stage":"generating","attempt":1}` · `validating` | AI 생성 중 · 검증 |
| `{"type":"stage","stage":"normalizing","changes":3}` | 자동 보정(일어났을 때만) |
| `{"type":"stage","stage":"regenerating","attempt":2}` | 재시도(뒤에 `validating`이 한 번 더) |
| `{"type":"stage","stage":"saving"}` | 새 판 저장(`projectId`가 있고 생성에 성공했을 때만) |
| `{"type":"ping"}` | 하트비트(10초마다, 클라이언트는 무시) |
| `{"type":"done","blueprint":...,"meta":...}` | 성공(마지막 줄, 한 번만) |
| `{"type":"error","status":504,"error":{...}}` | 시작 후 실패(마지막 줄). 아래 오류 매핑의 상태 코드를 `status`로 담는다 |

- **저장 실패**: 초안은 만들어졌지만 저장에 실패하면 `error`(`status` 503, `code` `db_unavailable`)에 `blueprint`를 함께 담아 초안을 버리지 않는다(이전의 "200 + `meta.saveError`" 방식은 폐지).
- 단계 알림은 `draftBlueprint`의 `onProgress` 콜백이 만들고, 스트림 변환은 `lib/ai/draft-stream.ts`가 한다(호출 로직은 스트림을 모른다). `accepted`·`saving`은 핸들러가 직접 보낸다.
- 하트비트·종료 시 타이머 정리: `HEARTBEAT_MS = 10000`. 완료·오류·예외·클라이언트 연결 끊김 모두에서 타이머를 정리한다. 클라이언트가 끊어도 서버는 생성과 저장을 끝까지 마친다.
- 클라이언트는 `Content-Type`으로 JSON 오류와 스트림을 구분하고, `done`·`error` 없이 끝났거나 마지막 줄 이후 30초 동안 아무것도 오지 않으면 연결이 끊긴 것으로 본다(`SPEC-structure-ui.md`).
- Vercel 공식 문서(2026-10-30 확인): 스트리밍 응답에도 `maxDuration`이 적용되고(초과 시 504 강제 종료), 현재 `maxDuration = 70`은 Fluid compute 한도 안이다. 스트림이 시작된 뒤에는 HTTP 상태를 바꿀 수 없으므로, 앱 내부 마감(45·60초)이 먼저 와서 `error` 알림으로 보낸다.

### 오류 매핑
| 상태 | `code` | 발생 조건 | `retryable` |
| --- | --- | --- | --- |
| 400 | `invalid_input` | multipart·JSON 파싱 실패, `stack`/`spec` 스키마 위반, 입력 없음, 이미지 4장 이상, 허용되지 않는 형식 | false |
| 401 | `unauthorized` | Supabase 세션 없음 또는 `getClaims()` 실패 | false |
| 413 | `payload_too_large` | 본문 합계 4MB 초과(또는 이미지 1장이 5MB 초과) | false |
| 422 | `invalid_output` | AI 응답이 `BlueprintSchema` 검증 실패(재시도 후 실패 또는 시간 부족으로 재시도 생략), 거부(refusal), 잘림(incomplete), JSON 아님. `fields`에 원인 경로·메시지(최대 10개) | true |
| 429 | `ai_rate_limited` | OpenAI 429(요청 한도·쿼터). 자세한 원인은 서버 로그만 | true |
| 502 | `ai_unavailable` | OpenAI 5xx·연결 오류·401/400 등 예상 밖 응답(내용 노출 없이 일반 안내) | true |
| 504 | `ai_timeout` | 마감(텍스트만 45초, 이미지 포함 60초)까지 응답을 받지 못함 | true |
| 404 · 503 | `not_found` · `db_unavailable` | `projectId`가 없는·남의 프로젝트(AI 호출 전, 비용 없음) · 프로젝트 조회 또는 저장 실패(저장 실패는 스트림 `error`+`blueprint`) | 404 false · 503 true |
| 500 | `internal_error` | 그 밖의 예외(요청한 7개 외 안전망). 원본 에러는 서버 로그만 | true |
- 사용자 메시지는 한국어이며 Supabase·OpenAI 원본 에러 문구를 그대로 노출하지 않는다(CLAUDE.md).

### `lib/ai/draft-blueprint.ts` (`import "server-only"`)
`draftBlueprint(input, options?) → 결과 객체`(예외를 던지지 않고 판별 가능한 결과를 반환):
- 입력: `{ spec: SpecInput, stack, images: { mediaType, base64 }[] }`. 옵션: `model`, `effort`, `maxOutputTokens`, `budgetMs`, `startedAt`, `client`(테스트용 주입).
- 성공: `{ ok: true, blueprint, attempts, elapsedMs, usage, costUsd, log }`. 실패: `{ ok: false, kind, message, fields?, attempts, elapsedMs, usage, costUsd, log }`. `kind`는 위 오류 매핑과 1:1(`invalid_output | rate_limited | upstream | timeout`).
- `log`는 시도별 `{ ms, usage, rawText?, issues? }`로 **호출자(스크립트)만** 쓴다. 라우트는 응답에 포함하지 않는다.
- 동작:
  1. `deadline = startedAt + (이미지 있음 ? 60초 : 45초)`. 호출마다 `AbortController`+`setTimeout`으로 `deadline - 1.5초(응답 여유)`까지만 기다린다.
  2. Responses API 호출: `store:false`, `reasoning.effort`, strict `json_schema`(`toStrictJsonSchema`), 입력은 `buildDraftPrompt` 결과 + 이미지.
  3. 응답 처리: `status:incomplete`·refusal·JSON 파싱 실패는 **재시도 없이** `invalid_output`. 통과하면 `stripOptionalNulls` → 서버 덮어쓰기(가정 5) → `BlueprintSchema.safeParse`.
  4. 검증 실패이고 **남은 시간이 충분하면** `buildRepairPrompt`로 만든 메시지를 이어 붙여 1회 재시도. 입력: 원래 입력 + 직전 모델 출력(assistant 메시지) + 재시도 지시(사용자 메시지). 재시도 후에도 실패하면 `invalid_output`(+`fields`).
  5. 재시도 가능 조건: `deadline − now − 1.5초 ≥ max(첫 시도 소요 시간, 15초)` (재시도도 첫 시도와 비슷한 시간이 걸린다). 부족하면 **재시도하지 않고** `invalid_output`(422)으로 종료하며 `fields`에 첫 시도의 오류를 담는다.
  6. 시간 초과(응답 없음)는 `timeout`(504), 재시도하지 않는다. OpenAI 오류는 `status`로 분류: 429→`rate_limited`, 그 외→`upstream`.
  7. 비용: 시도마다 `usage`(입력·출력 토큰, 추론 토큰은 출력에 포함이므로 합산하지 않음)로 계산해 누적. 실패해도 소비한 토큰·비용은 결과에 포함한다.
- 단가표 `PRICES`와 `estimateCostUsd`, 호출당 출력 상한 비용 계산도 이 모듈에서 export하고 스크립트가 재사용한다.

### 자동 보정 `core/schema/normalize-blueprint.ts` (순수 함수, 결정 사항)
- 재시도 전에 검증 실패한 응답을 기계적으로 고친다. 흐름: 검증 실패 → `normalizeBlueprint` → 재검증 → 통과하면 그대로 성공(재시도 없음) → 그래도 실패하면 **남은 오류만으로** 기존 재시도 조건 → 422.
- 보정 대상: grid의 layout·responsive에 있는 `direction` 제거, flex의 `columns` 제거(layout·responsive), 같은 부모 아래 `order` 중복 시 (order, 원래 위치) 순으로 0부터 재정렬(겹치지 않는 틈은 유지, 루트는 제외).
- 보정하지 않는 것: FSD `location` 형식, 이름 형식·중복, 루트 개수, block의 direction·columns 등 의미 판단이 필요한 오류.
- 반환: 보정된 설계도 + 내역 `{ nodeId, path, detail }[]`. 입력은 바꾸지 않는다. 내역은 응답 `meta.normalized`, 서버 로그(개수), test:draft 결과의 비고 열(건수)과 `-normalized.json`에 남는다.
- 재시도 응답에도 같은 보정을 적용한다. 재시도 지시문에는 보정으로 해결된 오류가 빠진다.

### `core/prompt/repair-prompt.ts` (순수 함수)
`buildRepairPrompt({ issues, nodeNames? }) → string`
- 입력: Zod 오류(경로 배열·메시지, 최대 10개), 선택적으로 직전 응답의 `nodes[].name`(경로 `nodes.3.order`를 `nodes[3] ProductTabs`처럼 읽기 쉽게 바꾸기 위함).
- 출력: "직전 응답이 아래 규칙을 어겼다. 모든 오류를 고쳐 전체 JSON을 다시 출력하라(오류와 무관한 부분은 바꾸지 말 것)" + 오류 목록. 이전 JSON은 이 문자열에 넣지 않고 대화 이력으로 전달한다.
- 테스트: 오류 개수 제한, 경로 표기(이름 매핑 유/무), 빈 오류 목록, 메시지 포함.

### `core/prompt/draft-prompt.ts` 프롬프트 v2 (`DRAFT_PROMPT_VERSION = "v2"`)
요청된 6개 변경:
1. 한국어로 작성(title, responsibilities, state·description 등 모든 문장. 컴포넌트·훅 이름과 id는 영문 식별자).
2. 상호작용 책임이 있으면 `state`·`events`를 채운다(예: 이전·다음 이동, 탭 선택은 선택 상태와 이벤트가 있어야 하고 client).
3. grid 반응형은 `columns`만, flex 반응형은 `direction`만(`responsive[].direction`을 grid에 쓰지 않는다).
4. FSD `location.dir` 형식을 예시와 함께 명시(`pages/product-detail/ui`, 세그먼트 `page` 금지, 같은 계층은 같은 슬라이스만 부모-자식으로).
5. 형제 `order`는 부모마다 0부터 연속, 중복 금지.
6. 콜백 prop(`onXxx`)이 있으면 해당 이벤트를 `events`에 포함.
- 테스트: 위 6가지가 지시문에 들어 있는지(문자열 단언) + 기존 테스트 유지.
- **선택(Open Question 6)**: 채점 사례 C1·C2·C6를 줄이기 위한 문구(client 조상 아래 server 금지, 훅의 부모는 client, 데이터 조회 노드 1개 이상)를 같이 넣을지.

### `app/api/draft/route.ts` (로직은 `lib`에, 라우트는 얇게)
- `export const maxDuration = 70`.
- 순서: ① `startedAt` 기록 → ② Supabase 세션 확인(없으면 401) → ③ `Content-Length` 4MB 초과면 413 → ④ `formData()` 파싱·입력 검증(400/413) → ⑤ (`projectId`가 있으면) 프로젝트 소유 확인(404·503) → ⑥ 여기까지는 상태 코드 + JSON. 통과하면 NDJSON 스트림을 열어 `accepted` → `draftBlueprint` 호출(`onProgress`로 단계 알림) → (`projectId`가 있으면) `saving` + 새 판 저장 → `done` 또는 `error`.
- 요청 파싱·오류 매핑은 `lib/ai/draft-http.ts`(순수 함수 + 테스트)에 두어 `app/`에는 라우팅과 호출 연결만 둔다(CLAUDE.md "app/ 아래에 로직 금지").
- `lib/supabase/server.ts`(요청별 `createServerClient`)를 새로 만든다. 현재 `lib/supabase/`는 비어 있다.

### `scripts/test-draft.ts` 변경
- `draftBlueprint`를 호출하고 결과 표·원문 저장은 `log`를 사용. `PRICES`·비용 계산은 `lib`에서 import.
- 표에 "시도 횟수" 열 추가. `--max-cost` 보호는 "한 케이스 최악 비용 = 호출당 상한 × 2(재시도 포함)"로 계산.
- `server-only`는 일반 Node에서 import하면 오류가 나므로 npm script를 `tsx --conditions=react-server --env-file=.env.local scripts/test-draft.ts`로 바꾼다. `--dry-run`으로 import가 되는지 API 호출 없이 확인한다.

## Tech Stack
Next.js 16.4.3 App Router, TypeScript, Zod 4, `openai` 7.45.1(Responses API), `@supabase/ssr` 0.12.7, vitest 5, tsx. **신규 의존성 제안: `server-only`**(Next 공식 권장 패턴, 현재 미설치).

## Commands
```
npx vitest run core lib
npx tsc --noEmit
npx eslint core lib scripts app
npm run build                 # 라우트 컴파일 확인
npm run test:draft -- --dry-run   # API 호출 없이 import·요청 형태 확인
npm run test:draft -- --modes text   # 실제 호출은 사용자가 직접 1회
```

## Project Structure
```
lib/ai/draft-blueprint.ts            # 호출·검증·재시도·비용 (server-only)
lib/ai/draft-blueprint.test.ts       # OpenAI mock 테스트
lib/ai/draft-http.ts                 # 요청 파싱·오류 매핑 (순수)
lib/ai/draft-http.test.ts
lib/supabase/server.ts               # 요청별 서버 클라이언트
core/prompt/repair-prompt.ts(+test)  # 재시도 지시문 (순수)
core/prompt/draft-prompt.ts(+test)   # 프롬프트 v2
app/api/draft/route.ts               # POST 핸들러(얇게) + maxDuration
scripts/test-draft.ts                # lib 호출로 변경
```

## Code Style
```ts
// lib/ai/draft-blueprint.ts — 예외 대신 판별 가능한 결과
export type DraftResult =
  | { ok: true; blueprint: Blueprint; attempts: number; elapsedMs: number; usage: Usage; costUsd: number; log: AttemptLog[] }
  | { ok: false; kind: "invalid_output" | "rate_limited" | "upstream" | "timeout"; message: string;
      fields?: { path: string; message: string }[]; attempts: number; elapsedMs: number; usage: Usage; costUsd: number; log: AttemptLog[] };
```
기존 `core/`·`scripts/`와 같은 스타일(Zod 중심, `z.infer`, 파일당 책임 1개, 한국어 주석은 이유만).

## Testing Strategy
- **OpenAI mock**(`client.responses.create`를 `vi.fn`으로 주입, `vi.mock("server-only")`, fake timers). 실제 API 호출 없음.
  | 케이스 | 기대 |
  | --- | --- |
  | 첫 시도 통과 | attempts 1, 재시도 없음 |
  | 검증 실패 후 재시도 성공 | 두 번째 호출 입력에 직전 출력과 오류 경로가 들어 있음, attempts 2, 사용량·비용 합산 |
  | 재시도 후에도 실패 | `invalid_output`, `fields`는 두 번째 시도의 오류, 호출 2회 |
  | 시간 초과 | 호출이 응답 없이 대기 → 마감에서 abort → `timeout`, 재시도 없음 |
  | 남은 시간 부족 | 첫 시도 소요 시간이 길어 `remaining < 필요량` → 호출 1회로 종료, `invalid_output` + 첫 시도 오류 |
  | OpenAI 429 / 5xx | `rate_limited` / `upstream`, 재시도 없음 |
  | refusal·incomplete·JSON 아님 | `invalid_output`, 재시도 없음 |
  | 서버 덮어쓰기 | 모델이 `stack`·`source`를 바꿔도 요청값으로 복원 |
- `draft-http`: 파싱 성공/실패(400), 이미지 4장(400), 형식 위반(400), 4MB 초과(413), kind→status·code 매핑 표 전체.
- 라우트 테스트(mock): 세션 없음 401, 입력 오류 400, 413, 404·503(사전 오류는 상태 코드 유지), 성공 시 스트림 줄 순서(`accepted`→…→`done`), 보정·재시도·저장 단계 유무, 오류별 `error` 알림, 저장 실패의 `error`+`blueprint`, 하트비트 간격과 종료 시 타이머 정리(가짜 타이머). 가능한 범위에서 `POST`를 직접 호출.
- 프롬프트·repair: 위 항목.
- **실제 호출 확인은 사용자가 `npm run test:draft`로 직접 1회**(스펙대로).

## Boundaries
- Always: 키는 환경변수로만, OpenAI 호출은 서버에서만, 응답은 받는 즉시 검증, 처리 전 세션 확인, 사용자용 메시지만 노출·원본 에러는 서버 로그, 원문·이미지 저장 없음
- Ask first: `core/schema/` 수정, 새 의존성(`server-only`), 업로드 방식 변경(Storage 도입), 단가·모델 변경, CLAUDE.md의 이미지 용량 규칙 수정
- Never: 화면 코드 작성, 스키마 수정, API 키 하드코딩·로그 출력, `app/`에 라우팅 외 로직, 실제 OpenAI 호출(이번 구현 중), 이미지·응답 원문의 서버 저장

## Success Criteria
1. mock 테스트가 위 케이스를 모두 통과하고 `tsc`·`eslint`·`npm run build`가 통과한다.
2. 라우트가 세션 없이는 401, 잘못된 입력은 400, 4MB 초과는 413, 검증 실패 422, 429, 502, 504를 위 매핑대로 반환한다.
3. `scripts/test-draft.ts`가 `draftBlueprint`만 호출한다(OpenAI 호출·검증·비용 계산 코드가 한 곳에만 있음). `--dry-run`이 API 호출 없이 통과한다.
4. 프롬프트 v2의 6개 항목이 테스트로 확인된다.
5. 사용자가 `test:draft`를 1회 실행해 text 모드가 통과(기록은 `tasks/draft-test-result.md`)한다.
6. 앱 마감은 텍스트만 45초, 이미지 포함 60초이고, `maxDuration`(70초)이 그보다 길다.

## Risks
| 위험 | 대응 |
| --- | --- |
| **재시도가 거의 실행되지 않을 수 있음**: 측정 지연(text 27초, both 36초)으로 계산하면 text는 첫 시도가 약 **21.7초 이하**일 때만(45 − 1.5 ≥ 2×t), image는 약 **29초 이하**일 때만(60 − 1.5 ≥ 2×t) 재시도 시간이 남는다. 즉 text 대부분은 재시도 없이 422가 된다 | 프롬프트 v2 적용 후 다시 측정하고, 재시도 실행률이 낮으면 예산(text 45→60초) 조정이나 첫 시도 단축을 검토. 재시도 생략 시에도 422에 `fields`를 담아 사용자가 수정·재시도할 수 있게 한다 |
| 4MB 합계 제한으로 고해상도 와이어프레임이 거절됨 | 클라이언트 축소(이번 범위 밖)가 구현되기 전까지는 413 메시지로 안내 |
| 사용자별 호출 제한이 없어 반복 호출 시 비용 증가(1회 약 $0.01~0.02) | 이번 범위 밖. 계정 사용량(S-09)·제한은 별도 작업으로 남김 |
| `server-only`를 plain Node(tsx)에서 import하면 오류 | npm script에 `--conditions=react-server`, 테스트는 `vi.mock("server-only")` |
| Supabase 세션 갱신(Proxy)이 없으면 만료된 토큰이 401로 보일 수 있음 | 이번 범위 밖. 로그인 흐름 구현 시 Proxy와 함께 처리 |
| 서버 덮어쓰기(stack·source)로 모델의 의도적 변경이 무시됨 | 의도된 동작(초안 생성은 입력 스택을 그대로 따라야 함) |

## Open Questions
1. **`.claude/settings.json`의 `Edit(app/**)` 거부 규칙** 때문에 제가 `app/api/draft/route.ts`를 수정할 수 없습니다(현재는 빈 파일). 이번 작업에 한해 풀어 주시겠어요, 아니면 그 파일만 직접 작성하시겠어요? (`lib`·`core`·`scripts`는 영향 없음)
2. **`server-only` 패키지 추가**와 `test:draft` 스크립트에 `--conditions=react-server`를 붙이는 것을 승인하시나요?
3. **이미지 전송 방식**: 대안 A(클라이언트 축소 + multipart + 합계 4MB)로 가고, CLAUDE.md의 이미지 규칙을 "장당 5MB·3장 선택, 전송 합계 4MB"로 바꿔도 되나요? (B 안 Storage는 원본 비저장 규칙과 충돌)
4. **Supabase 환경변수**: `.env.example`의 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 그대로 쓰나요, 문서 권장인 `..._PUBLISHABLE_KEY`로 바꾸나요? 인증 확인은 `getClaims()`로 진행해도 되나요?
5. **재시도 가능 조건** `remaining ≥ max(첫 시도 시간, 15초)`로 확정해도 되나요? 위 Risks의 산술대로 text는 재시도가 드물 수 있습니다.
6. **프롬프트 v2에 NX-03·NX-04·R-07 대응 문구**(client 아래 server 금지, 훅 부모는 client, 조회 노드 1개 이상)를 추가할까요? 요청하신 6개에는 없지만 채점에서 통과 응답 4건 중 3건이 C1이었습니다.
7. **서버 덮어쓰기**(`stack`·`source`·`generatedBy`·`version`을 요청값으로 강제)에 동의하시나요?

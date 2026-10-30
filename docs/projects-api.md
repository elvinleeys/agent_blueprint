# 프로젝트·설계도 API 사용과 브라우저 콘솔 확인

로그인한 탭(`http://localhost:3000/` 등 앱과 같은 주소)의 개발자 도구 콘솔에서 실행한다. 각 블록은 **서로 독립적으로 붙여넣어 실행**된다(앞 블록의 변수에 의존하지 않음). 블록 2만 OpenAI를 호출한다(비용 발생). `/api/draft`는 응답이 **줄 단위 JSON 스트림**이라 블록 2의 도우미로 읽는다.

## 엔드포인트

| 요청 | 설명 | 성공 |
| --- | --- | --- |
| `GET /api/projects` | 내 프로젝트 목록(최근 수정 순, 최대 100) | 200 `{ projects }` |
| `POST /api/projects` | `{ name, stack }`로 생성 | 201 `{ project }` |
| `PATCH /api/projects/[id]` | 이름만 수정(`{ name }`, trim 후 1~100자, 다른 필드는 400, 없거나 남의 프로젝트는 404) | 200 `{ project }` |
| `GET /api/projects/[id]/blueprint?revision=N` | 설계도 불러오기(`revision` 생략 시 최신 판). 내 프로젝트인데 판이 없으면 `{ blueprint: null }`, 없거나 남의 프로젝트면 404 | 200 |
| `PUT /api/projects/[id]/blueprint` | 자동 저장: 최신 판 갱신. 최신 판이 AI 초안이고 저장본이 사용자 수정본(`generatedBy: "user"`)이면 새 판을 추가(AI 원본 보존) | 200 `{ revision, updatedAt }` |
| `GET /api/projects/[id]/revisions` | 판 목록(최신 순, nodes 제외). 내 프로젝트인데 판이 없으면 `[]`, 없거나 남의 프로젝트면 404 | 200 `{ revisions }` |
| `POST /api/projects/[id]/revisions` | 새 판 추가(지시서 내보내기 시점용) | 201 `{ revision, updatedAt }` |
| `POST /api/draft` (multipart) | `projectId`를 붙이면 AI 호출 **전에** 소유를 확인하고, 스택은 프로젝트에 저장된 값을 쓰며, 성공한 초안을 새 판으로 저장. 시작 전 오류는 상태 코드 + JSON, 시작 후는 200 NDJSON 스트림(아래 "초안 응답 스트림") | 200 `application/x-ndjson` (마지막 줄 `done`: `{ blueprint, meta: { saved } }`) |

## 오류

| 상태 | `error.code` | 의미 |
| --- | --- | --- |
| 400 | `invalid_input` | JSON 아님·`application/json` 아님·id/projectId가 uuid 아님·필수 값 없음 |
| 401 | `unauthorized` | 로그인 안 됨 |
| 404 | `not_found` | 없는 프로젝트이거나 남의 프로젝트(구분하지 않음) |
| 409 | `conflict` | 이력 규칙 위반(예: 이전 판 수정) |
| 413 | `payload_too_large` | JSON 본문 1MB 초과 |
| 422 | `invalid_data` | 설계도가 스키마를 통과하지 못함(`error.fields`에 경로) |
| 500 | `stored_data_invalid` | DB에 저장된 값이 손상(드묾) |
| 503 | `db_unavailable` | DB 일시 오류(`retryable: true`), 새 판 동시 추가 충돌 포함 |

## 초안 응답 스트림 (`/api/draft`)

시작 전에 알 수 있는 오류(401·400·413·404·503)는 위 표처럼 **상태 코드 + JSON 오류 본문**(`Content-Type: application/json`)이다. 통과하면 200 `Content-Type: application/x-ndjson`으로 줄마다 JSON 하나를 보낸다.

| 줄 | 의미 |
| --- | --- |
| `{"type":"stage","stage":"accepted"}` | 요청 확인(인증·입력·프로젝트 소유 확인 끝) |
| `{"type":"stage","stage":"generating","attempt":1}` | AI 생성 중 |
| `{"type":"stage","stage":"validating","attempt":1}` | 검증 |
| `{"type":"stage","stage":"normalizing","changes":3}` | 자동 보정(있을 때만) |
| `{"type":"stage","stage":"regenerating","attempt":2}` | 다시 생성 중(재시도할 때만, 뒤에 `validating`이 한 번 더) |
| `{"type":"stage","stage":"saving"}` | 새 판 저장(`projectId`가 있을 때만) |
| `{"type":"ping"}` | 하트비트(10초마다, 무시해도 됨) |
| `{"type":"done","blueprint":{...},"meta":{ attempts, elapsedMs, normalized, saved }}` | 성공(마지막 줄) |
| `{"type":"error","status":504,"error":{ code, message, retryable, fields? }}` | 시작 후 실패(마지막 줄). `status`는 원래 HTTP 상태 값(422·429·502·504 등) |

- 초안은 만들어졌지만 **저장에 실패**하면 `error`(`status` 503, `code` `db_unavailable`)에 `blueprint`를 함께 담는다(초안을 버리지 않는다. `PUT`으로 다시 저장 가능).
- `done`·`error` 없이 스트림이 끝났거나 마지막 줄 이후 30초 동안 아무것도 오지 않으면 연결이 끊긴 것이다(클라이언트가 오류로 처리).
- 오류 `code`·`message`·`retryable`·`fields`는 이전 JSON 오류 본문과 같다.

## 콘솔 예시

### 1. 프로젝트 생성 → 목록 조회 (비용 없음)
```js
const call = async (method, url, body) => {
  const r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  return [r.status, await r.json()];
};
console.log(await call("POST", "/api/projects", { name: "콘솔 테스트", stack: { framework: "next", styling: "tailwind", architecture: "feature-based" } }));
console.log(await call("GET", "/api/projects"));
```
기대: 생성 201 `{ project: { id, name, stack, ... } }`, 목록 200에 방금 만든 프로젝트가 첫 번째로 보인다.

### 1-1. 프로젝트 이름 수정 (비용 없음)
```js
const { projects } = await (await fetch("/api/projects")).json();
const r = await fetch(`/api/projects/${projects[0].id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "이름 수정 테스트" }) });
console.log(r.status, await r.json());
```
기대: 200 `{ project: { name: "이름 수정 테스트", ... } }`. `{ name: "" }`은 422, `{ name: "x", stack: {} }`는 400.

### 2. 초안 생성 (projectId 포함) — 실제 OpenAI 호출, 1회 약 $0.01~0.02, 약 15~30초
```js
const { projects } = await (await fetch("/api/projects")).json();
const pid = projects[0].id; // 가장 최근 프로젝트
const f = new FormData();
f.set("projectId", pid); // stack은 필요 없음: 프로젝트에 저장된 스택을 서버가 쓴다
f.set("spec", JSON.stringify({ overview: "상품 상세 페이지: 갤러리, 정보, 장바구니 담기" }));

// 응답은 줄 단위 JSON 스트림이다. 줄이 도착하는 대로 단계를 출력하고 마지막 줄(done 또는 error)을 돌려준다
const t0 = performance.now();
const r = await fetch("/api/draft", { method: "POST", body: f });
let last;
if (!r.headers.get("content-type")?.includes("application/x-ndjson")) {
  last = { httpStatus: r.status, ...(await r.json()) }; // 시작 전 오류(400·401·404·413·503)는 상태 코드 + JSON
} else {
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line) continue;
      last = JSON.parse(line);
      const at = ((performance.now() - t0) / 1000).toFixed(1) + "초";
      console.log(at, last.type === "stage" ? "stage:" + last.stage : last.type, last.type === "done" || last.type === "error" ? "" : last);
    }
  }
}
console.log(last?.type, last?.meta ?? last?.error, last?.blueprint?.nodes?.length);
```
기대: 단계가 도착 시점에 한 줄씩 찍힌다(`accepted` → `generating` → `validating` → (`normalizing`) → `saving` 순서, 약 15~30초 사이에 `ping`이 10초마다 끼어든다). 마지막 줄은 `done`이고 `meta.saved: { revision: 1, updatedAt }`가 보인다. 실패하면 마지막 줄이 `error`(`status`·`error.code`·`error.fields`)이고, **저장만 실패**했다면 `error`에 `blueprint`가 함께 있다. 마지막 줄이 `done`·`error`가 아니면 연결이 끊긴 것이다.

### 3. 설계도 불러오기 + 판 목록 (비용 없음)
```js
const { projects } = await (await fetch("/api/projects")).json();
const pid = projects[0].id;
const bp = await (await fetch(`/api/projects/${pid}/blueprint`)).json();
const rv = await (await fetch(`/api/projects/${pid}/revisions`)).json();
console.log(bp.blueprint?.title, bp.blueprint?.generatedBy, bp.blueprint?.nodes?.length);
console.log(rv.revisions);
```
기대: 블록 2 직후라면 `generatedBy: "ai"`, 판 목록에 `revision: 1` 한 줄. 판이 없는 **내** 새 프로젝트라면 `bp.blueprint`가 `null`이다(없거나 남의 프로젝트 id면 두 요청 모두 404).

### 4. 자동 저장과 AI 초안 보존 (비용 없음, 블록 2 이후)
```js
const { projects } = await (await fetch("/api/projects")).json();
const pid = projects[0].id;
const { blueprint } = await (await fetch(`/api/projects/${pid}/blueprint`)).json();
const edited = { ...blueprint, generatedBy: "user", title: blueprint.title + " (수정)" };
const put = (b) => fetch(`/api/projects/${pid}/blueprint`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => [r.status, await r.json()]);
console.log(await put(edited)); // 첫 수정 저장: 새 판 → revision 2
console.log(await put({ ...edited, title: edited.title + "!" })); // 두 번째 저장: 같은 판 갱신 → revision 2
console.log((await (await fetch(`/api/projects/${pid}/revisions`)).json()).revisions);
```
기대: 두 저장 모두 `{ revision: 2 }`, 판 목록은 `revision: 2 (user)`, `revision: 1 (ai)` 두 줄(AI 원본은 그대로).

### 5. 오류 경로 (비용 없음)
```js
// 남의·없는 프로젝트로 초안 요청: OpenAI를 호출하지 않고 404
const f = new FormData();
f.set("projectId", "00000000-0000-4000-8000-000000000000");
f.set("spec", JSON.stringify({ overview: "x" }));
const r = await fetch("/api/draft", { method: "POST", body: f });
console.log(r.status, await r.json()); // 404 not_found (시작 전 오류라 스트림이 아니라 JSON)
// id 형식 오류: 400
console.log((await fetch("/api/projects/abc/blueprint")).status);
```

# 프로젝트·설계도 API 사용과 브라우저 콘솔 확인

로그인한 탭(`http://localhost:3000/` 등 앱과 같은 주소)의 개발자 도구 콘솔에서 실행한다. 각 블록은 **서로 독립적으로 붙여넣어 실행**된다(앞 블록의 변수에 의존하지 않음). 블록 2만 OpenAI를 호출한다(비용 발생).

## 엔드포인트

| 요청 | 설명 | 성공 |
| --- | --- | --- |
| `GET /api/projects` | 내 프로젝트 목록(최근 수정 순, 최대 100) | 200 `{ projects }` |
| `POST /api/projects` | `{ name, stack }`로 생성 | 201 `{ project }` |
| `GET /api/projects/[id]/blueprint?revision=N` | 설계도 불러오기(`revision` 생략 시 최신 판, 판이 없으면 `{ blueprint: null }`) | 200 |
| `PUT /api/projects/[id]/blueprint` | 자동 저장: 최신 판 갱신. 최신 판이 AI 초안이고 저장본이 사용자 수정본(`generatedBy: "user"`)이면 새 판을 추가(AI 원본 보존) | 200 `{ revision, updatedAt }` |
| `GET /api/projects/[id]/revisions` | 판 목록(최신 순, nodes 제외) | 200 `{ revisions }` |
| `POST /api/projects/[id]/revisions` | 새 판 추가(지시서 내보내기 시점용) | 201 `{ revision, updatedAt }` |
| `POST /api/draft` (multipart) | `projectId`를 붙이면 AI 호출 **전에** 소유를 확인하고, 스택은 프로젝트에 저장된 값을 쓰며, 성공한 초안을 새 판으로 저장 | 200 `{ blueprint, meta: { saved } }` |

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

`/api/draft`는 초안이 만들어졌지만 저장에 실패하면 **200**으로 초안을 돌려주고 `meta.saveError`에 이유를 담는다(`PUT`으로 다시 저장 가능).

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

### 2. 초안 생성 (projectId 포함) — 실제 OpenAI 호출, 1회 약 $0.01~0.02, 약 15~30초
```js
const { projects } = await (await fetch("/api/projects")).json();
const pid = projects[0].id; // 가장 최근 프로젝트
const f = new FormData();
f.set("projectId", pid); // stack은 필요 없음: 프로젝트에 저장된 스택을 서버가 쓴다
f.set("spec", JSON.stringify({ overview: "상품 상세 페이지: 갤러리, 정보, 장바구니 담기" }));
const r = await fetch("/api/draft", { method: "POST", body: f });
const body = await r.json();
console.log(r.status, body.meta, body.blueprint?.nodes?.length);
```
기대: 200, `meta.saved: { revision: 1, updatedAt }`. 저장이 실패했다면 `meta.saveError`가 보이고 초안은 그대로 응답에 있다.

### 3. 설계도 불러오기 + 판 목록 (비용 없음)
```js
const { projects } = await (await fetch("/api/projects")).json();
const pid = projects[0].id;
const bp = await (await fetch(`/api/projects/${pid}/blueprint`)).json();
const rv = await (await fetch(`/api/projects/${pid}/revisions`)).json();
console.log(bp.blueprint?.title, bp.blueprint?.generatedBy, bp.blueprint?.nodes?.length);
console.log(rv.revisions);
```
기대: 블록 2 직후라면 `generatedBy: "ai"`, 판 목록에 `revision: 1` 한 줄. 판이 없는 새 프로젝트라면 `bp.blueprint`가 `null`이다.

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
console.log(r.status, await r.json()); // 404 not_found
// id 형식 오류: 400
console.log((await fetch("/api/projects/abc/blueprint")).status);
```

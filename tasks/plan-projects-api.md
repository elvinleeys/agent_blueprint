# Plan: 프로젝트·설계도 저장/불러오기 연결 (SPEC-projects-api.md)

> **이 문서는**: 프로젝트와 설계도를 저장하고 불러오는 API를 어떤 순서로 만들지 정한 작업 계획이다. 기능 자체의 설명은 `SPEC-projects-api.md`에 있다.
> **목록에 들어 있는 것**: `T1`~`T9`는 작업 한 칸이다. 칸마다 "끝났다고 보는 기준", "확인 방법", "건드리는 파일"이 적혀 있다.

의존 순서: 공통 HTTP 헬퍼 → 세션 헬퍼 → (승인 시) `getProject` → 프로젝트 → 설계도 → 판 → `/api/draft` 연동 → 문서. 각 단계 뒤에 `npx vitest run`, `npx tsc --noEmit`, `npx eslint <대상>`을 확인하고 단계마다 커밋한다. **실제 OpenAI 호출·service role 없음.** Open Question 1~3의 답에 따라 T3·T7이 바뀐다.

## 작업
- [ ] T1. **HTTP 공통 도우미 만들기** — `lib/api/http.ts` + 테스트: `ApiError` 타입, `DbFailure` → 상태·`code` 매핑(스펙 오류 표), `readJson`(content-type 검사, 1MB 한도, 파싱 오류), uuid 검사
  - 끝났다고 보는 기준(Acceptance): 모든 매핑 행(404/409/422/500·stored_data_invalid/503)이 표와 일치, 원본 에러 문구 미노출
  - 확인 방법(Verify): `npx vitest run lib/api`
  - 건드리는 파일(Files): `lib/api/http.ts`, `lib/api/http.test.ts`
- [ ] T2. **로그인 확인 도우미 만들기** — `lib/api/session.ts` + 테스트: `requireSession()` = 서버 클라이언트 + `getClaims()`, 실패 시 401 응답
  - 끝났다고 보는 기준: 세션 없음·claims 비어 있음 → 401, 성공 시 `{ db, userId }`, 예외는 500
  - 확인 방법: `npx vitest run lib/api`
  - 건드리는 파일: `lib/api/session.ts`, `lib/api/session.test.ts`
- [ ] T3. **프로젝트 한 건을 읽는 함수 추가** — (Open Question 2 승인 시) `lib/db/projects.ts`에 `getProject(db, id)` + 테스트
  - 끝났다고 보는 기준: 내 프로젝트면 `Project`, 없거나 RLS로 안 보이면 `not_found`, DB 오류는 `unavailable`
  - 확인 방법: `npx vitest run lib/db`
  - 건드리는 파일: `lib/db/projects.ts`, `lib/db/projects.test.ts`
- [ ] T4. **프로젝트 목록·생성 API 만들기** — 프로젝트 핸들러(요청을 처리하는 함수) + 라우트: `GET`·`POST /api/projects`
  - 끝났다고 보는 기준: 세션 없음 401(DB 미호출), 생성 201·스키마 위반 422, 목록 200·DB 오류 503
  - 확인 방법: `npx vitest run lib/api`, `npm run build`
  - 건드리는 파일: `lib/api/projects-handler.ts`(+test), `app/api/projects/route.ts`
- [ ] T5. **설계도 불러오기·저장 API 만들기** — 설계도 핸들러 + 라우트: `GET`·`PUT /api/projects/[id]/blueprint`
  - 끝났다고 보는 기준: GET 최신/`revision` 지정/없음 `null`/손상 500, PUT 성공·422·404·409, uuid 아니면 400
  - 확인 방법: `npx vitest run lib/api`, `npm run build`(동적 라우트 컴파일)
  - 건드리는 파일: `lib/api/projects-handler.ts`(+test), `app/api/projects/[id]/blueprint/route.ts`
- [ ] T6. **판(설계도 버전) 목록·추가 API 만들기** — 판 핸들러 + 라우트: `GET`·`POST /api/projects/[id]/revisions`
  - 끝났다고 보는 기준: 목록 200(nodes 미포함), 새 판 201, 동시 충돌 503
  - 확인 방법: `npx vitest run lib/api`, `npm run build`
  - 건드리는 파일: `lib/api/projects-handler.ts`(+test), `app/api/projects/[id]/revisions/route.ts`
- [ ] T7. **`/api/draft`와 프로젝트 저장 연결하기** — `/api/draft` 연동: `projectId` 파싱, (승인 시) AI 호출 전 소유·스택 확인, 성공 시 `createBlueprintRevision`, `meta.saved`/`saveError`
  - 끝났다고 보는 기준: 스펙 "draft 연동" 테스트 행 전부, 저장 실패에도 200·초안 유지, `projectId` 없으면 기존 동작 그대로(기존 테스트 통과)
  - 확인 방법: `npx vitest run lib/ai`
  - 건드리는 파일: `lib/ai/draft-http.ts`, `lib/ai/draft-handler.ts` (+ 각 test)
- [ ] T8. **사용 설명 문서와 API 표 갱신** — `docs/projects-api.md`(콘솔 호출 예시: 생성→목록→초안(projectId)→저장→불러오기→판 목록, 오류 코드표), `CLAUDE.md` API 표 갱신
  - 끝났다고 보는 기준: 예시가 오타 없이 단독 실행 가능(변수 재사용 없음), 비용이 드는 예시는 표기
  - 확인 방법: 문서 검토, 사용자가 콘솔로 실행
  - 건드리는 파일: `docs/projects-api.md`, `CLAUDE.md`
- [ ] T9. **마지막 확인**: `vitest`, `tsc`, `eslint`, `npm run build` 결과 보고 + 사용자 수동 확인 체크리스트(Success Criteria 3~5)

## 병렬·순차 (어느 칸을 먼저 해야 하나)
T1→T2→(T3)→T4→T5→T6은 같은 핸들러 파일을 쓰므로 순차. T7은 T2·T3 이후. T8은 마지막. 한 번에 한 단계씩.

## 위험 구간 (구현 중 재확인)
- Next 16 동적 라우트의 `params`(Promise) 시그니처와 Cache Components에서의 Route Handler 동작(로컬 문서 확인)
- `request.json()` 대신 직접 읽을 때 본문 크기 제한 방법(`content-length` + 실제 길이)
- 기존 `draft-handler`의 로그·응답 형식을 깨지 않는지(기존 테스트가 회귀 방어)
- Open Question 1이 "예"이면 `lib/db/blueprints.ts`(`saveBlueprint`)와 그 테스트도 변경 — 별도 커밋

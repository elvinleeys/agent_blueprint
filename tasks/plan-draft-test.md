# Plan: OpenAI 구조 초안 생성 사전 검증

스펙: `SPEC-draft-test.md`. 승인 전에는 구현하지 않는다.
파일명은 `plan.md`가 아니라 `plan-draft-test.md`로 했다(기존에 언급된 `tasks/plan.md`와 충돌 방지).

## 의존 관계 (순차)
```
T1 변환 함수 ──┐
T2 프롬프트 ───┼─→ T4 실행 스크립트 ─→ T5 실행·기록(사용자) ─→ T6 문서·커밋
T3 픽스처 ─────┘
```
T1·T2·T3은 서로 독립이라 병렬 가능하지만 한 세션에서 순서대로 진행한다.

## Tasks

- [x] **T0: 사전 확인**
  - Acceptance: 승인 사항 반영(이미지 제공 방식, tsx, strict-json-schema 파일, 실행 주체). 모델명·가격을 공식 문서로 재확인
  - Verify: 스펙의 Open Questions 해소
  - Files: 없음

- [x] **T1: `toStrictJsonSchema` / `stripOptionalNulls` (+ 테스트)**
  - Acceptance: `BlueprintSchema`에서 만든 JSON Schema의 모든 객체가 `additionalProperties:false`, `required`=`properties` 전체, 원래 선택 필드는 null 허용. `sample-blueprint.json`에 선택 필드 `null`을 채워 strip하면 원본과 같고 `BlueprintSchema` 통과. 원래 nullable 필드(`parentId`, `layout` 등)의 `null`은 유지
  - Verify: `npx vitest run core/prompt`, `npx tsc --noEmit`
  - Files: `core/prompt/strict-json-schema.ts`, `core/prompt/strict-json-schema.test.ts`

- [x] **T2: `buildDraftPrompt` (+ 테스트)**
  - Acceptance: 채워진 스펙 항목만 포함, 스택 3값 포함, hasImage 분기, 설계도 규칙(평면 배열·parentId, 이름 형식, 배치 책임은 부모, `style.properties`에 배치 속성 금지, location 형식과 Next+FSD 규칙, renderMode·훅 규칙, `assumed` 표시) 포함. 순수 함수
  - Verify: `npx vitest run core/prompt`, `npx eslint core`
  - Files: `core/prompt/draft-prompt.ts`, `core/prompt/draft-prompt.test.ts`

- [ ] **T3: 픽스처** (이미지·expected.md는 사용자 준비 대기, spec.json은 작성 완료)
  - Acceptance: 화면 2~3개, 각각 `wireframe.png`(5MB 이하), `spec.json`(`SpecInputSchema` 통과), `expected.md`(예상 노드·레이아웃·상태·주의점)
  - Verify: `spec.json`을 `SpecInputSchema`로 검증하는 오프라인 확인 1회, 이미지 용량 확인
  - Files: `fixtures/wireframes/<화면>/*`

- [x] **T4: `scripts/test-draft.ts` + `test:draft` npm script + tsx 추가**
  - Acceptance: 인자 `--screen`, `--runs`, `--model`. 3모드 호출(Responses API, `text.format` strict json_schema, 이미지는 data URL `input_image`). `status`·`refusal` 처리. strip → `safeParse`. 시간·토큰·비용 측정. 키는 `process.env.OPENAI_API_KEY`만 사용하며 없으면 안내 후 종료. 키·응답 원문 로그 출력 없음. 결과를 `tasks/draft-test-result.md` 표로 기록
  - Verify: `npx tsc --noEmit`, `npx eslint scripts`, 키 없이 실행하면 안내 메시지로 종료, `--dry-run`(API 호출 없이 요청 본문과 스키마 크기만 출력)으로 요청 형태 확인
  - Files: `scripts/test-draft.ts`, `package.json`, `package-lock.json`

- [ ] **T5: 실제 실행(사용자 실행) 및 결과 기록**
  - Acceptance: 화면별 3모드 결과가 표에 기록됨. 세 경우 모두 통과하면 완료. 실패 시 실패 필드 분석 후 프롬프트·변환 함수 조정(스키마 수정이 필요해지면 먼저 질문)하고 재실행
  - Verify: `! npm run test:draft -- --screen product-detail --runs 1`
  - Files: `tasks/draft-test-result.md`

- [ ] **T6: 문서와 커밋**
  - Acceptance: CLAUDE.md "폴더 구조"에 `scripts/`, `fixtures/`, `tasks/` 추가, 결과 요약과 F-004 설계 시사점(재시도 필요 여부, 사용 모델, 변환 방식) 기록, 키·응답 원문 미포함 확인
  - Verify: 커밋 전 시크릿 패턴 검색, `git diff --cached --name-only` 확인
  - Files: `CLAUDE.md`, `tasks/draft-test-result.md`
  - 커밋(분리): `feat: 초안 프롬프트·strict 스키마 변환`, `chore: 와이어프레임 픽스처`, `feat: 초안 생성 테스트 스크립트`, `docs: 초안 생성 테스트 결과와 스펙`

## 체크포인트
1. T1~T2 후: 오프라인 테스트·tsc·eslint 통과 (API 없이 확인 가능한 범위는 여기까지)
2. T4 후: `--dry-run`으로 요청 본문 확인, 스키마 크기가 한도(프로퍼티 5000, 중첩 10) 안인지 확인
3. T5 후: 결과 표 검토 → F-004 방향 결정

## 위험
- API가 변환된 스키마를 400으로 거부하면 T4 직후 첫 호출에서 드러난다. 그때 `toStrictJsonSchema`를 조정한다(키워드 제거 등).
- 세 모드 모두 1회 통과해도 안정성은 별개다. 필요하면 `--runs 3`으로 통과율을 추가 측정한다.

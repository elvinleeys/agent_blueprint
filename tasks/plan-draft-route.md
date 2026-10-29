# Plan: /api/draft (F-004)

스펙: `SPEC-draft-route.md`. 승인 전에는 구현하지 않는다. 실제 OpenAI 호출은 하지 않으며, 실제 확인은 사용자가 `test:draft`로 1회 실행한다.

## 의존 관계
```
T0 승인 사항 ─→ T1 repair-prompt ─┐
              ├→ T2 prompt v2 ────┼→ T3 draft-blueprint ─→ T4 test-draft.ts 수정 ─┐
              └→ T5 supabase server + draft-http ──────────────────────────────────┼→ T6 route ─→ T7 문서·커밋 ─→ (사용자) 실제 1회 실행
```
T1·T2·T5는 서로 독립이다. T3은 T1·T2에, T4는 T3에, T6은 T3·T5에 의존한다.

## Tasks

- [x] **T0: 승인 사항 확정**
  - Acceptance: 스펙 Open Questions 1~7 해소(특히 `app/**` 수정 권한, `server-only`, 이미지 전송 방식, 재시도 조건)
  - Verify: 답변 반영해 스펙 갱신
  - Files: `SPEC-draft-route.md`

- [x] **T1: `repair-prompt.ts` (TDD)**
  - Acceptance: 오류 목록(경로·메시지) → 재시도 지시문. 최대 10개, 경로 표기(이름 매핑 유/무), 빈 목록 처리
  - Verify: `npx vitest run core/prompt`
  - Files: `core/prompt/repair-prompt.ts`, `core/prompt/repair-prompt.test.ts`

- [x] **T2: 프롬프트 v2**
  - Acceptance: 한국어 작성, 상호작용 책임→state·events, grid=columns/flex=direction, FSD 형식 예시, 형제 order, 콜백 prop→events가 지시문에 포함. `DRAFT_PROMPT_VERSION` export. 기존 테스트 유지
  - Verify: `npx vitest run core/prompt`
  - Files: `core/prompt/draft-prompt.ts`, `core/prompt/draft-prompt.test.ts`

- [x] **T3: `lib/ai/draft-blueprint.ts` (+ mock 테스트)**
  - Acceptance: 스펙의 동작 1~7. 단가표·비용 계산 export. 결과는 판별 가능한 객체. mock 테스트 8케이스 통과(재시도 성공, 재시도 후 실패, 시간 초과, 시간 부족 시 재시도 생략, 429/5xx, refusal·incomplete, 덮어쓰기, 첫 시도 통과)
  - Verify: `npx vitest run lib`, `npx tsc --noEmit`, `npx eslint lib core`
  - Files: `lib/ai/draft-blueprint.ts`, `lib/ai/draft-blueprint.test.ts`, `package.json`·`package-lock.json`(`server-only`)

- [x] **T4: `scripts/test-draft.ts`를 lib 호출로 변경**
  - Acceptance: OpenAI 호출·검증·비용 계산 코드는 script에서 제거되고 `draftBlueprint`만 호출. 표에 시도 횟수 열, 원문 저장은 `log` 사용, `--max-cost`는 재시도 포함 최악 비용 기준. npm script에 `--conditions=react-server`
  - Verify: `npm run test:draft -- --dry-run` 통과(API 호출 없음), `tsc`·`eslint scripts`
  - Files: `scripts/test-draft.ts`, `package.json`

- [x] **T5: `lib/supabase/server.ts` + `lib/ai/draft-http.ts` (+ 테스트)**
  - Acceptance: 요청별 서버 클라이언트(`getClaims()`로 확인). `parseDraftRequest`(FormData → 입력, 400·413 구분, 이미지 시그니처·개수·용량 검증), `toErrorResponse`(kind→상태·code·message·retryable 매핑)
  - Verify: `npx vitest run lib`, `tsc`, `eslint lib`
  - Files: `lib/supabase/server.ts`, `lib/ai/draft-http.ts`, `lib/ai/draft-http.test.ts`

- [ ] **T6: `app/api/draft/route.ts`** — 로직은 `lib/ai/draft-handler.ts`로 분리해 구현·테스트 완료(커밋됨). **`app/**` 수정 거부 규칙이 남아 있어 라우트 파일(maxDuration + 위임)은 미작성**
  - Acceptance: `maxDuration = 70`, 순서(시작 시각 → 세션 401 → 본문 크기 413 → 파싱·검증 400 → `draftBlueprint` → 매핑 응답). 라우트에는 로직을 두지 않고 `lib` 호출만. mock 라우트 테스트(401·400·200)
  - Verify: `npx vitest run`, `tsc`, `eslint app lib`, `npm run build`
  - Files: `app/api/draft/route.ts`, `lib/ai/draft-route.test.ts`

- [x] **T7: 문서·커밋** (CLAUDE.md·스펙 갱신 완료. 라우트 파일 커밋은 T6 이후)
  - Acceptance: CLAUDE.md 폴더 구조에 `lib/ai/`, `scripts/`, `fixtures/`, `tasks/` 추가, API 표의 `/api/draft` 행(입력 형식·오류 코드·시간 기준)과 이미지 용량 규칙 갱신(T0 결정 반영). 시크릿 패턴 검색
  - Verify: 커밋 전 `vitest`·`tsc`·`eslint`·`build` 통과
  - 커밋(분리): `feat: 재시도 지시문 생성`(T1), `feat: 초안 프롬프트 v2`(T2), `feat: 초안 생성 서버 로직`(T3), `chore: test:draft가 서버 로직을 호출`(T4), `feat: 인증·요청 검증 헬퍼`(T5), `feat: /api/draft 라우트`(T6), `docs: 초안 API 규칙 갱신`(T7)

- [ ] **T8: 실제 확인 (사용자 실행)**
  - Acceptance: `! npm run test:draft -- --modes text`가 통과하고 시도 횟수·비용이 표에 기록됨
  - Verify: `tasks/draft-test-result.md`
  - Files: 없음

## 체크포인트
1. T1~T3 후: `vitest`(mock 8케이스) 전체 통과. 이 시점에 재시도 로직이 확정된다.
2. T4 후: `--dry-run`이 `server-only` import를 포함해 API 호출 없이 통과.
3. T6 후: `tsc`·`eslint`·`npm run build` 통과. 여기까지 실제 호출 0회.
4. T8 후: 지연 재측정으로 스펙 Risks의 "재시도 실행률"을 판단.

## 위험
- T6은 `Edit(app/**)` 거부 규칙에 막혀 있다. T0 해결 전에는 T6을 제외한 모든 작업이 가능하다.
- 재시도 가능 시간 산술(스펙 Risks)이 실제 지연과 맞지 않으면 예산 값을 조정해야 한다(상수 한 곳).

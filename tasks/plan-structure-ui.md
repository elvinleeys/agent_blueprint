# 계획: 구조 설계 흐름 화면 (SPEC-structure-ui.md)

승인 전에는 구현하지 않는다. 단계 A0 → A → B 순서이며 **A와 B는 각각 끝난 뒤 사용자 확인을 받고 다음으로 간다**. 커밋은 동작 확인 후 기능 단위(`feat:`, 문서는 `docs:`).

## 의존 관계
순서: **A0 → A → S → B**. 각 단계가 끝날 때마다 vitest·tsc·eslint·build 결과를 보고하고, 작업 단위로 커밋한 뒤 사용자 확인을 받는다. 실제 OpenAI 호출은 하지 않는다(mock만).
```
A0 (GET 404) ▶ [확인]
A: A1 목록 ─ A2 생성 폼 ─ A3 PATCH 이름 수정 API ─ A4 작업공간 틀·설정 탭 ▶ [확인]
S: S0 Vercel 스트리밍 문서 확인 ─ S1 lib/ai 콜백 ─ S2 핸들러 스트림 ─ S3 test:draft ─ S4 문서 ▶ [확인]
B: B1 buildTree ─ B2 dagre ─ B3 TreeView ┐
   B4 fit-size ─ B5 resize ─ B6 draft-stream ┤─ B7 store ─ B8 입력 UI ─ B9 진행·오류 UI ─ B10 조립 ▶ [확인 + 사용자 1회 실호출]
```

## 위험과 대응
| 위험 | 대응 |
| --- | --- |
| `cacheComponents`에서 `params`·세션을 Suspense 밖에서 읽으면 빌드 오류 | 구현 전 `node_modules/next/dist/docs`의 해당 문서 확인, `/account` 패턴 재사용, 매 단계 `npm run build` |
| React Flow가 SSR에서 깨짐 | 트리 컴포넌트만 `"use client"`, 필요 시 동적 import. 부모 컨테이너에 높이 명시(`h-` 유틸리티) |
| dagre 타입·ESM 호환 | `@types/dagre` 설치됨. vitest에서 변환 함수 테스트로 조기 확인 |
| 캔버스 축소 결과가 4MB 초과/EXIF 회전 | 품질·폭 단계 축소 루프 + 끝내 실패 시 오류 안내. `createImageBitmap(file, { imageOrientation: "from-image" })` 사용 |
| 실제 OpenAI 호출 비용·시간 | 자동 테스트는 mock만. 실호출 확인은 사용자 직접 실행 |
| 스트리밍과 `maxDuration`·플랫폼 버퍼링 | S0에서 공식 문서 확인, 응답 헤더·개행 flush 방식 확인 |

## 작업 목록

### A0. API 404 통일
- [ ] **A0-1** `blueprint-handler` GET에 `getProject` 선확인(없으면 404). Files: `lib/api/blueprint-handler.ts`, `.test.ts`
  - Acceptance: 없는·남의 id → 404 `not_found`, 내 프로젝트·판 없음 → 200 `{ blueprint: null }`, 잘못된 revision → 400 유지
  - Verify: `npx vitest run lib/api`
- [ ] **A0-2** `revisions-handler` GET 동일. Files: `lib/api/revisions-handler.ts`, `.test.ts`
  - Verify: 위와 동일
- [ ] **A0-3** 문서 갱신: `docs/projects-api.md`(엔드포인트 표·블록 3), `SPEC-projects-api.md`, CLAUDE.md API 표. Verify: 문서 내 "판이 없으면" 표기와 404 설명이 일치
- 체크포인트: vitest·tsc·eslint 통과 → 커밋 `feat:`(코드)와 `docs:` 분리

### 단계 A
- [ ] **A1** `/projects` 목록: `app/projects/page.tsx`(라우팅+Suspense), `components/projects/ProjectList.tsx`, 헤더. 커밋 `feat:`
  - Verify: 로컬 확인, `tsc`·`build`
- [ ] **A2** 생성 폼 `NewProjectForm.tsx`(스택 3가지 자유 선택, `POST /api/projects`, 이동). 커밋 `feat:`
- [ ] **A3** `PATCH /api/projects/[id]`: `renameProject`(`lib/db/projects.ts`, `createProject`와 이름 검증 공유), `lib/api/project-handler.ts`, `app/api/projects/[id]/route.ts` + 테스트. 커밋 `feat:`
  - Acceptance: 이름만 허용(다른 필드 400), trim 후 1~100자, 빈 이름 거부, 남의·없는 프로젝트 404, 비로그인 401
  - Verify: `npx vitest run lib/db lib/api`
- [ ] **A4** 작업공간 `app/projects/[id]/page.tsx` + `WorkspaceTabs` + `ProjectSettingsTab`(이름 수정, 스택 읽기 전용+안내). 커밋 `feat:`
  - Acceptance: 404(남의·없는·uuid 아님), 탭 4개(디자인 시스템·지시서 비활성)
- **[A 확인]** 4개 명령 결과 보고.

### 단계 S (스트리밍)
- [ ] **S0** Vercel 공식 문서로 스트리밍 응답과 함수 실행 시간 한도(`maxDuration`) 관계 확인 → 사용자에게 보고(필요하면 `maxDuration` 조정 제안).
- [ ] **S1** `lib/ai/draft-blueprint.ts`에 `onProgress` 콜백(accepted 제외: generating·validating·normalizing·regenerating) + 테스트. 동작은 콜백 없이 기존과 동일해야 함.
- [ ] **S2** `lib/ai/draft-handler.ts`: 사전 오류는 상태 코드, 이후 NDJSON 스트림(stage/done/error, 저장 단계, 저장 실패 시 blueprint 포함) + `route.ts` 응답 헤더. 기존 테스트 수정 + 단계 순서·오류 알림 테스트 추가.
- [ ] **S3** `scripts/test-draft.ts`가 같은 콜백으로 단계 출력(실행은 사용자).
- [ ] **S4** CLAUDE.md `/api/draft` 행, `SPEC-draft-route.md`, `docs/projects-api.md` 갱신. 커밋은 S1~S2 `feat:`, S3 `chore:`, S4 `docs:`로 분리.
- **[S 확인]**

### 단계 B
- [ ] **B1** `core/schema/tree.ts` `buildTree()` + 테스트(order 순, 루트 1개, 연결 안 된 노드 처리). Verify: `vitest`
- [ ] **B2** dagre 좌표 계산 `components/structure/toFlow.ts` + 테스트(노드·엣지 수, 부모가 자식보다 위). Verify: `vitest`
- [ ] **B3** `TreeView.tsx`·`TreeNodeCard.tsx`(React Flow 읽기 전용). 클라이언트 전용으로만 불러온다(`next/dynamic`, SSR 끔을 `"use client"` 래퍼에서). Verify: `build`, 로컬에서 `fixtures`/sample 설계도로 확인
- [ ] **B4** `core/image/fit-size.ts` + 테스트(1,200 초과 축소·이하 유지, 합계 4MB 판정, 품질 단계). Verify: `vitest`
- [ ] **B5** `lib/client/resize-images.ts`(캔버스, 5MB 선검사, 4MB 루프). Verify: 수동(큰 이미지 3장 합계 확인)
- [ ] **B6** `lib/client/draft-request.ts`(FormData·imageMeta) + `draft-stream.ts`(NDJSON 줄 파싱, 잘린 줄 이어 붙이기, JSON/스트림 구분, 타임아웃 해석) + 테스트. Verify: `vitest`
- [ ] **B7** `store/structure-store.ts`(spec, route, images, status, error, blueprint, normalized). Verify: `tsc`
- [ ] **B8** `SpecForm.tsx`("화면 주소 (선택)" + 안내 문구, 버튼 활성 조건, 재생성 시 "새 판으로 추가되며 기존 초안은 보존됩니다" 한 줄)·`ImagePicker.tsx`(이미지만 안내). Files ≤3
- [ ] **B9** `DraftProgress.tsx`·`DraftError.tsx`·`NormalizedList.tsx`. Files ≤3
- [ ] **B10** `StructurePanel.tsx` 조립 + 작업공간 연결(서버가 읽은 최신 판 초기값). Files ≤3
  - Acceptance: 스펙 성공 기준 3~6
  - Verify: 수동 체크리스트 + `vitest`·`tsc`·`eslint`·`build`
- [ ] **B11** CLAUDE.md 폴더 구조·`docs/` 갱신, 개발 일지는 마무리 때 요청 시.
- **[B 확인]**: 결과 보고, 브라우저에서 초안 생성 1회는 사용자가 실행.

## 제외 확인
노드 편집·드래그, 검사 규칙, 디자인 시스템, 지시서, 판 목록 화면, 자동 재저장, 스택 수정·프로젝트 삭제, 노드 부분 스트리밍은 하지 않는다.

# 계획: 구조 설계 흐름 화면 (SPEC-structure-ui.md)

승인 전에는 구현하지 않는다. 단계 A0 → A(완료) → P → D → S → B 순서이며 **각 단계는 끝난 뒤 사용자 확인을 받고 다음으로 간다**. 커밋은 동작 확인 후 기능 단위(`feat:`, 문서는 `docs:`).

## 의존 관계
순서: **A0 → A → P → D → S → B**(A0·A는 완료·사용자 확인 끝). 각 단계가 끝날 때마다 vitest·tsc·eslint·build 결과를 보고하고, 작업 단위로 커밋한 뒤 사용자 확인을 받는다. 실제 OpenAI 호출은 하지 않는다(mock만).
```
A0 (GET 404) ▶ [확인]
A: A1 목록 ─ A2 생성 폼 ─ A3 PATCH 이름 수정 API ─ A4 작업공간 틀·설정 탭 ▶ [확인 완료]
P: P1 이동 규칙 ─ P2 홈 ─ P3 /login 이동·정리 ─ P4 헤더(이름·사진) ─ P5 로그아웃 공용화 ▶ [확인]
D: D0 호환·라이선스·토큰 대조 보고 ─ D1 토큰·globals.css ─ D2 shadcn 부품 ─ D3 기존 화면 토큰 교체 ─ D4 헤더 메뉴 ─ D5 THIRD_PARTY_NOTICES ▶ [확인]
S: S0 Vercel 스트리밍 문서 확인 ─ S1 lib/ai 콜백 ─ S2 핸들러 스트림 ─ S3 test:draft ─ S4 문서 ▶ [확인]
B: B1 buildTree ─ B2 dagre ─ B3 TreeView(단순) ┐
   BP1 preview 계산 ─ BP2 미리보기 UI ─ BP3 정보 패널 ┤
   B4 fit-size ─ B5 resize ─ B6 draft-stream ┤─ B7 store ─ B8 입력 UI ─ B9 진행·오류 UI ─ B10 조립(3열) ▶ [확인 + 사용자 1회 실호출]
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
| shadcn/ui가 Next 16.4.3·React 19.3·Tailwind 4.3과 안 맞음, 의존성 충돌 | D0에서 공식 문서로 확인·보고 후 설치. 설치가 만드는 `components.json`·`lib/utils.ts`·의존성 목록을 보고 |
| 토큰 값이 몽타주 저장소와 다름·라이선스 | D0에서 `packages/theme` 대조표 + MIT 고지 의무(저작권·라이선스 문구 보존) 보고. 로고·이름·플러그인 사용 안 함 |
| `decideRedirect` 변경으로 이동 루프(`/`↔`/projects`, `/login`↔`/`) | 순수 함수 테스트로 모든 조합 고정(로그인 여부 × `/`·`/login`·보호 경로 × `next`) |
| `globals.css` 변경이 기존 화면을 깨뜨림(다크 블록 제거, 폰트) | D3에서 화면 3개 직접 확인, build |
| 미리보기 반응형·gap 값 해석이 스키마와 어긋남 | BP1 시작 때 `data-model.md`를 읽고 변환표를 정해 보고, 샘플(`sample-blueprint.json`)·fixtures로 테스트 |

## 작업 목록

### A0. API 404 통일
- [x] **A0-1** `blueprint-handler` GET에 `getProject` 선확인(없으면 404). Files: `lib/api/blueprint-handler.ts`, `.test.ts`
  - Acceptance: 없는·남의 id → 404 `not_found`, 내 프로젝트·판 없음 → 200 `{ blueprint: null }`, 잘못된 revision → 400 유지
  - Verify: `npx vitest run lib/api`
- [x] **A0-2** `revisions-handler` GET 동일. Files: `lib/api/revisions-handler.ts`, `.test.ts`
  - Verify: 위와 동일
- [x] **A0-3** 문서 갱신: `docs/projects-api.md`(엔드포인트 표·블록 3), `SPEC-projects-api.md`, CLAUDE.md API 표. Verify: 문서 내 "판이 없으면" 표기와 404 설명이 일치
- 체크포인트: vitest·tsc·eslint 통과 → 커밋 `feat:`(코드)와 `docs:` 분리

### 단계 A
- [x] **A1** `/projects` 목록: `app/projects/page.tsx`(라우팅+Suspense), `components/projects/ProjectList.tsx`, 헤더. 커밋 `feat:`
  - Verify: 로컬 확인, `tsc`·`build`
- [x] **A2** 생성 폼 `NewProjectForm.tsx`(스택 3가지 자유 선택, `POST /api/projects`, 이동). 커밋 `feat:`
- [x] **A3** `PATCH /api/projects/[id]`: `renameProject`(`lib/db/projects.ts`, `createProject`와 이름 검증 공유), `lib/api/project-handler.ts`, `app/api/projects/[id]/route.ts` + 테스트. 커밋 `feat:`
  - Acceptance: 이름만 허용(다른 필드 400), trim 후 1~100자, 빈 이름 거부, 남의·없는 프로젝트 404, 비로그인 401
  - Verify: `npx vitest run lib/db lib/api`
- [x] **A4** 작업공간 `app/projects/[id]/page.tsx` + `WorkspaceTabs` + `ProjectSettingsTab`(이름 수정, 스택 읽기 전용+안내). 커밋 `feat:`
  - Acceptance: 404(남의·없는·uuid 아님), 탭 4개(디자인 시스템·지시서 비활성)
- **[A 확인]** 4개 명령 결과 보고.

### 단계 P (진입점·헤더)
- [x] **P1** `core/auth/redirect.ts` `decideRedirect` 수정: `/login`→`/`+쿼리 유지, 로그인 상태 `/`→`safeNextPath(next)`(기본 `/projects`), 비로그인 보호 경로→`/?next=…`. 테스트 추가·기존 수정. Files ≤2. Verify: `npx vitest run core/auth`
- [x] **P2** 홈 `app/page.tsx`(라우팅+Suspense) + `components/home/`(소개, 로그인 버튼 영역, `error=auth` 문구). `LoginButton` 문구 "GitHub로 시작하기", `next` 유지. Verify: `tsc`, `build`, 비로그인 화면 직접 확인
- [x] **P3** `app/login/page.tsx`를 `/`로 보내는 안전망으로 교체, `LoginPanel` 삭제, 로그아웃 후 이동 목적지 `/login`→`/`, `docs/auth-login.md`·`CLAUDE.md`(proxy 설명, 폴더 구조) 갱신. 커밋 `feat:`+`docs:`
- [x] **P4** `components/layout/AppHeader.tsx`(로고·계정 영역, 작업공간 경로 안내는 `Workspace`: 이름+사진/첫 글자, 클릭 메뉴는 D4), 목록·작업공간·계정에 적용, 기존 `components/projects/AppHeader` 삭제. Files ≤3
- [x] **P5** `LogoutButton`을 단일 처리로 정리(헤더·`/account` 공용, D4에서 메뉴 항목으로 재사용 가능하게 children/className 받기). Verify: 로그아웃 직접 확인
- 체크포인트: vitest·tsc·eslint·build 보고 → 커밋 → **[P 확인]**

### 단계 D (디자인 기준값·공통 부품)
- [x] **D0** 사전 확인·보고(코드 변경 없음): ① montage-web `packages/theme` 토큰과 요청 값 대조표(차이가 있으면 질문) ② MIT 고지 방법 ③ shadcn/ui와 Next 16.4.3·React 19.3·Tailwind 4.3 호환, 설치될 의존성 목록 ④ Pretendard 불러오기 방식(라이선스·파일). **보고 후 진행 확인**
- [x] **D1** `app/globals.css` 토큰 CSS 변수(라이트만, 다크 추가용 구조, 다크 미디어쿼리 블록 제거) + `@theme inline` 연결 + 폰트. Verify: `build`
- [x] **D2** shadcn/ui 초기화(`components.json`)·부품 10종(`components/ui/`): 버튼, 입력, 여러 줄 입력, 선택, 카드, 탭, 배지, 드롭다운 메뉴, 대화상자, 알림. 커밋 `chore:`(설치)와 `feat:`(토큰 연결) 분리
- [x] **D3** 기존 화면의 `slate`·`indigo` 클래스를 토큰·부품으로 교체(동작 불변). 색상값 직접 사용 검색으로 확인. Files가 많으면 화면별로 나눠 커밋
- [x] **D4** 헤더 계정 메뉴(프로필 → 계정 설정·로그아웃, `LogoutButton` 재사용)
- [x] **D5** 저장소 루트 `THIRD_PARTY_NOTICES.md`: 몽타주 토큰 출처(저장소·경로·확인 날짜)와 MIT 전문(Copyright 2026 Wanted Lab, Inc.), Pretendard 등 서드파티 고지. 커밋 `docs:`
- 체크포인트: vitest·tsc·eslint·build + D0 대조·라이선스 결과 → **[D 확인]**
- 디자인 시스템 스펙 JSON은 D에서 만들지 않는다(디자인 값의 정본은 CSS 변수). **기능 B 시작 시** `DesignSystemSpecSchema`를 `data-model.md` 기준(color·spacing·radius·font·layout 단수형 그룹)으로 맞춘 뒤(별도 커밋), 이 값으로 예시 JSON을 생성한다.

### 단계 S (스트리밍)
- [x] **S0** Vercel 공식 문서로 스트리밍 응답과 함수 실행 시간 한도(`maxDuration`) 관계 확인 → 사용자에게 보고(필요하면 `maxDuration` 조정 제안).
- [x] **S1** `lib/ai/draft-blueprint.ts`에 `onProgress` 콜백(accepted 제외: generating·validating·normalizing·regenerating) + 테스트. 동작은 콜백 없이 기존과 동일해야 함.
- [x] **S2** `lib/ai/draft-handler.ts`: 사전 오류는 상태 코드, 이후 NDJSON 스트림(stage/done/error, 저장 단계, 저장 실패 시 blueprint 포함, **10초 하트비트 `ping`**) + `route.ts` 응답 헤더. 기존 테스트 수정 + 단계 순서·오류 알림·**하트비트 간격과 종료 시 타이머 정리** 테스트 추가. 로컬 `next start`에서 줄이 도착 시점에 나뉘어 오는지 curl로 확인하고, 묶이면 압축 방지 헤더(`no-transform` 등) 추가.
- [x] **S3** `scripts/test-draft.ts`가 같은 콜백으로 단계 출력(실행은 사용자).
- [x] **S4** CLAUDE.md `/api/draft` 행, `SPEC-draft-route.md`, `docs/projects-api.md` 갱신. 커밋은 S1~S2 `feat:`, S3 `chore:`, S4 `docs:`로 분리.
- **[S 확인]**

### 단계 B
- [x] **B1** `core/schema/tree.ts` `buildTree()` + 테스트(order 순, 루트 1개, 연결 안 된 노드 처리). Verify: `vitest`
- [x] **B2** dagre 좌표 계산 `components/structure/toFlow.ts` + 테스트(노드·엣지 수, 부모가 자식보다 위). Verify: `vitest`
- [x] **B3** `TreeView.tsx`·`TreeNodeCard.tsx`(React Flow 읽기 전용, **카드는 이름·kind 배지 정도로 단순**, 클릭하면 선택). 클라이언트 전용으로만 불러온다(`next/dynamic`, SSR 끔을 `"use client"` 래퍼에서). Verify: `build`, 로컬에서 `fixtures`/sample 설계도로 확인
- [x] **BP1** `core/preview/`: 평면 `nodes` → 배치 상자 트리(부모 `layout`의 grid·flex·방향·열 수·gap, 자식 `placement`, `order`), 데스크톱/모바일 반응형 적용, 그려지지 않는 노드 분리 + 테스트. 변환 규칙은 `SPEC-structure-ui.md`의 "미리보기 변환표"(`data-model.md` 기준, 사용자 확인 대기). Files ≤3. Verify: `vitest`
- [x] **BP2** `components/structure/PreviewCanvas.tsx`(상자·배치 표시, 클릭 선택, 데스크톱·모바일 전환, "그려지지 않는 노드" 목록). Verify: `build`, `sample-blueprint.json`으로 직접 확인
- [x] **BP3** `NodeInfoPanel.tsx`(보기만) + `selectedNodeId`(B7 스토어와 연결)
- [x] **B4** `core/image/fit-size.ts` + 테스트(1,200 초과 축소·이하 유지, 합계 4MB 판정, 품질 단계). Verify: `vitest`
- [x] **B5** `lib/client/resize-images.ts`(캔버스, 5MB 선검사, 4MB 루프). Verify: 수동(큰 이미지 3장 합계 확인)
- [x] **B6** `lib/client/draft-request.ts`(FormData·imageMeta) + `draft-stream.ts`(NDJSON 줄 파싱, 잘린 줄 이어 붙이기, JSON/스트림 구분, 타임아웃 해석, **`ping` 무시, 마지막 줄 후 30초 무수신 시 "연결이 끊겼습니다", `done`·`error` 없이 끝난 스트림을 오류로 처리**) + 테스트(가짜 타이머). Verify: `vitest`
- [x] **B7** `store/structure-store.ts`(spec, route, images, status, error, blueprint, normalized, selectedNodeId, previewViewport). Verify: `tsc`
- [x] **B8** `SpecForm.tsx`("화면 주소 (선택)" + 안내 문구, 버튼 활성 조건, 재생성 시 "새 판으로 추가되며 기존 초안은 보존됩니다" 한 줄)·`ImagePicker.tsx`(이미지만 안내). Files ≤3
- [x] **B9** `DraftProgress.tsx`·`DraftError.tsx`·`NormalizedList.tsx`. Files ≤3
- [x] **B10** `StructurePanel.tsx` 조립: 3열(왼쪽 입력·초안 후 접기, 가운데 미리보기(기본)/트리 전환, 오른쪽 정보 패널)+아래 검사 결과 자리, 작업공간 연결(서버가 읽은 최신 판 초기값). Files ≤3
  - Acceptance: 스펙 성공 기준 3~6(미리보기·3열 포함)
  - Verify: 수동 체크리스트 + `vitest`·`tsc`·`eslint`·`build`
- [x] **B11** CLAUDE.md 폴더 구조·`docs/` 갱신, 개발 일지는 마무리 때 요청 시.
- **[B 확인]**: 결과 보고, 브라우저에서 초안 생성 1회는 사용자가 실행.

## 배포 체크리스트 (첫 Vercel 배포 때)
- [ ] 스트리밍 응답이 줄 단위로 도착하는지 확인(`curl -N`으로 `/api/draft` 호출 또는 브라우저 네트워크 탭): 단계 알림과 `ping`이 모아서 한꺼번에 오지 않고 도착 시점에 나뉘어 오는지. 묶여 오면 응답 헤더·압축 설정 조정.
- [ ] 하트비트가 AI 응답 대기 중(15~30초)에도 10초 간격으로 도착하는지.
- [ ] 배포 환경: **Vercel Hobby(무료) + Fluid compute**(사용자 확인). `maxDuration = 70`은 문서 기준 Hobby 한도(300초) 안이다. Hobby는 **개인·비상업 용도 전용**이며, 한도를 넘으면 요금이 청구되는 것이 아니라 **사용이 중지**된다.
- [ ] **발표 전날** 대시보드에서 함수 호출 수·메모리 사용량을 확인한다(한도에 가까우면 호출을 줄이거나 발표 전까지 시연 횟수 조정).
- [ ] 로그 보관 기간이 짧으므로, **배포 직후 스트리밍 확인 때 함수 로그를 바로 확인**한다(`draft` 로그 한 줄: 시도 횟수·소요 시간·비용·오류 종류 포함 여부).
- [ ] 실제 OpenAI 호출 1회(사용자 직접)로 `done`까지 도착하고 새 판이 저장되는지.

## 디자인 다듬기 목록 (나중에, 지금은 고치지 않음)
- 모바일 작업공간 탭 넘침 표시(가로 스크롤은 동작하지만 넘친다는 표시가 없음)
- 작업공간 본문은 `max-w-7xl`인데 헤더는 `max-w-5xl`이라 폭이 어긋남
- **선택 상자 통일(2026-10-30 추가)**: `components/projects/NewProjectForm.tsx`의 브라우저 기본 `select` 3개(프레임워크·스타일 방식·디렉토리 구조)를 shadcn/ui `Select`로 교체한다. 이때 목록은 선택된 항목 위치에 맞추지 말고 **항상 선택 상자 아래에 열리게** 한다: `components/ui/select.tsx`의 `SelectContent` 기본값이 `position="item-aligned"`(선택 항목을 상자 위에 겹쳐 연다)이므로 `position="popper"`(+ `side="bottom"`)로 바꾸거나 기본값을 바꾼다. 같은 부품을 쓰는 노드 편집 패널의 선택 상자(`components/structure/edit/controls.tsx`)도 지금은 `item-aligned`라 함께 바뀐다. 지금은 고치지 않는다.

## 메모 (이후 단계에서 처리)
- **지시서 생성 단계**: 설계도의 기본 layout은 데스크톱 기준이고 responsive는 태블릿·모바일에서 바뀌는 값이다. 지시서에서 Tailwind 스택이면 이를 **모바일 우선(`min-width`) 클래스**로 변환해야 한다(예: 기본 `grid-cols-2` + mobile `columns: 1` → `grid-cols-1 md:grid-cols-2`). CSS·CSS Modules 스택은 `max-width` 미디어 쿼리(데스크톱 우선) 그대로 써도 된다.
- **AI 초안 프롬프트 v3**: 반응형 기준 한 줄 추가(2026-10-30). 실제 호출로 품질을 다시 측정하지는 않았다(`tasks/draft-test-result.md`는 v2 기준).

## 제외 확인
노드 편집·드래그, 검사 규칙과 결과 표시(자리만), 디자인 시스템 정리(기능 B), 지시서, 다크 모드, 이메일 가입, 판 목록 화면, 자동 재저장, 스택 수정·프로젝트 삭제, 노드 부분 스트리밍은 하지 않는다.

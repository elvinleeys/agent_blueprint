# AgentBlueprint

AI 에이전트가 코드를 쓰기 전에 프론트엔드 구조를 설계·검사하고, 그 설계를 에이전트 지시서(프롬프트)로 바꿔주는 웹 도구.

- 기능 A. 구조 설계: 스펙 7개 항목 또는 이미지로 컴포넌트 트리 초안 생성 → 트리 시각화·편집 → 구조 검사
- 기능 B. 디자인 시스템 정리: 디자인 시스템 스펙과 현재 컴포넌트 코드를 비교해 합치기·분리 제안
- 공통 출구: 확정된 설계도/정리 계획을 AI 에이전트용 지시서(프롬프트, CLAUDE.md)로 내보냄

## 기술 스택

- 프론트엔드: Next.js (App Router), TypeScript, Tailwind CSS
- 트리 시각화: React Flow (@xyflow/react) + dagre
- 상태 관리: Zustand
- 스키마 검증: Zod
- 인증: Supabase Auth + GitHub OAuth
- DB: Supabase (PostgreSQL), RLS로 사용자별 데이터 격리
- AI: OpenAI API (Responses API, 이미지+텍스트 입력)
- 코드 분석: TypeScript Compiler API 또는 Babel 파서, PostCSS
- 배포: Vercel

## 명령어

```bash
npm run dev      # 개발 서버
npm run build    # 빌드
npm run lint     # 린트
npm test         # 단위 테스트 (vitest run)
```

## 폴더 구조와 책임

```
(프로젝트 루트)/
components.json            # shadcn/ui 설정
vitest.config.mts          # 테스트 설정 (tsconfig의 "@/" 경로 별칭만. 컴포넌트 렌더링 스모크 테스트가 쓴다)
THIRD_PARTY_NOTICES.md     # 서드파티(몽타주 토큰·Pretendard·shadcn/ui) 출처와 라이선스 고지
proxy.ts                   # 세션 갱신, 비로그인 사용자의 /projects·/account 접근을 /?next=로 이동, /login은 /로 이동, 로그인 상태의 /는 next 또는 /projects로 이동
app/                       # 라우팅만. 로직을 두지 않는다 (globals.css가 디자인 기준값 CSS 변수의 정본, fonts/ 글꼴 파일)
  page.tsx                 # S-01 홈 (서비스 소개 + GitHub로 시작하기)
  projects/page.tsx        # S-02 목록
  projects/[id]/           # 작업공간 (설정·구조 설계·디자인 시스템·지시서)
  api/draft/route.ts       # AI 초안 생성 (NDJSON 스트림 응답)
  api/explain/route.ts     # 위반 설명·정리 제안
  api/analyze/route.ts     # 디자인 시스템 정리: 올린 코드 분석·비교 (코드 원본 저장 안 함)
  api/projects/            # 프로젝트 목록·생성, [id](이름 변경·삭제), [id]/blueprint(불러오기·자동 저장), [id]/revisions(판 목록·새 판 추가), [id]/exports(지시서 내보내기)
  auth/callback/route.ts   # GitHub 로그인 콜백
  login/page.tsx           # 쿼리를 유지해 홈(/)으로 보내는 주소 (로그인은 홈이 맡음)
  account/page.tsx         # S-09 계정
core/                      # 순수 TypeScript. React·Next.js import 금지
  auth/                    # 로그인 후 이동 경로 검증(safeNextPath), 보호 경로 판단(decideRedirect)
  schema/                  # 설계도·DS 스펙 Zod 스키마, tree.ts(평면→트리 변환), normalize-blueprint.ts(AI 응답 자동 보정)
  image/                   # 이미지 전송 전 축소 규칙(fit-size: 가로 1,200px·합계 4MB·품질 단계, 고를 때 검사)
  preview/                 # 구조 미리보기 계산(설계도 layout·placement·order·반응형 → 상자 트리, 훅 분리)
  rules/                   # 구조 검사. types(Violation: 규칙 id·심각도·노드 id 목록·메시지), run(checkBlueprint: 공통 규칙+스택 어댑터 규칙을 돌려 오류→경고→정보 순으로 정렬, countByNode), helpers, fixture(테스트용 설계도 만들기)
  rules/common/            # 공통 검사 규칙 R-01~R-08 (simple: R-01·04·06·07·08, relations: R-02·03·05). 기준이 모호한 규칙의 상수(범용 상태 이름, R-05 임계값)는 relations.ts 위쪽
  adapters/framework/      # next(NX-01~05). html·react는 전용 검사 규칙이 없음. prompt.ts: 지시서용 스택 문장(렌더링 방식, 라우팅, 화면 주소 변환)
  adapters/styling/        # css(HC-01), css-modules(CM-01), tailwind(TW-01·02). prompt.ts: 스타일 문장·Tailwind 토큰 대응표·반응형 변환
  adapters/architecture/   # fsd(AR-01~03). type-based·feature-based는 전용 검사 규칙이 없음. prompt.ts: 파일 위치·구현 순서·paths 머리말
  prompt/                  # 지시서 생성기(export-prompt: 분기, export-common: 공통·파일 이름, rule-file: 화면 규칙 파일, task-prompt: 지시서. 템플릿만 쓰고 AI를 부르지 않아 같은 입력이면 같은 출력), AI 초안 프롬프트(draft-prompt, repair-prompt), strict 스키마 변환
  similarity/              # 이름 유사도 공용 부분(구조 검사 R-05·정리 C-02·구현 검사가 함께 씀): thresholds(기준값 0.5 한 곳), name-similarity(단어 쪼개기·Jaccard, 정리 쪽 구현을 그대로 옮긴 것). 구조 검사 R-05는 자기 쪽 계산을 그대로 쓴다
  impl-check/              # 구현 검사(코드가 설계도대로 구현됐는지): match(설계 노드 ↔ 코드 짝짓기: 확실·후보·같은 이름 여러 곳·읽지 못한 코드), types, similarity(후보 점수). 규칙(IC-xx)은 이 폴더에 이어서 추가
  code-model/              # 코드 분석기(cleanup에서 분리, 순수 함수): parse(.tsx에서 컴포넌트·props 추출), filter-files(업로드 거르기·상한), types(SourceFile 등), imports(상대·`@/` import 해석), facts(구현 검사용 사실: use client·상태·훅 호출·import·렌더링 관계·이벤트 props·서버 통신(READ·WRITE·UNKNOWN)·className·style·화면 주소·읽지 못한 코드와 그 영향 범위, `readCodeModel(files, options)`의 기능별 설정은 options), tsconfig(올린 tsconfig·jsconfig의 paths·extends 읽기), path-utils, class-names(className 읽기: always·conditional·dynamic), fetch-calls·fetch-kind(서버 통신으로 보는 호출 목록과 유형 분류표, 여기만 고침), routes·route-react-router·route-next-app(화면 주소를 `/products/:id` 형식으로: 라우터별 해석기). cleanup/extract.ts·filter-files.ts는 여기를 다시 내보내는 얇은 파일
  cleanup/                 # 디자인 시스템 정리(기능 B, 순수 함수. 입력은 {path, content}[]라 업로드·GitHub 등 입력 방식과 무관). extract(.tsx에서 컴포넌트·props·variant·상속한 HTML 요소/컴포넌트·내보냄 여부, typescript 파서만 사용, 올린 파일 사이의 상대 경로 import 타입 따라가기·문법 오류 파일 표시), infer-spec(스펙 JSON 검증, 디자인 시스템 파일에서 공식 목록 만들기), compare(C-01·C-02·C-03·C-05, 기준값은 위쪽 COMPARE_CONFIG 한 곳), analyze(전체 파이프라인), filter-files·upload-summary·picked-files(업로드 거르기·상한·목록 합치기). prompt/cleanup-prompt가 정리 지시서를 만든다
  edit/                    # 노드 편집 연산(순수 함수: 성공 시 새 설계도, 실패 시 거부 이유·노드·경로). update-node(내용·배치·차지 칸·스타일, 값 검증은 스키마로), layout(display 전환·반응형 한 줄·영향 계산·빈 스타일), move-node(+부모 후보), reorder-node, add-child, delete-node, notice(자동 변경 안내 문구). 드래그 편집도 같은 연산을 쓴다
components/                # 화면 컴포넌트 (ui/ shadcn/ui 공통 부품, home/ 홈 랜딩(로그인 전 화면, 로그인·DB·AI 없이 정적 예시만: HomeIntro 첫 화면, HomeSections 5단계 흐름·결과 예시·정리 소개·마무리, LandingExamples가 PreviewCanvas·CheckResults를 readOnly로 재사용, landing-blueprint 랜딩 전용 예시 설계도로 경고 R-03·R-06 두 건이 나오게 만듦. 상자가 나타나는 애니메이션은 globals.css의 `[data-reveal]`(CSS만, 움직임 줄이기면 멈춤). 로그인 상태의 이동은 proxy가 맡음), layout/ 공통 헤더(화면 전체 폭에 양옆 여백만 고정: 로고 왼쪽 끝·계정 오른쪽 끝)·GuardedLink(저장 안 된 수정이 있으면 이동 전에 묻는 링크), auth/ 로그인·로그아웃·계정, projects/ 목록·생성 폼(HTML 선택지는 숨김. 이미 만든 HTML 프로젝트는 그대로 열리고 API도 받음), workspace/ 작업공간 탭·설정(이름 수정은 보기→수정→완료·취소, 수정 중에만 입력칸 활성·자동 포커스·Enter 완료·Esc 취소, 바뀌지 않았거나 비면 완료 비활성)·프로젝트 삭제 확인 창(스토어와 저장 큐를 탭 바깥에서 들고 있음. 큰 화면에서는 작업공간이 화면 높이에 맞고 영역 안에서 스크롤, 작은 화면은 세로로 쌓이고 페이지가 스크롤), prompt/ 지시서 탭(PromptPanel: 화면 주소·내보내기·오류 확인 창·화면 규칙 파일/지시서 탭 전환, ExportDocumentCard: 복사·내려받기는 제목 줄 오른쪽, 미리보기는 높이 제한·안쪽 스크롤, export-notes: 고정 안내 문구), structure/ 구조 설계 탭: 스펙 입력(설계도가 있으면 접힌 채 시작, 7개 항목은 화면 개요만 펼침)·진행·오류·미리보기·트리, CheckDock(화면 아래에 붙은 접이식 검사 결과, 접혀도 "오류 N · 경고 N"이 보임), NodeEditPanel(노드 편집 패널), edit/(구역·입력칸·목록·확인 창: 연산을 부르고 결과만 반영), auto-save·SaveQueueProvider·SaveStatus(자동 저장), generate(초안 생성 흐름: 시작→저장 정리→생성), regenerate-confirm(다시 생성 확인 조건), ViolationsProvider(설계도가 바뀔 때만 검사를 계산해 context로 제공, 결과는 저장하지 않음)·CheckResults(검사 결과 카드)·violation-mark(오류 빨강·경고 주황 실선, AI 가정은 회색 점선)), design-system/ 디자인 시스템 정리 탭: DesignSystemPanel(두 칸: 디자인 시스템=폴더 업로드 또는 JSON, 검사할 코드=폴더 업로드 또는 파일 선택, 결과는 저장하지 않음)·FileListSection(선택할 때마다 추가·파일별 삭제·모두 지우기·이번 분석에서만 빼는 체크)·ResultSection(경고가 위, 정보, 접힌 "공식 목록에 없음")·CleanupExportCard(정리 지시서 복사·내려받기))
store/                     # Zustand 스토어 (structure-store: 작업공간별 설계도·스펙 입력·초안 진행·선택·보기 상태, applyEdit(편집 적용)·editRevision·저장 상태·입력 오류·노드 선택 확인)
lib/utils.ts              # cn 클래스 병합(shadcn)
lib/supabase/              # Supabase 클라이언트 (client.ts, server.ts 분리), proxy.ts(세션 갱신)
lib/auth/                  # 서버 전용 인증 처리 (callback-handler: /auth/callback 처리)
lib/client/                # 브라우저 전용 (resize-images: 캔버스 축소, draft-request: 요청 구성, draft-stream: NDJSON 읽기·끊김 감지, run-draft: 초안 생성 한 번의 흐름, save-queue: 자동 저장 큐(800ms 디바운스·한 번에 하나·settle), save-blueprint: 설계도 저장 PUT과 사용자용 오류 문구, leave-guard: 저장 안 된 수정이 있을 때 떠나기 전 경고, run-export: 지시서 내보내기 흐름(저장 큐 drain 성공 뒤에만 요청), copy-text: 클립보드 복사 대체 방식·.md 내려받기, delete-project: 프로젝트 삭제 요청·이름 재입력 확인, run-analyze: 디자인 시스템 정리 분석 요청과 오류 문구)
lib/db/                    # DB 접근 함수 (projects(삭제 포함), blueprints, spec-inputs(화면 주소만 저장하는 saveSpecRoute 포함), prompt-exports: 클라이언트를 인자로 받고 결과를 DbResult로 반환, 저장 전·읽은 뒤 Zod 검증)
supabase/migrations/       # 표·RLS·GRANT SQL (대시보드 SQL 편집기로 직접 실행, 절차는 docs/db-migration.md)
supabase/tests/            # RLS 격리 확인 스크립트(적용 후 실행, 끝에 rollback)
lib/api/                   # API 라우트 처리 (session: getClaims 로그인 확인, http: 오류 매핑·JSON 읽기(readJson은 라우트별 본문 한도), *-handler: 라우트별 처리, analyze-handler: 본문 3MB·칸마다 30개/파일 200KB/합계 1MB)
lib/ai/                    # 서버 전용 AI 호출 (draft-blueprint: OpenAI 호출·검증·재시도·비용·단계 알림 콜백, draft-http: 요청 검증·오류 매핑, draft-stream: NDJSON 스트림·하트비트, draft-handler: /api/draft 처리)
scripts/                   # 개발용 실행 스크립트 (test-draft.ts: lib/ai를 호출하는 초안 생성 검증, 실제 API 호출은 직접 실행)
fixtures/                  # 테스트 입력 (wireframes/<화면>/spec.json·expected.md, 이미지는 커밋하지 않음. demo-cleanup/: 디자인 시스템 정리를 눈으로 확인하는 예시, 일부러 문제를 넣음, 기대 결과는 core/cleanup/demo-cleanup.test.ts)
tasks/                     # 계획·테스트 결과·응답 원문 (draft-test-result.md, draft-outputs/)
```

`core/`는 화면과 완전히 분리한다. 나중에 CLI나 VS Code 확장에서 그대로 재사용하기 위함.

## 핵심 데이터 모델

스키마의 기준 문서는 `.claude/skills/define-schema/data-model.md`다. 필드 정의·검증 조건은 그 문서를 따른다.

- 설계도 트리의 원본은 **평면 배열 + parentId**다. 저장 데이터에 `children` 중첩 필드를 두지 않는다.
- 부모가 자식을 포함하는 트리 형태는 `core/schema/tree.ts`의 `buildTree()`로 계산해 쓰는 보기이며, 저장하지 않는다.
- 형제 순서는 `order`, 노드의 식별은 `id`로 한다. 이름(`name`)은 바꿔도 `id`는 바뀌지 않는다. 이름은 설계도 내 고유.
- **배치 책임은 부모에게 있다.** 자식 배치(flex/grid, 방향, 열 수, gap 토큰)는 부모의 `layout`에, 그리드 안 자리는 자식의 `placement`에 적는다.
- 노드 자신의 모양은 `style.properties`(CSS 속성, 값, 토큰 여부)에 적는다. 배치 속성(display, gap, flex-direction 등)은 `properties`에 쓰지 않는다.
- 디렉토리 구조 방식은 `stack.architecture`(type-based / feature-based / fsd), 노드별 파일 위치는 `location.dir`에 적는다. Next.js + FSD 조합의 배치 규칙(라우팅 app/과 FSD 계층 src/ 분리, 빈 pages/)은 data-model.md 2-2절을 따른다. (이는 사용자 프로젝트 구조이며 이 저장소는 src/를 쓰지 않는다)
- 노드 이동(드래그)은 `parentId`·`order`(필요 시 `placement`)만 바꾼다. 루트 이동, 순환, 훅 아래로의 이동은 거부한다.
- 주요 엔티티: `Project`, `SpecInput`(7개 항목), `Blueprint`(nodes 평면 배열), `Violation`, `DesignSystemSpec`, `ComponentInventory`, `CleanupSuggestion`, `PromptExport`
- 설계도는 Blueprint 테이블의 jsonb 컬럼에 평면 배열 그대로 저장한다 (MVP 기준).

## 구조 검사 규칙 (설계도 기준으로 판단)

| ID | 기준 | 심각도 |
| --- | --- | --- |
| R-01 책임 과다 | 한 노드의 책임이 3개 초과 | 경고 |
| R-02 상태 중복 | 같은 상태가 2개 이상 노드에 선언 | 오류 |
| R-03 props 과다 전달 | 같은 prop이 3단계 이상 연속 전달 | 경고 |
| R-04 데이터 요청 위치 | 표시 전용 노드에 API 호출 배정 | 오류 |
| R-05 재사용 후보 | 이름·책임이 유사한 노드가 따로 존재 | 정보 |
| R-06 레이아웃 책임 | 자식이 배치 스타일(margin 등)을 소유 | 경고 |
| R-07 데이터 요청 노드 부재 | 설계도 전체에 dataFetch가 true인 노드가 하나도 없음 | 경고 |
| R-08 페이지 위치 | 루트가 아닌 노드의 kind가 page (편집 화면은 막지만 AI 초안에서 생길 수 있음) | 경고 |
| CM-01 | CSS Modules: 컴포넌트 전용 스타일이 전역 CSS에 있음 | 경고 |
| TW-01 | Tailwind: 토큰 대신 임의값 사용 | 경고 |
| TW-02 | Tailwind: 유틸리티 조합이 3회 이상 반복 | 정보 |
| HC-01 | HTML·CSS: 명명 규칙(BEM 등) 불일치 | 경고 |
| NX-01 | Next.js: 상태·이벤트 노드가 Server Component로 지정 | 오류 |
| NX-02 | Next.js: Client Component 지정 범위가 필요 이상으로 넓음 | 경고 |
| NX-03 | Next.js: 훅 노드의 부모가 Server Component로 지정 | 오류 |
| NX-04 | Next.js: 조상 중 Client Component가 있는데 자신이 Server Component로 지정 (부모-자식은 import 관계라 client 파일이 불러온 컴포넌트는 server일 수 없음) | 오류 |
| NX-05 | Next.js: FSD가 아닌 구조에서 파일 위치가 pages/ 또는 app/으로 시작 (Next.js 라우팅 폴더와 겹칠 수 있음) | 경고 |
| AR-01 | FSD: 자식이 부모보다 위 계층 (import 방향 위반) | 오류 |
| AR-02 | FSD: 같은 계층의 다른 슬라이스를 자식으로 가짐 | 오류 |
| AR-03 | FSD: kind와 계층·세그먼트 불일치 (page≠pages, hook≠model·api·lib) | 경고 |

규칙 판정은 코드(`core/rules`)로 하고, 위반 이유 설명과 수정 제안만 AI(OpenAI API)에 맡긴다.

### 디자인 시스템 정리 비교 규칙 (기능 B, `core/cleanup/compare.ts`, 설계도 검사와 별개이며 저장하지 않음)

공식 컴포넌트는 디자인 시스템 칸에 올린 파일(내보낸 컴포넌트) 또는 붙여넣은 스펙 JSON에서 얻고, 검사할 코드의 내보낸 컴포넌트와 비교한다. 파일 안에서만 쓰는 내부용 컴포넌트는 비교하지 않는다.

| ID | 기준 | 심각도 |
| --- | --- | --- |
| C-01 공식 목록에 없음 | 공식 이름과 정확히 같은 이름이 없음(화면 전용 컴포넌트는 정상이라 낮춤, 화면에서는 접힌 묶음) | 정보 |
| C-02 합치기 후보 | (이름 단어 Jaccard ≥ 0.5 그리고 props 이름 Jaccard ≥ 0.5) 또는 (같은 라이브러리 컴포넌트 상속 + 이름 단어 1개 이상 겹침). 같은 HTML 요소 상속은 조건이 아니라 근거 표시. 공식끼리 제외, 이어진 후보는 1건 | 공식이 들어가면 경고, 아니면 정보 |
| C-03 나누기 후보 | 직접 선언한 props가 8개 초과 | 경고 |
| C-05 공식과 같은 이름의 별도 구현 | 디자인 시스템 파일을 올린 경우에만. JSON 스펙은 구현 위치를 알 수 없어 같은 이름을 공식 구현으로 봄 | 경고 |

알려진 한계: `@/` 경로 별칭·`export … from` 재내보내기·패키지 타입은 따라가지 않아 props를 일부만 읽을 수 있다(요약에 개수만 표시). 완전한 타입 검사기 기반 분석은 고도화 목록.

## 필수 규칙

- OpenAI API는 반드시 서버(Route Handler)에서만 호출한다. 클라이언트 컴포넌트에서 직접 호출하지 않는다.
- OpenAI 응답은 받는 즉시 Zod 스키마로 검증한다. 검증 실패 시 1회 자동 재시도 후 사용자에게 안내한다.
- Supabase 쿼리는 기본적으로 publishable key(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) + 로그인 세션으로 실행한다. 서버에서 사용자를 확인할 때는 `getClaims()`를 쓰고 `getSession()`의 값은 신뢰하지 않는다. service role key는 꼭 필요한 서버 전용 작업에만, 별도 클라이언트로 분리해 사용한다.
- 모든 Supabase 테이블은 RLS를 켜고, `user_id = auth.uid()` 기준(또는 project_id를 통한 간접 기준)으로 정책을 작성한다. 정책 없는 공개 테이블을 만들지 않는다.
- 업로드된 이미지·코드 원본은 분석 후 저장하지 않는다. DB에는 설계도·스펙·검사 결과·지시서만 저장한다.
- 환경변수는 `.env.local`에만 두고 커밋하지 않는다. `NEXT_PUBLIC_` 접두사는 브라우저에 노출해도 되는 값에만 붙인다.

## 금지 사항

- 클라이언트 컴포넌트에서 `SUPABASE_SERVICE_ROLE_KEY` 또는 OpenAI API 키를 import하거나 참조하지 않는다.
- `core/` 아래 파일에서 React, Next.js, 브라우저 전용 API를 import하지 않는다.
- 인라인 스타일(`style={{ ... }}`)과 `!important`를 사용하지 않는다. Tailwind 프로젝트에서는 테마에 없는 임의값(대괄호 값)을 기본값으로 쓰지 않는다. 단 `components/ui/`의 shadcn 생성 코드는 이 임의값 규칙의 예외다(생성 코드를 그대로 둔다).
- AI 응답을 검증 없이 그대로 설계도에 반영하지 않는다.
- `app/` 아래에 라우팅 파일(`page.tsx`, `route.ts`, `layout.tsx`)이 아닌 일반 컴포넌트나 로직 파일을 두지 않는다. 그런 코드는 `components/` 또는 `core/`로 보낸다.

## 스택 어댑터

프레임워크(html/react/next), 스타일(css/css-modules/tailwind), 디렉토리 구조(type-based/feature-based/fsd)를 독립된 어댑터로 분리해 3×3×3 조합을 9개 어댑터로 지원한다. 조합에 따른 특수 규칙(예: Next.js + FSD 배치)은 구조 어댑터가 프레임워크 값을 보고 추가한다. 새 스택 지원은 어댑터 추가로 처리하고, 기존 어댑터를 수정하지 않는다.

## 일정상 우선순위 (일정이 밀릴 때 줄이는 순서)

1. 기능 B(디자인 시스템 정리) 전체 (최소 버전은 구현됨: 업로드·비교·정리 지시서. GitHub 저장소 입력은 미구현)
2. 계정 화면(S-09)의 사용량 표시
3. HTML·CSS 어댑터
4. FSD 검사 규칙(AR-01~AR-03)
5. 위반 설명 기능(F-008)

기능 A(구조 초안 → 노드·레이아웃 편집 → 검사 → 지시서)는 1순위이며 끝까지 완성한다.

## 명명 규칙

- 컴포넌트 파일·이름: PascalCase (`ProductCard.tsx`)
- 훅: camelCase + `use` 접두사 (`useCart.ts`)
- Route Handler 파일: 소문자 (`route.ts`, Next.js 규칙 고정)
- Zod 스키마: PascalCase + `Schema` 접미사 (`ComponentNodeSchema`)
- 검사 규칙 ID: 접두사+번호 (`R-01` 공통, `TW-01` Tailwind, `NX-01` Next.js 등)
- CSS Modules 파일: 컴포넌트명과 동일 (`ProductCard.module.css`)

## API 라우트 개요

| 경로 | 메서드 | 입력 | 출력 | 비고 |
| --- | --- | --- | --- | --- |
| `/api/draft` | POST | `multipart/form-data`: stack(projectId가 없을 때만 필요), projectId(선택, 있으면 프로젝트 소유를 AI 호출 전에 확인하고 스택은 프로젝트 값을 쓰며 성공한 초안을 새 판으로 저장하고 스펙 입력(7개 항목·route·이미지 수, 이미지 원본 제외)을 spec_inputs에 저장), route(선택), spec(JSON, 7개 항목 일부), images(0~3장), imageMeta(선택, 이미지별 originalWidth) | 시작 전 오류는 상태 코드 + JSON. 통과하면 200 NDJSON 스트림(줄마다 JSON): `stage`(accepted·generating·validating·normalizing·regenerating·saving), `ping`(10초 하트비트), 마지막 줄 `done`(`{ blueprint, meta(attempts, elapsedMs, normalized, saved) }`) 또는 `error`(`status`와 `error`, 저장 실패는 `blueprint` 포함) | OpenAI 호출, 스키마 검증, 검증 실패 시 자동 보정 후 재검증, 그래도 실패하면 1회 재시도. 사전 오류는 400·401·404(projectId)·413·503(projectId 조회), 시작 후 오류는 스트림 `error`의 status로 422·429·502·504·503(저장 실패). 마감은 재시도 포함 텍스트만 45초·이미지 포함 60초. 클라이언트는 `done`·`error` 없이 끝나거나 30초 무수신이면 끊긴 것으로 처리 |
| `/api/explain` | POST | 위반 1건 또는 정리 대상 | 설명·수정 제안 | OpenAI 호출 |
| `/api/analyze` | POST | JSON `{ codeFiles: [{path, content}], designSystemFiles?: [{path, content}], specJson?: string }`(designSystemFiles와 specJson 중 하나만) | 200 `{ result }`(공식 수, 비교 결과 findings, 요약, 문법 오류 파일, 스펙 생성 시 버린 값) | 본문 3MB 이하. 칸(코드·디자인 시스템)마다 서버가 다시 거르고 30개·파일당 200KB·합계 1MB 검사(넘으면 413과 "더 좁은 폴더" 안내). AI 호출·저장·로그 없음. 오류는 400·401·413·422(스펙 JSON 오류, 공식 컴포넌트 없음) |
| `/api/projects` | GET/POST | POST: JSON `{ name, stack }` | `{ projects }` / 201 `{ project }` | 로그인 세션 필수, 본인 프로젝트만(RLS) |
| `/api/projects/[id]` | PATCH/DELETE | PATCH: JSON `{ name }`(이름만, 1~100자) / DELETE: 본문 없음 | 200 `{ project }` / 200 `{ id }` | 스택은 바꿀 수 없음. DELETE는 설계도·스펙 입력·지시서를 DB 연쇄 삭제로 함께 지움(이름 재입력 확인은 화면이 맡음). 없거나 남의 프로젝트는 404. 오류는 400·401·404·413(PATCH)·422(PATCH)·503 |
| `/api/projects/[id]/blueprint` | GET/PUT | GET: `?revision=N`(생략 시 최신 판) / PUT: 설계도 JSON | `{ blueprint }`(내 프로젝트인데 판이 없으면 null, 없거나 남의 프로젝트는 404) / `{ revision, updatedAt }` | PUT은 자동 저장: 최신 판 갱신. 최신 판이 AI 초안이고 저장본이 사용자 수정본이면 새 판 추가(AI 원본 보존). 최신 판에 지시서(`prompt_exports`)가 연결돼 있어도 새 판 추가 |
| `/api/projects/[id]/revisions` | GET/POST | POST: 설계도 JSON | `{ revisions }`(없거나 남의 프로젝트는 404) / 201 `{ revision, updatedAt }` | POST는 새 판 추가(지금 화면은 쓰지 않는다. 지시서 내보내기는 `/exports`가 최신 판에 연결해 기록한다). 요청 본문 1MB 이하·JSON만. 오류는 400·401·404·409·413·422·503 |
| `/api/projects/[id]/exports` | POST | JSON `{ route? }`(문자열 또는 null, 보내면 화면 주소로 저장) | 200 `{ revision, specEmpty, documents: [{ format, fileName, content, recorded }] }` | DB에 저장된 최신 판으로 화면 규칙 파일(`claude_md`)·지시서(`prompt`)를 템플릿으로 만들고(OpenAI 호출 없음) `prompt_exports`에 그 판과 연결해 기록. 같은 판·같은 형식의 직전 기록과 내용이 같으면 기록만 건너뜀(`recorded` false). 기록으로 최신 판이 지시서와 연결되면 이후 편집은 새 판으로 저장됨. 화면은 먼저 저장 큐를 drain해야 함. 오류는 400·401·404(프로젝트·판 없음)·413·422(주소 형식, 루트가 둘)·500(저장된 설계도 손상)·503 |
| `/auth/callback` | GET | GitHub OAuth code | 세션 쿠키 설정 후 리다이렉트 | Supabase 세션 교환 |

모든 API 라우트는 처리 전 Supabase 세션 유무를 먼저 확인하고, 없으면 401을 반환한다(로그인 화면은 제외).

## 에러 처리 공통 규칙

- OpenAI 호출 실패·타임아웃(텍스트만 45초, 이미지 포함 60초 초과): 사용자에게 재시도 버튼 제공, 입력 내용은 보존한다.
- `/api/draft` 스트림이 `done`·`error` 알림 없이 끝나거나 마지막 줄(하트비트 포함) 이후 30초 동안 아무것도 오지 않으면 연결이 끊긴 것으로 보고, 입력을 보존한 채 "연결이 끊겼습니다" 오류와 다시 시도 버튼을 보여 준다.
- 스키마 검증 실패: 먼저 기계적으로 고칠 수 있는 오류(grid의 direction, flex의 columns, 같은 부모 아래 order 중복)를 자동 보정하고 보정 내역을 응답 meta에 담는다. 그래도 실패하면 1회 자동 재시도 → 재실패 시 오류 메시지와 함께 원인 필드를 사용자에게 보여준다. 남은 시간이 max(첫 시도 소요 시간, 15초)보다 적으면 재시도하지 않고 422와 실패 항목을 반환한다(화면의 다시 시도 버튼으로 처리).
- Supabase 쿼리 실패: 에러를 그대로 노출하지 않고, 사용자용 메시지로 변환해 보여준다. 원본 에러는 서버 로그에만 남긴다.
- 업로드 용량·개수: 이미지는 장당 5MB·최대 3장까지 선택하고, 전송 전 브라우저에서 축소해 합계 4MB 이하로 만든다(Vercel 함수 요청 본문 한도 4.5MB). 코드는 30개까지. 모두 업로드 전에 클라이언트에서 먼저 검사해 불필요한 호출을 막는다. 서버는 합계 4MB 초과 시 413을 반환한다.

## 커밋·브랜치

- 커밋 메시지: `feat:`, `fix:`, `chore:`, `docs:` 접두사 사용
- 기능 단위로 작게 커밋한다. 설계도 스키마 변경은 별도 커밋으로 분리한다.
- `main` 브랜치에 직접 기능 커밋을 쌓아도 되는 개인 프로젝트 일정이지만, 동작 확인 전 커밋은 피한다.

## 작업 시 자주 확인할 것

- 새 컴포넌트를 `app/` 안에 만들려는 경우, `components/`로 옮길 수 있는지 먼저 검토한다.
- 새 Supabase 테이블을 만들 때마다 RLS 정책을 같은 작업 안에서 함께 작성한다. 정책 없이 테이블만 만들고 넘어가지 않는다.
- 노드 이동·수정 로직은 `parentId`·`order` 외의 하위 노드 데이터를 건드리지 않는다. 트리 형태가 필요하면 `buildTree()`로 변환해 쓴다.
- 설계도 편집은 `core/edit`의 순수 함수(연산)로만 한다. 화면(컴포넌트)은 연산을 부르고 결과(`EditResult`)만 반영하며, 스토어의 `applyEdit`을 거치지 않고 설계도 객체를 직접 고치지 않는다. 연산은 결과 전체를 `BlueprintSchema`로 검증해 통과한 것만 돌려주므로 저장되는 설계도는 항상 유효하다. 새 편집 규칙은 연산과 단위 테스트에 넣고, 같은 규칙을 화면에도 중복해서 쓰지 않는다(화면은 선택지를 숨길 때만 같은 판단 함수를 쓴다).
- 설계도 저장(`PUT /api/projects/[id]/blueprint`)은 화면에서 직접 `fetch`하지 않고 저장 큐(`lib/client/save-queue`)를 거친다: 마지막 편집 후 800ms 디바운스, 한 번에 하나씩 순서대로, 전송 중 편집은 합쳐 최신본만. 초안을 다시 생성할 때는 먼저 편집을 막고(`startDraft`) 큐를 정리(`settle`)한 뒤 생성한다(`components/structure/generate.ts`). 이 순서를 바꾸면 이전 편집이 새 AI 초안 위에 저장될 수 있다.
- 지시서 내보내기(`POST /api/projects/[id]/exports`)는 화면에서 `lib/client/run-export`의 `runExport`를 거친다: 저장 큐 `drain()`이 true일 때만 요청한다(서버는 DB에 저장된 최신 판만 쓰므로, 보내지 않은 수정이 남은 채 요청하면 이전 내용으로 지시서가 만들어진다). 지시서와 연결된 판은 `saveBlueprint`가 갱신하지 않고 새 판으로 저장한다(`lib/db/blueprints.ts`).
- 스택 어댑터(`core/adapters`)를 수정할 때는 해당 어댑터에만 영향이 가도록 하고, 다른 어댑터·공통 규칙을 함께 건드리지 않는다.
- 파일을 만들거나 고칠 때는 Write·Edit 도구를 쓴다. 셸 heredoc(`cat <<EOF`, `python - <<EOF`)로 긴 내용을 쓰지 않는다(인용 부호·한글·`'''`가 섞이면 구문 오류로 명령 전체가 실행되지 않는다). 셸은 실행·검사 명령에만 쓴다.
- 서버(`next start`·`next dev` 등)를 띄워 확인할 때는 직접 띄운 포트의 프로세스만 종료한다. `taskkill /IM node.exe`처럼 node 프로세스 전체를 종료하지 않는다(사용자가 켜 둔 개발 서버가 꺼진다). 로그인 없이 되는 확인은 사용자가 쓰는 3000이 아닌 다른 포트를 쓰고, 포트로 PID를 찾아 그 PID만 종료한다. **로그인이 필요한 화면은 개발 서버 3000번 포트(사용자가 띄움)에서만 확인한다.** Supabase Redirect URLs에 `http://localhost:3000/**`만 등록돼 있어, 다른 포트로 띄우면 로그인 후 Site URL(Vercel 배포)로 넘어간다(`docs/deploy-checklist.md` 3절·5절). 다른 포트를 쓰려면 Redirect URLs에도 추가해야 한다.
- 지시서 템플릿은 부모 노드별 `layout`을 배치 문장으로, 노드별 `location`을 "파일 위치" 섹션으로 포함해야 한다. 또한 F-002의 7개 입력 항목이 "필수 규칙"·"금지 사항" 섹션에 빠짐없이 반영되는지 확인한다.

## 비고

- OpenAI 모델명·가격, Supabase RLS 정책 세부 문법은 작업 중 공식 문서로 재확인한다.
- 이 프로젝트 자체가 "AI 에이전트에게 설계를 지시서로 전달한다"는 개념을 다루므로, 이 CLAUDE.md의 규칙은 실제 생성 코드와 어긋나지 않도록 구조가 바뀔 때마다 갱신한다.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

## 실수에서 배운 규칙

이 프로젝트에서 실제로 있었던 실수와 그 뒤 정한 규칙이다. 새 실수가 생기면 한 줄씩 더한다.

- **문서와 실제가 다름**: 스펙·CLAUDE.md에 적힌 경로·이름·동작이 실제 파일과 다르면 어느 쪽이 맞다고 말없이 판단하지 않는다. 어긋난 곳을 사용자에게 알리고 어느 쪽에 맞출지 묻는다.
- **문서끼리 다름**: 같은 내용이 두 문서에서 다르게 적혀 있으면(예: CLAUDE.md의 "main에 직접 커밋해도 된다"와 구현 검사 스펙의 "main 직접 커밋 안 함") 한쪽을 골라 따르지 않고 알린다. 규칙은 한 곳에만 적고, 다른 곳에서는 그 위치를 가리킨다.
- **heredoc 반복**: 셸 heredoc(`<<`)로 파일을 쓰지 않는다. 한글·따옴표·역슬래시가 깨져 컴파일 오류가 났고(2026-10-29), 규칙을 적은 직후에도 어겨서 훅(`.claude/hooks/block-heredoc.mjs`)으로 막았다. 출력이 없는 명령이어도 쓰지 않는다.
- **기대값을 바꿔 통과시킴**: 테스트를 통과시키려고 기대값(`expected.*`, 테스트의 조건)을 바꾸지 않는다. 바꿔야 하면 무엇을 왜 바꾸는지 먼저 보고하고 승인받는다. 틀린 쪽이 코드면 코드를 고친다(약한 테스트가 아무것도 검증하지 못한 채 통과한 적이 있다, 2026-10-30).
- **node 전체 종료**: `taskkill /IM node.exe`로 node 프로세스를 전부 종료하지 않는다(사용자의 개발 서버가 꺼진다, 2026-10-30). 직접 띄운 포트의 PID만 종료한다.
- **다른 포트로 서버를 띄움**: 로그인이 필요한 화면은 사용자가 띄운 3000번에서만 확인한다. 다른 포트는 Supabase Redirect URLs에 없어서 로그인 뒤 배포 주소(Vercel)로 넘어간다(`docs/deploy-checklist.md` 3절·5절).

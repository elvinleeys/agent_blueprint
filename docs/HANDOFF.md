# 인수인계 (지시서 작업)

이 문서만 읽고도 이어서 작업할 수 있게 쓴 문서다. 규칙과 구조의 정본은 `CLAUDE.md`이고, 이 문서는 현재 상태와 남은 일을 말한다.

## 프로젝트 한 줄 소개

AgentBlueprint: AI 에이전트가 코드를 쓰기 전에 프론트엔드 구조를 설계·검사하고, 그 설계를 에이전트 지시서(프롬프트·규칙 파일)로 바꿔 주는 웹 도구. (Next.js App Router, TypeScript, Tailwind, Zustand, Zod, Supabase, OpenAI Responses API)

## 기능 A의 흐름

1. **입력**: 구조 설계 탭에서 스펙 7개 항목(+이미지 0~3장, 화면 주소)을 적는다.
2. **AI 초안**: `POST /api/draft`(NDJSON 스트림)가 OpenAI로 설계도(평면 노드 배열 + `parentId`)를 만들고 Zod로 검증·자동 보정한 뒤 새 판으로 저장한다.
3. **편집**: 트리·미리보기에서 노드 내용·배치·이동을 고친다. 편집은 `core/edit` 순수 함수 → 스토어 `applyEdit` → 저장 큐(`lib/client/save-queue`, 800ms 디바운스)로 `PUT /api/projects/[id]/blueprint` 자동 저장.
4. **검사**: `core/rules`의 `checkBlueprint`(공통 R-01~08 + 스택 어댑터 규칙)가 위반을 계산한다. 코드로 판정하고 AI는 설명만 맡는다.
5. **지시서**: `core/prompt`가 설계도를 문서 두 개로 바꾼다(템플릿만, AI 호출 없음, 같은 입력이면 같은 출력).
   - `claude_md` = 화면 규칙 파일(`.claude/rules/<화면>.md`): "무엇을" 만드는가
   - `prompt` = 지시서: 규칙 파일을 참조해 "어떻게" 만드는가

## 현재 완료 상태

최신 커밋은 `git log -1`로 본다(6단계 문서 갱신 커밋이 마지막이다). 아래 표의 5·6단계와 프로젝트 삭제까지 구현·문서화가 끝났고, 남은 일은 사용자의 화면 확인이다.

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| 1 | 저장 큐 `drain()` (`7ee7229`) | 완료 |
| 2 | 두 문서 생성기, 스택별 문장, NX-05, Tailwind 자동 보정, 기준 파일 (`0375c45`) | 완료 |
| 3 | 보완 A(지시서와 연결된 최신 판은 갱신하지 않고 새 판), 보완 B의 DB 함수 `saveSpecRoute`, `lib/db/prompt-exports.ts` (`58c4b53`) | 완료 |
| 7 | 셸 명령에 `<<`가 있으면 막는 PreToolUse 훅 (`4c2185c`, `.claude/hooks/block-heredoc.mjs`) | 완료 |
| 4 | `POST /api/projects/[id]/exports` + 순서 테스트 + 변이 실험 (`70106d2`) | 완료 |
| 5 | 지시서 탭 화면: `runExport`·복사·내려받기 (`d6c65fc`), 화면 (`c5e1d0b`), 스택별 화면 주소 안내와 HTML "실험적" 표시 (`4a9cf21`) | 완료 |
| 부가 | 프로젝트 삭제 `DELETE /api/projects/[id]` + 설정 탭 삭제 버튼(이름 재입력) (`6c49024`) | 완료 |
| 6 | 문서 갱신(`CLAUDE.md`, `data-model.md` 7-2절, `docs/dev-log/2026-11-02.md`, 이 문서, 계획 문서의 고도화 목록) | 완료 |

검증 상태: 전체 `vitest` 859개 통과, `tsc`·`lint` 통과. 실제 Supabase·OpenAI를 부른 검증은 하지 않았다(`next build` 통과: `/api/projects/[id]/exports`를 포함한 라우트가 모두 컴파일됨).

### 내보내기 API (4단계, 구현됨)

`POST /api/projects/[id]/exports`, JSON `{ route?: string | null }`.
순서: 화면 주소 저장(보냈을 때만) → 최신 판 확인 → 판·스펙 읽기 → 형식마다 직전 기록과 비교해 같으면 기록 건너뛰기, 다르면 그 판에 연결해 `prompt_exports`에 저장.
응답: `{ revision, specEmpty, documents: [{ format: "claude_md" | "prompt", fileName, content, recorded }] }`. 건너뛴 문서도 `content`는 돌려준다.
오류: 400(형식)·401·404(프로젝트 또는 판 없음)·413·422(주소 형식, 루트가 둘)·500(저장된 설계도 손상)·503(DB). 이 라우트는 **DB에 저장된 최신 판만** 쓰므로 화면이 먼저 저장 큐를 비워야 한다.
기록으로 최신 판이 지시서와 연결되면, 그다음 편집은 `saveBlueprint`가 새 판으로 저장한다(보완 A).

## 남은 작업

구현할 단계는 끝났다. 남은 것은 사용자의 화면 확인과 그 결과에 따른 수정이다.

- **사용자 화면 확인**: 지시서 탭 내보내기(drain 순서, 오류 확인 창, 스펙 비어 있음 경고, 복사·내려받기), `prompt_exports` RLS(행 생성, 같은 내용 재내보내기 시 증가 없음, 편집 시 새 판, 다른 계정에서 안 보임), 프로젝트 삭제(이름 재입력, 연쇄 삭제, 목록 이동, 남의 프로젝트 404).
- **확인 결과에 따른 수정**: 문제가 나오면 해당 `lib/client/run-export.ts`, `lib/api/exports-handler.ts`, `components/prompt/`, `components/workspace/ProjectSettingsTab.tsx`부터 본다.
- **작은 정리 후보**: 구조 설계 탭 입력칸의 화면 주소 도움말을 스택별 문구(`components/prompt/export-notes.ts`의 `ROUTE_HELP`)로 통일.
- **일정상 뒤로 미룬 것**: 기능 B(디자인 시스템 정리). 고도화 목록은 `tasks/plan-prompt-export.md`(지시서 추가 메모 칸, HTML·CSS에 맞는 블록·클래스 중심 설계 포함).
- **완료 기준**: 사용자가 확인 항목을 통과하고 `tsc`·`lint`·`vitest`·`next build`가 통과한다.

## 반드시 지킬 규칙

- **커밋 전 `npx tsc --noEmit` 먼저.** 기능 단위로 작게 커밋(`feat:`·`fix:`·`chore:`·`docs:` 접두사), 동작 확인 전 커밋 금지.
- **셸 heredoc 금지.** 파일은 Write·Edit 도구로 만들고 고친다. `.claude/hooks/block-heredoc.mjs`가 Bash 명령의 `<<`를 막는다.
- **실제 OpenAI 호출 금지.** `npm run test:draft`와 `/api/draft`를 실제 키로 돌리지 않는다. 내보내기는 템플릿만 쓰므로 호출이 없다.
- **새 패키지는 먼저 사용자에게 묻는다.**
- **스키마 변경은 별도 커밋.** 설계도·DB 스키마를 바꾸면 `data-model.md`와 함께 따로 커밋.
- **인라인 스타일(`style={{}}`)·`!important`·Tailwind 임의값(대괄호) 금지**(`components/ui/`의 shadcn 생성 코드는 예외).
- **화면 코드에 색상값 직접 쓰기 금지.** 색은 `app/globals.css`의 디자인 토큰(`text-foreground`, `border-border`, `bg-primary` 같은 테마 클래스)만 쓴다.
- `core/`는 React·Next.js·브라우저 API를 import하지 않는다. `app/`에는 `page.tsx`·`route.ts`·`layout.tsx`만 둔다(컴포넌트는 `components/`).
- 설계도 편집은 `core/edit` 연산 + 스토어 `applyEdit`로만 한다. 설계도 저장은 저장 큐(`lib/client/save-queue`)만 거친다(화면에서 직접 `fetch` 금지).
- OpenAI·service role key는 서버에서만. 모든 API 라우트는 세션 확인 후 401. Supabase 오류는 사용자용 문구로 바꿔 보여 준다.
- 서버를 띄워 확인할 때는 3000이 아닌 포트를 쓰고 그 포트의 PID만 종료한다(`taskkill /IM node.exe` 금지).
- 이미 있는 어댑터·규칙 코드는 건드리지 않는다. 새 편집 규칙은 `core/edit`에 두고 화면에 중복하지 않는다.

## 꼭 읽을 파일

1. `CLAUDE.md` (규칙·폴더 구조·API 표)
2. `.claude/skills/define-schema/data-model.md` (스키마 기준 문서)
3. `tasks/plan-prompt-export.md` (단계·보완 A·B·고도화 목록·알려진 한계)
4. `docs/dev-log/2026-11-02.md` (최신 개발 로그, 지시서 3~6단계·프로젝트 삭제), `docs/dev-log/2026-11-01.md` (지시서 1~2단계와 기준 파일 검토 결정)
5. 지시서 화면·내보내기 관련: `components/workspace/Workspace.tsx`, `components/structure/SaveQueueProvider.tsx`·`ViolationsProvider.tsx`, `store/structure-store.ts`, `lib/client/save-queue.ts`(`drain`), `lib/api/exports-handler.ts`, `core/prompt/export-prompt.ts`

## 실행·검증 명령

```bash
npm run dev                  # 개발 서버(기본 3000은 사용자가 쓴다. 확인용은 npx next dev -p 3100 처럼 다른 포트)
npm test                     # 단위 테스트 (vitest run). 파일 하나: npx vitest run <경로>
npx tsc --noEmit             # 타입 검사 (커밋 전 필수)
npm run lint                 # 린트
npm run build                # 빌드
```

## 알려진 한계와 아직 확인하지 못한 것

- **경쟁 상태는 처리하지 않았다**: `saveSpecRoute`(행이 없을 때 동시 호출), `saveBlueprint`(지시서 연결 확인과 쓰기 사이), 내보내기(비교와 기록 사이, 최신 판 id 읽기와 설계도 읽기 사이).
- **`prompt_exports`의 RLS 동작은 실제로 확인하지 못했다.** 지금까지는 가짜 DB 테스트뿐이다. 사용자가 화면에서 실제로 내보낼 때 확인한다(프로젝트 삭제의 연쇄 삭제도 같다).
- `.claude/rules`의 `paths` glob이 실제 Claude Code에서 도는지 열어 보지 못했다(문서에 맞춰 작성).
- 토큰 인식은 `color`·`spacing`·`radius`·`layout`·`font`·`shadow`·`size`·`border`·`opacity` 접두사만 하고, 클래스로 바꾸는 것은 색·간격·모서리뿐이다.
- 기준 파일(`fixtures/prompts/`)은 AI 응답 1건 기준이라 가정 필드(`assumedFields`)가 있는 입력의 기준 파일은 없다.
- 같은 루트 이름의 화면이 둘이면 규칙 파일 이름이 겹친다.
- PostToolUse `tsc` 훅이 편집 중간 상태에서 실패를 알릴 수 있다(직접 다시 실행하면 통과한 적이 여러 번 있다).
- 범위 밖(고도화 목록은 `tasks/plan-prompt-export.md`): 프로젝트 공통 규칙 파일, 여러 화면, 변경분 지시서, 기능 B(디자인 시스템 정리) 등.

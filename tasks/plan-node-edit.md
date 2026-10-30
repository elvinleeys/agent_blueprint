# 스펙과 계획: 노드 편집 (구조 설계 탭 오른쪽 패널)

승인됨(2026-10-30, 사용자 답변 a~d·추가 위험 대응 1~6 반영, 아래 "승인 후 변경" 참고). 승인 뒤 단계별로 구현하고, 커밋은 동작 확인 후 기능 단위(`feat:`, 문서는 `docs:`)로 한다. 실제 OpenAI 호출은 하지 않는다(편집은 AI를 부르지 않는다).

## 1. 목표
AI가 만든 설계도의 노드를 오른쪽 패널에서 고치고 구조를 바꾼다. 결과는 미리보기·트리에 바로 반영되고 자동 저장된다. 드래그, 노드 통합, 실행 취소, 검사 규칙, 지시서는 이번에 하지 않는다.

## 2. 확인한 현재 상태 (이 스펙의 전제)
- 스키마(`core/schema/blueprint.ts`)가 이미 규칙 대부분을 판정한다: 이름 고유·형식, 훅 제약, renderMode, FSD 형식, placement는 부모가 grid일 때만, 자식이 있으면 layout 필수, order 겹침, 순환·고립, 스타일 배치 속성 금지·중복 금지.
- **스키마가 강제하지 않는 것**: `span ≤ 부모 columns`(data-model에는 있음). 편집 연산이 직접 검사한다.
- `NodeInfoPanel.tsx`는 보기 전용이다. 스토어(`store/structure-store.ts`)는 `blueprint`·`selectedNodeId`·`unsaved`(초안 저장 실패용)를 갖고, 미리보기·트리는 스토어의 `blueprint`를 읽는다.
- 저장 API `PUT /api/projects/[id]/blueprint`와 `lib/db/saveBlueprint`는 있다(AI 판 보존 규칙은 서버가 처리). 클라이언트 저장 코드는 없다.
- 테스트는 vitest(설정 파일 없음, `*.test.ts` 같은 폴더). jsdom·testing-library는 설치돼 있지 않다. 사용할 UI 부품: `components/ui`의 Dialog, Select, Input, Button, Badge 등.

## 3. 가정 (틀리면 알려 주세요)
1. 편집 결과가 `BlueprintSchema`를 통과해야 스토어에 반영한다. 통과 못 하면 스토어는 그대로, 이유를 해당 입력칸 옆에 표시한다. 그래서 저장되는 설계도는 항상 유효하다.
2. 입력 중인 값은 그 칸의 로컬 상태로 두고, 유효할 때만 스토어에 커밋한다(예: 이름 입력 중 중복이면 오류 표시, 스토어는 이전 값 유지). 추가한 빈 행(상태·prop 등)도 이름을 채워 유효해질 때 커밋한다.
3. 편집이 반영되면 `generatedBy`는 `"user"`로 바꾼다. 이것이 서버의 "AI 원본 보존, 새 판 추가" 판단 입력이다.
4. 새 노드 기본값: 이름 `NewComponent`(겹치면 `NewComponent2`…), kind `presentational`, 책임·상태·props·이벤트 빈 배열, `dataFetch` false, 위치(`location.dir`)는 부모 값 복사(어댑터 추천은 아직 없음), layout·placement·style은 null, renderMode는 Next.js면 부모가 client일 때 client, 아니면 server(NX-04를 처음부터 안 어기게). 부모의 layout이 null이면 스키마가 요구하므로 `block, gap null`로 채운다. id는 설계도 안에서 안 쓰인 `n<번호>`.
5. 스타일이 null인 노드에서 속성을 처음 추가하면 `scope`를 스택에서 정한다(css→global, css-modules→module, tailwind→utility), `ownsOuterSpacing` false. scope·classPattern 입력칸은 이번에 만들지 않는다.
6. 종류를 훅으로 바꿀 때: 자식이 있으면 거부. 없으면 layout·placement·style·renderMode를 null, events를 []로 비운다(지워지는 값이 있으면 패널에 안내). 훅에서 다른 종류로 바꾸면 이름이 훅 형식이므로 이름 오류를 먼저 보여 주고 사용자가 고친다(kind만 바꾸면 이름이 규칙에 어긋나 거부되는 걸 이유로 표시). Next.js면 renderMode는 4번 기본값으로 채운다.
7. `assumed`·`assumedFields`는 편집으로 건드리지 않는다(AI 가정 표시는 그대로).
8. 책임은 1줄 텍스트 목록(최대 5, 빈 문자열 불가). 이벤트도 같은 목록 입력. props 타입은 자유 문자열(비어 있으면 안 됨).

## 4. 편집 연산 (core, 순수 함수)

위치: `core/edit/` (React·Next 없음). 모든 연산은 `Blueprint`를 받아 새 `Blueprint`를 돌려주고 입력을 바꾸지 않는다.

```ts
type EditResult =
  | { ok: true; blueprint: Blueprint; selectId?: string }
  | { ok: false; reason: string; path?: (string | number)[] }; // path: 스키마 이슈 경로, 입력칸 연결용
```

| 연산 | 규칙 |
| --- | --- |
| `updateNode(bp, id, patch)` | 내용·layout·placement·style·location 변경. 결과 전체를 `BlueprintSchema.safeParse`, 첫 이슈의 `path`·`message`를 `reason`으로 반환. 루트 id 변경 불가(id는 patch에 없음) |
| layout 변경 부수 규칙 | display를 바꾸면 direction·columns·responsive를 새 display에 맞게 정리(flex→direction 기본 row, grid→columns 기본 2, block→둘 다 제거, responsive 비움). grid에서 flex·block으로 바꾸면 **자식 전원 placement null**. grid의 columns를 줄여 어떤 자식 span이 열 수를 넘으면 거부(해당 자식 이름을 이유에 표시) |
| placement 변경 | 부모가 grid일 때만. span은 1~부모 columns 또는 `"full"`. 아니면 거부 |
| `moveNode(bp, id, newParentId)` | 거부: 루트, 새 부모가 자기·자손·훅. 성공: 새 부모의 마지막 order로 이동, 옛·새 부모 형제 order를 0부터 재정렬, 새 부모가 grid가 아니면 placement null, 새 부모 layout이 null이면 `block, gap null`로 채움. `location`·하위 노드는 안 바꿈 |
| `reorderNode(bp, id, "up" \| "down")` | 같은 부모 형제와 order 교환. 끝이면 거부. 루트는 거부 |
| `addChild(bp, parentId)` | 훅 부모면 거부. 3절 4번 기본값으로 새 노드를 마지막 order에 추가, `selectId`로 새 노드 반환 |
| `deleteNode(bp, id, mode)` | 루트 거부. `mode: "cascade"`: 자손 모두 삭제. `"promote"`: 자식을 삭제 노드의 부모로 옮기되 삭제 노드가 있던 순서 자리에 끼워 넣고 order 재정렬, 새 부모가 grid가 아니면 placement null. 둘 다 부모의 형제 order 재정렬. 자식이 없으면 mode 무시 |

모든 성공 결과는 `generatedBy: "user"`. 노드 이동·수정은 `parentId`·`order`(필요 시 placement) 외 하위 노드 데이터를 건드리지 않는다(CLAUDE.md 규칙).

## 5. 화면

- `NodeInfoPanel`을 편집 패널로 교체(파일명은 `NodeEditPanel`로 새로 만들고 정보 패널은 삭제). 섹션은 `<details>`로 접을 수 있게 해 좁은 열(lg:col-span-3)에서 길이를 관리한다. 모든 입력칸에 `<label>`, 오류는 `aria-describedby`+`role="alert"`로 연결, 버튼은 이름 있는 `<button>`.
- 섹션: 기본(이름·종류·데이터 조회·렌더링 방식) / 책임·이벤트 / 상태 / props / 파일 위치 / 배치 / 차지 칸 / 스타일 속성 / 구조(부모 선택, 위·아래, 자식 추가, 삭제).
- 숨김: renderMode는 Next.js이고 훅이 아닐 때만, 차지 칸은 부모가 grid일 때만, 배치·스타일 섹션은 훅이면 숨김, 반응형은 display가 flex·grid일 때만(tablet·mobile만 표시, 값은 기본값과 달라야 함).
- 파일 위치: FSD면 `계층/슬라이스/세그먼트`를 한 줄 텍스트로 입력(스키마 형식 검사 메시지 사용), 아니면 자유 입력(kebab-case 검사는 스키마).
- 부모 선택 상자: 자기, 자손, 훅 제외. 루트는 비활성 표시.
- 삭제: 자식이 없으면 확인 없이 삭제하지 않고 Dialog로 한 번 확인(되돌리기 없음). 자식이 있으면 "함께 삭제" / "자식을 상위로 옮기기" / 취소.
- 저장 상태 표시(구조 카드 헤더): 저장 중 / 저장됨 / 저장 실패 + "다시 시도" 버튼.
- "초안 다시 생성": 저장 안 된 수정(대기·저장 중·실패)이 있으면 확인 Dialog.

## 6. 자동 저장

- 스토어에 `revision`(편집 때마다 +1), `savedRevision`, `saveStatus: idle|saving|saved|error` 추가. 설계도 반영 시 저장 예약.
- `lib/client/save-queue.ts`: 마지막 편집 후 800ms 지나면 현재 설계도를 PUT. **한 번에 한 요청**, 저장 중에 편집이 또 있으면 끝난 뒤 최신본으로 한 번 더 보낸다(중간 편집은 건너뛰고 최신본만). 실패하면 `error`, "다시 시도"로 재전송. `fetch`는 주입해 테스트한다.
- 저장 전 `BlueprintSchema` 재검증(이미 연산에서 통과했지만 방어). 실패 응답은 서버 메시지를 그대로 노출하지 않고 사용자용 문구로 보여 준다.
- 기존 `unsaved`(초안 저장 실패)는 유지한다. 저장 상태 표시는 `unsaved || saveStatus === "error"`를 같은 실패 표시로 합친다.

## 7. 성공 기준 (검증 방법)

1. `npx vitest run`: `core/edit/*.test.ts`가 3·4절의 모든 규칙(거부 사유, 부수 효과, 순서 재정렬, 훅·루트·순환·자손, grid→flex 초기화, columns 축소 거부, promote 순서, 이름 고유·형식, 입력 불변)을 통과. `save-queue` 테스트: 디바운스, 직렬 전송, 중간 편집 합치기, 실패·재시도.
2. `npx tsc --noEmit`, `npm run lint`, `npm run build` 통과.
3. 브라우저에서 직접 확인(포트 3000 말고 다른 포트): 노드 선택→이름 수정→미리보기·트리에 즉시 반영→저장됨 표시, 잘못된 이름은 칸 옆 오류와 저장 안 됨, 구조 편집 5종, 삭제 Dialog 두 모드, 다시 생성 확인창, 마우스 없이 Tab·Enter·Space·화살표로 전부 조작.
4. 저장 후 새로고침해 편집본이 그대로 불러와진다.

## 8. 경계
- 항상: 연산은 `core/edit`에서만, 화면은 호출만. 모든 연산에 단위 테스트. 인라인 스타일·임의값 금지(`components/ui` 제외).
- 먼저 물어봄: 새 패키지(예: 컴포넌트 테스트용 jsdom·testing-library), 스키마 변경, `package.json` 스크립트 추가.
- 안 함: 드래그, 통합, 실행 취소, 검사 규칙 실행, 지시서, 스키마 필드 변경, OpenAI 호출, `core/adapters` 수정.

## 9. 계획 (순서·의존)

```
E1 updateNode(내용) ─ E2 layout·placement·style 부수 규칙 ─ E3 move·reorder·add·delete ┐
E4 save-queue ──────────────────────────────────────────────────────────────────────────┤
                                  E5 스토어(applyEdit·저장 상태) ─ E6 패널 내용 섹션 ─ E7 배치·차지 칸·스타일 ─ E8 구조 버튼·삭제 Dialog ─ E9 저장 표시·다시 생성 확인 ─ E10 문서
```

- [ ] E1 `core/edit/result.ts`, `update-node.ts`(+test): 이름·종류·책임·상태·props·이벤트·dataFetch·renderMode·location. 검증: vitest.
- [ ] E2 `update-node.ts` 확장(+test): layout·placement·style, 3절 5·6번 종류 변경. 검증: vitest.
- [ ] E3 `move-node.ts`, `reorder-node.ts`, `add-child.ts`, `delete-node.ts`(+test). 검증: vitest.
- [ ] E4 `lib/client/save-queue.ts`(+test). 검증: vitest.
- [ ] E5 `store/structure-store.ts`: `applyEdit(op)`(성공 시 반영·선택·revision 증가), 저장 상태, test 보강. 검증: vitest.
- [ ] E6 `components/structure/NodeEditPanel.tsx`와 내용 섹션 컴포넌트, StructurePanel 교체. 검증: 브라우저.
- [ ] E7 배치·차지 칸·스타일 섹션. 검증: 브라우저.
- [ ] E8 구조 섹션과 삭제 Dialog. 검증: 브라우저 키보드 조작.
- [ ] E9 저장 상태 표시, 저장 연결, 다시 생성 확인 Dialog. 검증: 브라우저, 새로고침 복원.
- [ ] E10 CLAUDE.md(폴더 구조 `core/edit/`, `lib/client/save-queue`), `data-model.md` 6절 갱신(편집 연산·span 검사 위치). 검증: 문서와 코드 대조.

각 단계가 끝나면 vitest·tsc·lint 결과를 보고한다(E6 이후는 build도). 위험: 좁은 오른쪽 열에 입력칸이 많아 길어짐(섹션 접기로 완화), 훅↔컴포넌트 종류 전환의 이름 충돌(3절 6번), 저장 중 연속 편집(E4 직렬 큐).

## 10. 열린 질문
1. 컴포넌트 테스트용 `jsdom`+`@testing-library/react`를 설치해도 되나요? 안 하면 UI는 브라우저 수동 확인만 하고 로직은 core 테스트로만 고정합니다(기본 제안: 설치 안 함).
2. 3절 6번처럼 종류를 훅↔컴포넌트로 바꿀 때 이름 형식 때문에 거부되는 방식으로 충분한가요, 아니면 이름도 자동 변환(`useX`↔`X`)할까요? (기본 제안: 거부+안내)
3. `assumed`/`assumedFields`는 편집해도 그대로 두는 것으로 괜찮은가요?
4. `package.json`에 `"test": "vitest run"` 스크립트를 추가해도 되나요?

## 11. 승인 후 변경 (사용자 답변)
- 질문 답: jsdom·testing-library 설치 안 함 / 훅↔컴포넌트 종류 전환은 거부하고 "새 노드로 추가하세요" 안내(3절 6번은 이것으로 대체) / 사용자가 고친 필드는 `assumedFields`에서 빼고 목록이 비면 `assumed=false`(목록을 알 수 없는 `assumed`는 그대로) / `"test": "vitest run"` 추가(완료).
- **span ≤ 부모 열 수는 스키마에 추가**(3·4절의 "편집 연산이 직접 검사"를 대체): 스키마 변경은 별도 커밋, 추가 전 DB 점검 SQL 제공, 자동 보정에 "span을 열 수로 줄이기" 추가·내역 기록. 이 때문에 E2(placement·columns)는 스키마·보정 커밋 뒤에 한다. 순서: E1 → [DB 점검 확인] → S(스키마·보정) → E2 …
- **다시 생성과 저장 순서**: "초안 다시 생성"은 진행 중인 저장을 기다리고, 전송 전(대기 중) 저장은 취소한 뒤 생성을 시작한다. 새 AI 초안 위에 이전 편집이 저장되지 않게 이 순서를 save-queue 테스트로 고정(E4·E9).
- 새 노드 renderMode: Next.js면 **조상 중 client가 있으면 client, 없으면 server**(부모만 보던 3절 4번 대체). 위치는 부모와 같은 폴더.
- 입력 중 틀린 값은 저장하지 않고 화면에만 둔다. 이 상태로 다른 노드를 선택하면 "저장되지 않은 수정을 취소할까요?" 확인(E6).
- 설계도가 없는 프로젝트에서는 편집 패널을 비활성(E6).
- promote 삭제: 자식들이 삭제된 노드 자리에 순서대로 들어가고, 새 부모가 grid가 아니면 placement를 비운다(E3, 4절과 같음).

## 12. 성능 측정 (2026-10-30, 1회)
- 조건: 노드 200개(루트 1 + 컨테이너 19 + 컴포넌트 171 + 훅 9, 스키마 통과 확인), Node 24 + tsx, 워밍업 20회 후 200회 측정, 이름 변경 1건.
- `updateNode` 1회: 중앙값 0.35ms, p95 0.94ms, 최대 2.2ms. 그중 `BlueprintSchema.safeParse`가 중앙값 0.31ms로 거의 전부다.
- 시간 기준은 테스트에 넣지 않았다(측정 스크립트도 저장소에 남기지 않음).
- 구조에 대해: 이름처럼 글자마다 바뀌는 입력은 **글자마다 `updateNode`(전체 스키마 검증)를 실행하는 구조**다(3절 2번: 유효할 때만 커밋). 검증 자체는 0.35ms라 부담이 없다. 실제 비용은 커밋될 때마다 일어나는 미리보기·트리 리렌더와 dagre 재배치(측정하지 않음)다. E6에서 노드 200개 설계도로 타이핑 중 끊김을 직접 확인하고, 문제가 있으면 트리 재배치를 입력이 멈춘 뒤로 미룬다. 자동 저장은 이미 800ms 디바운스라 글자마다 요청이 나가지 않는다.

## 13. 화면 단계 추가 요구 (E5·E6·E7 반영)
- **트리 자동 배치(dagre) 재계산 범위**: 부모 변경·순서 변경·자식 추가·삭제처럼 **구조가 바뀔 때만** 다시 계산하고, 이름·책임·상태·스타일 등 내용 수정에는 다시 계산하지 않는다. 구현 방향: 트리 배치 입력을 구조 키(노드 id·parentId·order 목록)로 메모해 키가 같으면 이전 배치를 재사용한다. 이름은 노드 카드 크기에 영향을 줄 수 있으므로 E6에서 카드 폭이 고정인지 확인한다(고정이 아니면 이름 변경도 재계산 대상에 넣고 이 문서를 고친다). E6의 노드 200개 타이핑 확인 때 "내용 수정은 재배치 없음, 구조 수정은 재배치"를 함께 확인한다(재계산 횟수를 세어 본다).
- **grid → 다른 방식 전환 확인**: 변경 전에 "자식 N개의 차지 칸과 반응형 설정이 초기화됩니다" 확인을 보여 준다(E7). 영향 계산은 core의 `displayChangeImpact(bp, id, display)`(자식 차지 칸 수, 이 노드의 반응형 값 유무, 같은 display면 null)가 맡고 화면은 그 값을 표시만 한다. 영향이 없으면(차지 칸 0개·반응형 없음) 확인 없이 바로 바꾼다.
- **CLAUDE.md 작업 규칙**: 긴 파일은 Write·Edit 도구로 쓴다(셸 heredoc 금지) 규칙 추가 완료. 변이 실험도 Edit 도구로 한다.

## 14. 저장·경고·알림 요구 (E5~E9 반영)
1. **생성 중 편집 비활성(E5·E6·E8·E9)**: 초안 생성 중(`status`가 resizing·running)에는 편집 패널 전체(내용 입력칸과 구조 버튼 모두)를 비활성으로 둔다. 스토어의 `applyEdit`도 같은 상태에서는 거부한다(화면 우회 방지, E5). 저장 큐의 `schedule`이 settle 중 편집을 조용히 버리는 일이 없게 하는 안전장치다.
2. **저장되지 않은 수정의 정의(E5·E9)**: 저장 대기(pending)·전송 중(saving)·저장 실패(error)와 초안 저장 실패(`unsaved`)를 모두 포함한다(`selectHasUnsaved`). "초안 다시 생성" 확인 창 문구에 **"저장되지 않은 수정은 사라집니다"**를 명시한다.
3. **떠나기 전 경고(E9)**: 저장되지 않은 수정이 있으면 브라우저 탭 닫기·새로고침(`beforeunload`)과 작업공간 안의 링크 이동(헤더·탭 링크 등) 모두 떠나기 전에 경고한다. 저장 큐가 비면 경고를 해제한다. 앱 라우터에는 `beforeunload`가 닿지 않는 클라이언트 이동이 있으므로 링크 클릭을 가로채는 방식과 그 한계를 E9 시작 때 `node_modules/next/dist/docs`에서 확인해 보고한다.
4. **자동으로 바뀐 값 알림(E5·E8)**: 연산 결과의 `filledLayout`은 "○○의 배치를 세로 정렬로 지정했습니다", `toClient`는 "client 영역 안으로 옮겨져 노드 N개를 client로 바꿨습니다"로 짧게 알린다. 문구는 core의 `describeEditNotices(result, blueprint)`가 만들고 스토어가 `editNotices`로 들고 있다가 화면이 표시한다(다음 편집이나 닫기로 사라짐).

## 15. E6 진행 기록 (2026-10-30)
- **재배치 범위 수정 완료**: 기존에는 편집이 반영될 때마다(글자 하나도) `dagre.layout`과 모든 노드 객체를 다시 만들었다. `createTreeFlow`가 구조 키(id·parentId·order)가 같으면 이전 좌표·엣지를 재사용한다. 카드가 `w-44 h-16` 고정·이름 `truncate`라 이름이 길어져도 좌표가 같음을 확인했다(13절 조건 충족). 미리보기는 `useMemo([blueprint, viewport])`로 선택만 바뀔 때 다시 계산하지 않는다. 재배치 횟수는 `stats.layouts`로 단위 테스트에 고정(내용 수정 7종 0회, 부모 변경·순서 변경·추가·삭제 각 1회).
- **200개 노드 계산 측정(1회, Node 24, 워밍업 후 200회)**: 글자 하나당 `updateNode`(검증 포함) 중앙값 0.32ms, 그 위에 미리보기 계산을 더해도 합계 0.42ms, 트리는 캐시 적중이라 합계 0.33ms(추가 비용 0.01ms 안팎), 구조 변경 때 dagre 전체 재계산은 중앙값 26.6ms(p95 29.6ms). **React 렌더링(미리보기 상자 200개, React Flow 노드)은 측정하지 못했다** — 브라우저에서 직접 확인이 필요하다.
- **스모크 테스트**: 새 패키지 없이 `react-dom/server`로 각 구역이 예외 없이 그려지고 스택·노드에 맞는 칸만 나오는지 확인한다(`vitest.config.ts`에 `@` 별칭만 추가). 입력 동작(타이핑·클릭·포커스·접기)은 서버 렌더링으로 확인할 수 없어 브라우저 확인 대상이다.
- E6에서 정보 패널(`NodeInfoPanel`)을 `NodeEditPanel`로 교체하고 열 폭을 입력 3·화면 구조 5(입력을 접으면 8)·편집 4로 바꿨다.

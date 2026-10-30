# 스펙과 계획: 구조 검사 규칙

상태: **승인 대기**. 승인 전에는 코드를 쓰지 않는다. 실제 OpenAI 호출은 하지 않는다(검사는 AI를 부르지 않는다).

## 1. 목표
스키마를 통과한 설계도에서 설계상 문제를 `core/rules`의 순수 함수로 찾아 오류·경고·정보로 알려 준다. 사전 테스트에서 스키마를 통과한 응답 4건 중 3건에 "client 아래 server 자식"(C1)이 있었고, 프롬프트만으로는 막기 어려워 규칙으로 잡는다.
결과는 DB에 저장하지 않고 설계도가 바뀔 때마다 화면에서 계산한다.

제외: AI 위반 설명·"제안 적용", 설정 탭의 규칙 켜기·끄기와 기준값 조정, 위반 결과 저장, 지시서, 상호작용 책임인데 상태·이벤트 없음(C3), 정의 없는 토큰 참조(C5, 기능 B), 화면 주소 없음(C6의 route 부분, 지시서 단계).

## 2. 읽고 확인한 현재 상태
- `core/schema/blueprint.ts`: 형식 검증만 한다. 훅 제약, `renderMode`는 Next.js에서만(훅 제외 필수), FSD 폴더 형식, 순환·고립, span ≤ 열 수는 스키마가 이미 막으므로 규칙에서 다시 보지 않는다. **스키마가 막지 않는 것**: 루트가 아닌 `page`, client 아래 server, server 아래 훅, FSD 계층 방향·슬라이스 교차.
- `store/structure-store.ts`: `blueprint`, `selectedNodeId`, `requestSelect`(틀린 입력이 있으면 확인), `editRevision`. 위반은 설계도에서 계산되는 값이라 **스토어에 넣지 않는다**.
- `StructurePanel.tsx`: 맨 아래 "검사 결과" 카드가 자리만 있다. `PreviewCanvas`의 상자와 `TreeNodeCard`가 이미 `assumed`를 주황 점선 테두리로 표시한다.
- `core/rules/common/`은 빈 폴더, `core/adapters/framework`·`styling`은 빈 폴더, `architecture`는 폴더 없음.
- 회귀 데이터: `tasks/draft-outputs/2026-10-29T06-30-55-935Z/*.json`(커밋돼 있음, 설계도 JSON 그대로). 채점 기록상 NX-04는 T-t 4건·T-l 3건·B-t 5건, AR-02는 T-l 4건.

## 3. 가정 (틀리면 알려 주세요)
1. 규칙은 노드·부모-자식·조상 관계만 본다. 책임 문장의 의미는 해석하지 않는다(R-05의 유사도만 문자열 비교).
2. 한 노드가 여러 규칙에 걸리면 각각 따로 보고한다(예: NX-01과 NX-04).
3. 노드마다 한 규칙은 한 번만 보고한다(규칙이 노드 묶음을 가리키면 묶음당 한 번).
4. 훅 노드도 R-01·R-02·R-03·R-05의 대상이다. 훅은 `style`·`layout`이 null이라 스타일·배치 규칙에서는 자연스럽게 제외된다.
5. 심각도 색: 오류=빨강(`destructive`), 경고=주황(`warning`), 정보=표시 없이 목록에만. 두 색 토큰이 `globals.css`에 있는지 구현 시작 때 확인한다(없으면 알린다).

## 4. 구조

```
core/rules/
  types.ts            Violation = { ruleId, severity, nodeIds, message }, Rule = (bp) => Violation[]
  common/             R-01~R-07 + 새 규칙 R-08, 각각 파일 하나 + .test.ts
  run.ts              checkBlueprint(bp): 어댑터가 묶어 준 규칙을 돌리고 정렬해 돌려줌
core/adapters/
  framework/          next.ts(NX-01~04), html.ts·react.ts(규칙 없음, 빈 목록)
  styling/            css-modules.ts(CM-01), tailwind.ts(TW-01·02), css.ts(HC-01)
  architecture/       fsd.ts(AR-01~03), type-based.ts·feature-based.ts(규칙 없음)
components/structure/
  ViolationsProvider  설계도가 바뀔 때만 checkBlueprint를 계산(useMemo)해 context로 제공
  CheckResults        검사 결과 카드(묶음·개수·항목 클릭)
```

- 어댑터는 `rulesFor(stack)`만 내보낸다. `run.ts`가 세 어댑터의 규칙 + 공통 규칙을 합친다. 새 스택은 어댑터 추가로 처리하고 기존 어댑터·공통 규칙을 건드리지 않는다.
- `core/`는 React·Next import 금지. 어댑터도 `core/` 안이라 순수 함수다.
- 표시 순서: 심각도(오류 → 경고 → 정보) 안에서 우선순위 규칙(NX-04 > NX-03 > R-07)을 먼저, 나머지는 규칙 id 순. 같은 규칙 안에서는 트리 순서(`order`).

## 5. 규칙 판정 기준

### 5-1. 기준이 명확한 규칙
| ID | 심각도 | 대상 | 판정 |
| --- | --- | --- | --- |
| NX-01 | 오류 | Next | `state` 또는 `events`가 있고 `renderMode === "server"` |
| NX-03 | 오류 | Next | `kind === "hook"`인 노드의 부모가 `renderMode === "server"` |
| NX-04 | 오류 | Next | 조상 중 `client`가 있는데 자신이 `server`. 노드마다 1건, 메시지에 가장 가까운 client 조상 이름 |
| R-01 | 경고 | 공통 | `responsibilities.length > 3` |
| R-04 | 오류 | 공통 | `kind === "presentational"` 이고 `dataFetch === true` |
| R-07 | 경고 | 공통 | 모든 노드가 `dataFetch === false`. `nodeIds`는 루트(클릭하면 루트 선택) |
| **R-08** (신규) | 경고 | 공통 | `kind === "page"` 이고 `parentId !== null`(루트가 아닌 페이지). 근거: 페이지는 화면 단위 최상위인데 편집 화면은 이미 막았고 AI 초안에서만 생길 수 있음 |
| R-06 | 경고 | 공통 | 루트가 아닌 노드의 `style.ownsOuterSpacing === true`, **또는** `style.properties`에 `margin`·`margin-top`·`margin-right`·`margin-bottom`·`margin-left`가 있음(AI가 플래그를 false로 두고 속성에 쓰는 경우를 잡기 위해 추가한 판정, 불필요하면 빼겠습니다) |
| CM-01 | 경고 | css-modules | `style.scope === "global"` |
| TW-01 | 경고 | tailwind | `style.properties` 중 `isToken === false`가 있음. 노드당 1건, 메시지에 속성 이름 목록 |
| AR-01 | 오류 | fsd | 자식의 계층 번호 < 부모의 계층 번호(app 0, pages 1, widgets 2, features 3, entities 4, shared 5). `nodeIds` = [자식, 부모] |
| AR-02 | 오류 | fsd | 부모·자식이 같은 계층이고 그 계층이 pages·widgets·features·entities이며 슬라이스가 다름 |
| AR-03 | 경고 | fsd | `page`인데 pages 계층이 아님 / 훅인데 세그먼트가 model·api·lib가 아님 / 훅이 아닌데 `page`도 아닌 노드의 세그먼트가 ui가 아님 |

규칙 id는 **R-08**로 제안한다(공통 규칙 R-xx 이어 번호). 승인되면 `CLAUDE.md` 표와 `data-model.md` 5절·변경 이력에 추가한다.
AR-03에서 `page`는 세그먼트가 아니라 계층만 본다(`pages/<슬라이스>/ui`는 통과). 루트가 아닌 `page`의 위치는 R-08이 맡는다.

### 5-2. 기준이 모호한 규칙 (승인 요청)

**NX-02 경고: client 범위가 필요 이상으로 넓음**
- 제안: *가장 위의 client 노드*(조상 중 client가 없는 client 노드)만 본다. 그 노드가 **자기 자신의 필요가 없으면** 경고한다. 자기 필요 = `state` 있음 / `events` 있음 / 훅 자식이 있음(훅은 client 부모가 필요, NX-03).
- 이유: client 조상 아래 노드는 NX-04 때문에 어차피 client여야 해서 "넓다"고 할 수 없다. 경계가 올라가 있는 곳은 가장 위 client뿐이고, 자기 필요가 없으면 경계를 아래 자손으로 내릴 수 있다.
- 메시지: "○○은(는) 자체로 client가 필요하지 않습니다. client 지정을 필요한 하위 노드로 내릴 수 있는지 확인하세요."
- 걸리지 않는 것: 자기 필요가 있는 client 노드, client 조상 아래의 client 노드, server 노드. 자손이 모두 server인 경우도 걸린다(자기 필요 없이 client).
- 한계: 자기 필요가 있는데 server로 둘 수 있는 큰 하위 트리가 매달려 있는 경우는 판단하지 않는다(정확히 알 수 없음).

**R-02 오류: 같은 상태가 2개 이상 노드에 있음**
- 제안: `state[].name`을 앞뒤 공백 제거·소문자로 맞춰 비교해 **이름이 같은 상태가 서로 다른 2개 이상 노드**에 있으면 위반. 상태 이름마다 1건, `nodeIds` = 해당 노드 전체.
- 오탐 줄이기: 이름이 `isOpen`, `open`, `loading`, `isLoading`, `error`, `value`, `hovered`, `focused`, `visible`처럼 **화면 부품마다 따로 갖는 범용 UI 상태 이름**이면, 두 노드가 **조상-자손 관계일 때만** 위반으로 본다(형제·사촌의 각자 `isOpen`은 정상). 그 외 이름은 관계와 무관하게 위반. 범용 이름 목록은 코드 상수 하나다.
- 못 잡는 것: 이름이 다른 같은 상태(`isFavorite` vs `favourited`). 타입·설명은 비교하지 않는다.
- 훅과 컴포넌트가 같은 이름 상태를 가져도(`useCart.cartCount`와 어떤 컴포넌트의 `cartCount`) 위반이다.

**R-03 경고: 같은 prop이 3단계 이상 연속 전달**
- 제안: 이름이 같은 prop(정확히 일치, `children`·`className`·`key`는 제외)을 **부모-자식 사슬로 3개 이상 노드가 연속해서** props에 선언하면 위반(= 2번 이상 그대로 내려보냄). 타입은 비교하지 않는다. 훅은 대상에서 제외한다.
- 분기가 있으면 같은 prop을 가진 연결된 노드 묶음 하나를 1건으로 보고하고(그 안에 길이 3 이상 사슬이 있을 때), `nodeIds`는 묶음 전체.
- 못 잡는 것: 중간 노드가 prop을 실제로 쓰는지(설계도에 없음). 그래서 "경고"이며 메시지는 "중간 노드가 쓰지 않는다면 context나 상태 위치 조정을 검토하세요" 정도로 쓴다.

**R-05 정보: 이름·책임이 비슷한 노드(재사용 후보)**
- 제안: 두 노드(훅 아님, 조상-자손 관계 아님)가 **이름과 책임 둘 다** 비슷하면 후보.
  - 이름 유사: PascalCase를 단어로 나눈 집합의 Jaccard ≥ 0.5 (예: `ProductCard`·`ProductCardItem` 2/3 → 후보, `DeliveryNotice`·`ReturnNotice` 1/3 → 아님)
  - 책임 유사: 책임 문장들을 이어 붙인 글자 2-gram의 Dice ≥ 0.4
- 연결된 후보 노드들은 묶음으로 1건. 임계값은 코드 상수이며, 샘플·사전 테스트 응답 전체에서 오탐이 많으면 값을 조정해 결과를 보고한다(정보 등급이라 누락보다 소음이 더 문제).
- 못 잡는 것: 이름이 완전히 다른 비슷한 노드, 다른 언어로 쓴 책임.

**TW-02 정보: 같은 스타일 묶음이 3개 이상 노드에 반복**
- 제안: Tailwind 스택에서 노드의 `style.properties`를 (속성, 값) 쌍의 집합으로 만들어 **쌍이 2개 이상**이고 **완전히 같은 집합이 3개 이상 노드**에 있으면 1건(`nodeIds` = 해당 노드). 순서는 무시.
- 쌍이 1개뿐이면 제외(한 줄 반복은 묶을 이득이 작음). 부분 일치는 보지 않는다.

**HC-01 경고: HTML·CSS 클래스 명명 규칙 불일치** (이 항목도 기준이 모호해 함께 승인 요청)
- 제안: 적용 대상은 `styling === "css"`. `style.classPattern`(예: "BEM")이 있는 노드들의 값을 소문자로 비교해 **서로 다른 값이 섞여 있으면** 소수 쪽 노드를 위반으로 보고, 다수 쪽이 같은 수면 가장 먼저 나온 값을 기준으로 한다. 또한 **다른 노드는 `classPattern`이 있는데 스타일이 있는 노드가 없으면** 위반. 아무 노드도 `classPattern`이 없으면 걸지 않는다.
- 이유: 설계도에 "프로젝트 명명 규칙"을 담는 필드가 없어 설계도 안의 일관성만 본다.

## 6. 화면
- `StructurePanel` 맨 아래 카드를 `CheckResults`로 교체. 제목 "검사 결과 · 오류 N · 경고 N · 정보 N", 아래에 오류·경고·정보 묶음(개수 0이면 묶음 생략). 항목: 규칙 id, 메시지, 관련 노드 이름 버튼. 노드 이름 버튼을 누르면 `requestSelect(id)`(틀린 입력이 있으면 기존 확인을 거침).
- 위반이 없으면 "발견된 문제가 없습니다".
- 설계도가 없으면: 가운데 카드의 기존 안내("아직 설계도가 없습니다…")는 그대로 두고, 검사 결과 카드에는 "설계도가 있으면 검사 결과가 표시됩니다"를 둔다(**기존 "다음 단계에서 추가됩니다" 문구는 이제 사실과 다르다. 이대로 바꿔도 되는지 확인 요청**).
- `PreviewCanvas` 상자와 `TreeNodeCard`: 해당 노드에 오류가 있으면 빨강, 없고 경고가 있으면 주황 **실선 테두리**와 글자 표시("오류 2"·"경고 1")를 더하고 `aria-label`에도 넣는다(색만으로 알리지 않음). 정보는 표시하지 않는다. 기존 "AI 가정"의 주황 **점선** 테두리는 그대로 두고, 둘이 겹치면 점선 + 위반 색 + 두 글자 표시를 모두 보인다.
- 위반은 `ViolationsProvider`가 `blueprint`가 바뀔 때만 한 번 계산해 `Map<nodeId, 가장 높은 심각도>`와 목록을 context로 준다(선택만 바뀔 때는 다시 계산하지 않음).
- 화면 코드는 규칙 판단을 다시 하지 않는다. 심각도·메시지는 모두 `core/rules` 결과를 쓴다.

## 7. 성공 기준 (검증 방법)
1. `npm test`: 규칙마다 걸리는 경우·안 걸리는 경우(경계값 포함), 스택에 맞지 않는 규칙이 돌지 않음(예: react 스택에서 NX 없음), 입력 설계도를 바꾸지 않음.
2. `core/schema/sample-blueprint.json`(next + css-modules + fsd)에서 **오류 0건**. 나오면 원인을 보고하고 샘플·규칙 중 어느 쪽 문제인지 판단받는다(임의로 샘플을 고치지 않는다).
3. 회귀 테스트: 위 응답 파일에서 NX-04가 T-t 4·T-l 3·B-t 5건, AR-02가 T-l 4건 나오는지 확인(채점 기록과 다르면 원인 보고).
4. 변이 실험(Edit 도구로 소스를 바꿔 테스트가 실패하는지 확인하고 원복, `grep -c`로 잔존 확인): NX-04(조상 탐색을 부모만 보게, `server`→`client` 조건 반전), R-02(이름 비교를 지움, 범용 이름 예외를 항상 적용), R-04(`dataFetch` 조건 제거, `kind` 조건 제거). 모두 테스트가 실패해야 한다.
5. 성능: 노드 200개(편집 계획 때 쓴 것과 같은 형태) 설계도에서 `checkBlueprint` 1회를 워밍업 후 200회 측정해 중앙값·p95를 `tasks/plan-structure-rules.md`에 기록. 시간 기준은 테스트에 넣지 않는다.
6. `npx tsc --noEmit`(커밋 전 먼저), `npm run lint`, `npm run build`.
7. 브라우저(사용자 확인): 오류·경고가 있는 설계도에서 묶음·개수·항목 클릭 선택·미리보기와 트리의 표시, 편집하면 결과가 바로 바뀜. 코드 작성자는 로그인 화면을 직접 열 수 없어 서버 렌더링 스모크 테스트로 구성만 확인한다.

## 8. 계획 (순서·의존, 각 단계 끝에 vitest·tsc 결과 보고, 커밋은 기능 단위)

```
V0 타입·run·정렬 ─ V1 NX(next 어댑터) ─ V2 공통 R-01~R-08 ─ V3 스타일 어댑터 ─ V4 FSD 어댑터 ─ V5 화면 ─ V6 회귀·변이·성능 ─ V7 문서
```
- [ ] V0 `core/rules/types.ts`, `run.ts`(어댑터 합치기·정렬), 어댑터 인덱스. 검증: vitest(정렬·스택별 선택).
- [ ] V1 `adapters/framework/next.ts` NX-04 → NX-03 → NX-01 → NX-02. 검증: vitest.
- [ ] V2 `core/rules/common/` R-04 → R-07 → R-08 → R-01 → R-06 → R-02 → R-03 → R-05(공통 규칙 파일 하나당 테스트). 검증: vitest. R-02·R-03·R-05는 판정 기준 승인 후에만.
- [ ] V3 `adapters/styling/` CM-01, TW-01, TW-02, HC-01. 검증: vitest.
- [ ] V4 `adapters/architecture/fsd.ts` AR-01~03. 검증: vitest.
- [ ] V5 `ViolationsProvider`, `CheckResults`, 미리보기·트리 표시. 검증: 서버 렌더링 스모크 테스트 + 브라우저(사용자).
- [ ] V6 샘플 오류 0건, 회귀 테스트, 변이 실험 3개 규칙, 200개 노드 측정. 검증: vitest + 측정 기록.
- [ ] V7 `CLAUDE.md`(폴더 구조 `core/rules`·`core/adapters` 현황, 규칙 표에 R-08), `data-model.md`(5절 표·상세, 변경 이력), 개발 일지.

일정이 밀리면 줄이는 순서(뒤에서부터): V4 → V3의 HC-01·TW-02 → R-05·R-03. V0·V1·V2 일부·V5는 줄이지 않는다.

## 9. 경계
- 항상: 규칙은 `core/rules`·어댑터의 순수 함수, 규칙마다 걸리는/안 걸리는 테스트, 커밋 전 `tsc`, 파일은 Write·Edit로만 작성, 서버 확인이 필요하면 3000이 아닌 포트의 PID만 종료.
- 먼저 물어봄: 새 패키지(지금은 필요 없음), 스키마 변경(필요 없음), 범용 UI 상태 이름 목록·R-05 임계값 같은 상수의 큰 변경.
- 안 함: AI 호출, 위반 저장, 규칙 켜기·끄기, 기존 어댑터·공통 규칙 동시 수정, 샘플 설계도 임의 수정.

## 10. 열린 질문 (답을 주세요)
1. 새 규칙 id를 **R-08(페이지 위치)**로 해도 되나요?
2. 5-2의 판정 기준(NX-02, R-02, R-03, R-05, TW-02, HC-01)을 승인하시나요? 특히 R-02의 "범용 UI 상태 이름은 조상-자손일 때만" 예외와 R-05의 임계값(이름 0.5, 책임 0.4).
3. R-06에 `margin*` 속성 판정을 더해도 되나요(스키마 필드 `ownsOuterSpacing`만 쓰는 안도 가능)?
4. 설계도가 없을 때 검사 결과 카드의 문구를 6절처럼 바꿔도 되나요?
5. 위반 표시가 AI 가정의 주황 점선과 겹칠 때 6절 방식(점선 유지 + 위반 색 + 글자)으로 괜찮은가요?

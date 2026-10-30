# AgentBlueprint 데이터 모델 (스키마 기준 문서)

이 문서는 `core/schema/`(프로젝트 루트 기준, src/ 미사용)의 Zod 스키마를 작성할 때 기준이 되는 데이터 모델이다.
기획서 6.4(ERD), 5.2(스펙 입력 항목), 5.3(구조 검사 규칙)을 스키마 관점으로 정리했다.
필드명은 이 문서와 동일하게 맞추고, 임의로 바꾸지 않는다. 스키마 관련 내용은 이 문서가 기준(single source of truth)이다.

## 0. 공통 원칙

- 모든 최상위 객체에는 `version` 필드를 둔다. 현재 값은 `"1.2"` (C안 레이아웃·속성 매핑 + 디렉토리 구조·파일 위치).
- 설계도 트리의 **원본은 평면 배열 + parentId**다. 저장 데이터에 중첩 `children` 배열은 두지 않는다.
  - 드래그로 부모를 바꿀 때 `parentId` 하나만 고치면 되고, 하위 노드는 자동으로 함께 이동한다.
  - 루트 노드는 `parentId: null`이며, 설계도마다 정확히 1개만 존재한다.
- 부모가 자식 목록을 가진 트리 형태는 `buildTree()`로 계산해 쓰는 보기(view)이며 저장하지 않는다 (6절).
- 같은 부모를 가진 형제 노드의 순서는 `order`로 표현한다.
- **배치 책임은 부모에게 있다.** 자식을 어떻게 놓을지(flex/grid, 방향, 열 수, 간격)는 부모의 `layout`에 적고,
  자식은 부모 그리드 안에서 차지할 칸(`placement`)만 적는다. 자식끼리의 간격은 부모 `layout.gap`으로만 준다.
- 같은 정보는 한 곳에만 기록한다. 배치 관련 CSS(`display`, `flex-direction`, `grid-template-columns`, `gap` 등)는
  `layout`에만 쓰고 `style.properties`에는 쓰지 않는다.
- 검사 규칙(R-01 등)의 기준값은 스키마에 넣지 않는다. 스키마는 "형식"만, 규칙은 `core/rules`에서 판단한다.

## 1. Blueprint (설계도)

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| version | `"1.2"` | O | 스키마 버전 |
| title | string | O | 화면 이름 (예: "상품 상세") |
| stack.framework | `"html" \| "react" \| "next"` | O | 프레임워크 |
| stack.styling | `"css" \| "css-modules" \| "tailwind"` | O | 스타일 방식 |
| stack.architecture | `"type-based" \| "feature-based" \| "fsd"` | O | 디렉토리 구조 방식 (유형 중심 / 기능 중심 / FSD) |
| route | string \| null | O | 이 화면의 URL 경로 (예: "/products/[id]"). 라우팅이 없는 설계면 null |
| source.hasSpec | boolean | O | 스펙 텍스트 입력 여부 |
| source.imageCount | number (0~3) | O | 첨부 이미지 수 |
| generatedBy | `"ai" \| "user"` | O | 마지막 수정 주체 |
| nodes | ComponentNode[] | O | 1개 이상, 평면 배열 |

검증 조건:
- `source.hasSpec`이 false이고 `source.imageCount`가 0이면 오류 (입력 최소 조건).
- `parentId: null`인 노드는 정확히 1개. 모든 `parentId`는 같은 `nodes` 안의 `id`를 가리킨다.
- 모든 노드는 루트에서 parentId를 따라 도달할 수 있어야 한다. 루트와 연결되지 않은 노드 묶음이나 순환(A의 부모가 B, B의 부모가 A)은 거부한다.
- `id`와 `name`은 설계도 안에서 각각 고유하다 (이름 중복 금지).

## 2. ComponentNode (컴포넌트 노드)

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| id | string | O | 설계도 내 고유 id. 이름을 바꿔도 변하지 않는다 |
| name | string | O | 컴포넌트·훅 이름. 설계도 내 고유 |
| parentId | string \| null | O | 부모 노드 id, 루트는 null |
| order | number | O | 같은 부모 아래 형제 순서 (0부터 시작하는 정수) |
| location | LocationSpec | O | 이 노드의 파일이 위치할 폴더 (디렉토리 구조 방식에 따라 형식이 다름, 2-1절) |
| kind | `"page" \| "container" \| "presentational" \| "hook"` | O | 노드 성격 |
| responsibilities | string[] | O | 책임 목록, 최대 5개 |
| state | StateItem[] | O | 이 노드가 소유하는 상태 |
| props | PropItem[] | O | 부모에게서 받는 값 |
| events | string[] | O | 처리하는 사용자 이벤트 (예: "onClick") |
| dataFetch | boolean | O | API 호출 책임 여부 |
| renderMode | `"server" \| "client" \| null` | O | Next.js에서만 값 지정, 그 외 스택·훅은 null |
| layout | LayoutSpec \| null | O | **이 노드가 자식(또는 내부 요소)을 배치하는 방식.** 렌더링되는 자식 노드가 있으면 필수, 자식 노드가 없어도 내부 목록·버튼 등을 배치하면 적을 수 있다. 훅은 null |
| placement | PlacementSpec \| null | O | **부모 그리드 안에서 이 노드가 차지하는 칸.** 기본 배치면 null |
| style | StyleSpec \| null | O | 이 노드 자신의 모양. 훅은 null |
| assumed | boolean | O | AI가 입력 없이 채운 값이 있으면 true |
| assumedFields | string[] | X | 가정으로 채운 필드명 목록 |

`kind` 값의 의미: `page` 화면 단위 최상위, `container` 상태·데이터를 다루고 하위에 전달,
`presentational` 받은 값을 표시만 함(R-04 판단 기준), `hook` 화면에 그려지지 않는 로직 단위.

이름 형식:
- 컴포넌트(`kind`가 hook이 아닌 노드): PascalCase, 정규식 `^[A-Z][A-Za-z0-9]*$`
- 훅: `use` + PascalCase, 정규식 `^use[A-Z][A-Za-z0-9]*$`

검증 조건:
- `order`는 0 이상의 정수이며, 같은 `parentId`를 가진 형제끼리 겹치지 않는다. 루트의 `order`는 0.
- `kind`가 `hook`이면 `layout`, `placement`, `style`, `renderMode`는 null이고 `events`는 빈 배열. 훅은 자식을 갖지 않는다.
- `stack.framework`가 `next`가 아니면 모든 노드의 `renderMode`는 null.
  `next`이고 `kind`가 hook이 아니면 `renderMode`는 null이 아니어야 한다.
- `placement`가 null이 아니면 부모의 `layout.display`는 `grid`여야 한다.
- 훅이 아닌 자식 노드를 1개 이상 가진 노드는 `layout`이 null이면 안 된다 (배치 책임은 부모에게 있으므로).

### 2-1. LocationSpec (파일 위치)

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| dir | string | O | 파일이 들어갈 폴더. 슬래시로 시작하지 않는 상대 경로, 폴더명은 kebab-case |

`dir`의 기준 위치와 형식은 `stack.architecture`에 따라 다르다.

| 구조 방식 | 기준 위치 | 형식 | 예시 |
| --- | --- | --- | --- |
| type-based | 프로젝트 루트 | 자유 (보통 `components`, `hooks`, `lib` 등 유형별 폴더) | `components`, `hooks` |
| feature-based | 프로젝트 루트 | `features/<기능>/<폴더>` 또는 공용 폴더 | `features/cart/components`, `components/common` |
| fsd | FSD 루트 (2-2절) | `<계층>/<슬라이스>/<세그먼트>` 또는 `<계층>/<세그먼트>` | `features/add-to-cart/ui`, `shared/ui` |

FSD 형식 검증 (스키마에서 판단):
- 계층(layer)은 위에서 아래 순서로 `app` → `pages` → `widgets` → `features` → `entities` → `shared` 중 하나.
- `pages`, `widgets`, `features`, `entities`는 슬라이스가 필수: `^(pages|widgets|features|entities)/[a-z0-9]+(-[a-z0-9]+)*/(ui|model|api|lib|config)$`
- `app`, `shared`는 슬라이스 없이 세그먼트만: `^(app|shared)/(ui|model|api|lib|config)$`
- 세그먼트 의미: `ui` 화면 컴포넌트, `model` 상태·훅·비즈니스 로직, `api` 서버 통신, `lib` 보조 함수, `config` 설정값.

### 2-2. Next.js + FSD 조합의 배치 규칙

Next.js의 라우팅 폴더(`app/`, `pages/`)와 FSD의 `app`·`pages` 계층 이름이 겹친다. `stack.framework`가 `next`이고
`stack.architecture`가 `fsd`이면 아래 배치를 따르며, 구조 어댑터가 이 규칙을 지시서에 자동으로 포함한다.

```
(사용자 프로젝트 루트)/
  app/            # Next.js App Router. 라우팅 파일만 두고, src/pages의 화면을 가져와 내보낸다(re-export)
  pages/          # 비어 있는 폴더(.gitkeep). Next.js가 src/pages를 Pages Router로 오해하지 않게 함
  src/            # FSD 루트. 모든 location.dir은 이 폴더 기준
    app/  pages/  widgets/  features/  entities/  shared/
```

- `route`가 있는 설계도는 지시서에 "`app/<route>/page.tsx`는 `src/pages/<슬라이스>`의 화면을 re-export만 한다"를 포함한다.
- 미들웨어는 루트(`app/`, `pages/`와 같은 위치)에 둔다.
- import 별칭은 `@/*` → `./src/*`를 권장하며, 지시서에 함께 적는다.
- 이 규칙은 AgentBlueprint를 쓰는 **사용자 프로젝트**의 구조이며, AgentBlueprint 자체 저장소(src/ 미사용)와는 무관하다.

### StateItem / PropItem

| 객체 | 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- | --- |
| StateItem | name | string | O | 상태 이름 (예: "cartCount") |
| StateItem | description | string | X | 상태의 의미 |
| PropItem | name | string | O | prop 이름 |
| PropItem | type | string | O | TypeScript 타입 표기 (예: "number", "Product") |

### LayoutSpec (부모의 배치 규칙)

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| display | `"block" \| "flex" \| "grid"` | O | 배치 방식 |
| direction | `"row" \| "column"` | X | flex일 때만. 가로(row) 또는 세로(column) |
| columns | 정수 (1~12) | X | grid일 때만. 열 수 |
| gap | string \| null | O | 자식 사이 간격 토큰 (예: "spacing.4"). 간격이 없으면 null |
| align | `"start" \| "center" \| "end" \| "stretch"` | X | 교차축 정렬 |
| justify | `"start" \| "center" \| "end" \| "between"` | X | 주축 정렬 |
| responsive | ResponsiveOverride[] | X | 화면 크기별로 바뀌는 값 |

ResponsiveOverride: `breakpoint`(`"mobile" \| "tablet" \| "desktop"`, 필수), `direction`(선택), `columns`(선택).
breakpoint의 실제 너비는 스펙 ③ 레이아웃·반응형 항목을 따른다.

**반응형 기준(데스크톱 우선)**: 설계도의 기본 `layout`은 **데스크톱 기준**이고, `responsive`는 **태블릿·모바일에서 바뀌는 값**이다. 모바일은 태블릿 값을 이어받아 그 위에 모바일 값을 덮어쓴다(`desktop` 항목이 있으면 데스크톱의 기본값을 덮어쓴다). 기본값과 같은 값은 적지 않는다. 지시서 생성 시 Tailwind 스택이면 모바일 우선(`min-width`) 클래스로 변환해야 한다.

검증 조건:
- `display`가 `flex`이면 `direction` 필수, `columns` 금지.
- `display`가 `grid`이면 `columns` 필수, `direction` 금지.
- `display`가 `block`이면 `direction`, `columns` 모두 금지.
- `responsive`의 값도 같은 규칙을 따른다 (flex는 direction만, grid는 columns만).

### PlacementSpec (부모 그리드 안의 자리)

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| span | 정수 (1~12) \| `"full"` | O | 차지할 열 수. `"full"`이면 한 줄 전체. 숫자면 부모 `layout.columns` 이하여야 한다 |

### StyleSpec (노드 자신의 모양)

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| scope | `"global" \| "module" \| "utility"` | O | CSS 전역 / CSS Modules / Tailwind 유틸리티 |
| properties | StyleProperty[] | O | 속성별 값 목록 (빈 배열 가능) |
| ownsOuterSpacing | boolean | O | 바깥 여백(margin 등)을 스스로 가지는지 (R-06 판단 기준) |
| classPattern | string | X | 클래스 명명 규칙 (예: "BEM") |

StyleProperty:

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| property | string | O | CSS 속성 이름, kebab-case (예: "background-color") |
| value | string | O | 토큰 이름(예: "color.primary") 또는 직접 쓴 값(예: "#333") |
| isToken | boolean | O | value가 디자인 토큰이면 true |

검증 조건:
- `property`는 kebab-case(`^[a-z]+(-[a-z]+)*$`)이며, 한 노드 안에서 같은 `property`가 두 번 나오지 않는다.
- 배치 속성(`display`, `flex-direction`, `grid-template-columns`, `gap`, `row-gap`, `column-gap`,
  `justify-content`, `align-items`, `grid-column`)은 `properties`에 쓸 수 없다. `layout`·`placement`에 쓴다.
- `isToken: false`인 값은 허용하되 검사 규칙(TW-01, 하드코딩 값 검사)의 대상이 된다.

## 3. SpecInput (스펙 7개 항목)

모든 항목은 선택이며 자유 텍스트다. 7개 중 1개 이상 또는 이미지 1장 이상이 필요하다.

| 필드 | 대응 항목 | 필드 | 대응 항목 |
| --- | --- | --- | --- |
| overview | ① 화면 개요 | stateData | ⑤ 상태·데이터 |
| tokens | ② 디자인 토큰 | accessibility | ⑥ 접근성 |
| layout | ③ 레이아웃·반응형 | constraints | ⑦ 금지·제약 사항 |
| componentRules | ④ 컴포넌트 규칙 | | |

추가 필드: `version: "1.2"`, `imageCount: number (0~3)`.
검증 조건: 7개 필드가 모두 비어 있고 `imageCount`가 0이면 오류.

## 4. DesignSystemSpec (디자인 시스템 스펙, 기능 B, 2순위)

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| version | `"1.2"` | O | |
| components | DSComponent[] | O | 공식 공통 컴포넌트 목록 |
| tokens | DSTokens | O | 토큰 그룹별 키-값 |

### DSComponent

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| name | string | O | PascalCase, 스펙 내 고유 |
| variants | string[] | O | 소문자 kebab-case (예: `primary`, `outline-large`), 빈 문자열·중복 금지 |
| props | `{ name, type, required }[]` | O | `name`은 컴포넌트 내 고유, `type`은 TypeScript 타입 표기 자유 문자열(빈 문자열 금지), `required`는 boolean |

### DSTokens

토큰 그룹 이름은 설계도의 토큰 참조(`그룹.키`) 앞부분과 같은 **단수형**을 쓴다.

| 그룹 | 필수 | 예시 |
| --- | --- | --- |
| color | O (키 1개 이상) | `{ "primary": "#2563EB" }` |
| spacing | O (키 1개 이상) | `{ "4": "16px", "6": "24px" }` |
| radius | X (있으면 키 1개 이상) | `{ "md": "8px" }` |
| font | X (있으면 키 1개 이상) | `{ "title": "24px" }` |
| layout | X (있으면 키 1개 이상) | `{ "maxWidth": "1200px" }` |

- 토큰 키에는 `.`을 쓸 수 없다 (참조 형식 `그룹.키`와 충돌).
- 토큰 값은 1자 이상이어야 한다 (빈 문자열 금지).
- 값 형식(색이 hex인지 등)은 스키마에서 강제하지 않는다. 필요하면 검사 규칙에서 다룬다.
- 토큰 참조 규칙: 설계도의 `color.primary`는 `tokens.color.primary`를 가리킨다.
- 예시 파일 정본 위치: `core/schema/sample-design-system.json`

## 5. 검사 규칙과 필드 대응

| 규칙 | 판단에 쓰는 필드 |
| --- | --- |
| R-01 책임 과다 | `responsibilities.length` |
| R-02 상태 중복 | 여러 노드의 `state[].name` |
| R-03 props 과다 전달 | 부모-자식 연쇄의 `props[].name` |
| R-04 데이터 요청 위치 | `kind === "presentational"` && `dataFetch === true` |
| R-05 재사용 후보 | `name`, `responsibilities` 유사도 |
| R-06 레이아웃 책임 | 자식 노드의 `style.ownsOuterSpacing` (간격은 부모 `layout.gap`으로 줘야 함) |
| R-07 데이터 요청 노드 부재 | 설계도 전체 `nodes` 중 `dataFetch === true`인 노드의 수 (0개면 위반) |
| R-08 페이지 위치 | `kind === "page"` && `parentId !== null` |
| CM-01 스타일 범위 | `style.scope === "global"` (CSS Modules 스택에서) |
| TW-01 임의값 | `style.properties[].isToken === false` (Tailwind 스택에서) |
| TW-02 클래스 반복 | 형제 노드들의 `style.properties` 조합 반복 |
| HC-01 클래스 명명 | `style.classPattern` |
| NX-01 클라이언트 경계 | (`state` 또는 `events` 존재) && `renderMode === "server"` |
| NX-02 경계 범위 | 상위 노드의 `renderMode === "client"` 여부 |
| NX-03 훅 부모 경계 | `kind === "hook"`인 노드의 부모 `renderMode === "server"` |
| NX-04 client 자손 server 금지 | 조상 중 `renderMode === "client"`인 노드가 있는데 자신의 `renderMode === "server"` |
| AR-01 계층 방향 (FSD) | 부모·자식의 `location.dir` 계층 순서. 자식은 부모와 같거나 더 아래 계층이어야 함 |
| AR-02 같은 계층 교차 (FSD) | 부모·자식이 같은 계층(pages·widgets·features·entities)인데 슬라이스가 다르면 위반 |
| AR-03 세그먼트·역할 불일치 (FSD) | `kind`와 세그먼트 대응: page는 `pages` 계층, hook은 `model`·`api`·`lib`, 화면 컴포넌트는 `ui` |

### FSD 검사 규칙 상세

| 규칙 | 적용 조건 | 판단 | 심각도 |
| --- | --- | --- | --- |
| AR-01 계층 방향 | architecture = fsd | 자식 계층 순번 < 부모 계층 순번이면 위반 (위 계층을 가져오는 것). 순번: app 0, pages 1, widgets 2, features 3, entities 4, shared 5 | 오류 |
| AR-02 같은 계층 교차 | architecture = fsd | 부모·자식 계층이 같고 그 계층이 pages·widgets·features·entities 중 하나이며 슬라이스가 다르면 위반. app·shared는 슬라이스가 없어 제외 | 오류 |
| AR-03 세그먼트·역할 불일치 | architecture = fsd | `kind: page`인데 pages 계층이 아님 / `kind: hook`인데 세그먼트가 model·api·lib가 아님 / 훅이 아닌데 세그먼트가 ui가 아님 | 경고 |

설계도의 "부모가 자식을 포함한다"는 실제 코드에서 "부모 파일이 자식 파일을 import한다"에 해당하므로,
FSD의 import 방향 규칙을 코드 없이 트리만으로 검사할 수 있다. 같은 계층·같은 슬라이스 안의 부모·자식은 허용한다.

### 초안 생성 테스트로 추가된 검사 규칙 상세

| 규칙 | 적용 조건 | 판단 | 심각도 |
| --- | --- | --- | --- |
| R-07 데이터 요청 노드 부재 | 모든 스택 | `nodes` 전체에 `dataFetch: true`인 노드가 하나도 없으면 위반 (표시 노드가 받는 데이터의 출처가 설계도에 없음) | 경고 |
| NX-03 훅 부모 경계 | framework = next | `kind: hook`인 노드의 부모가 `renderMode: "server"`이면 위반 (훅은 클라이언트에서만 동작하므로 부모가 client여야 함) | 오류 |
| NX-04 client 자손 server 금지 | framework = next | 조상 중 `renderMode: "client"`인 노드가 있는데 자신이 `"server"`이면 위반. `renderMode`가 null인 훅은 대상이 아님 | 오류 |

- 설계도의 부모-자식은 import 관계이므로, client 파일이 불러온 컴포넌트는 server로 남을 수 없다(NX-04). 같은 이유로 훅은 client 노드가 불러야 한다(NX-03).
- 결과 목록의 표시 우선순위: NX-04 > NX-03 > R-07.

### 구현 기준 (구조 검사, `core/rules`·`core/adapters`)

결과는 `{ ruleId, severity, nodeIds, message }`이며 저장하지 않고 설계도가 바뀔 때마다 계산한다. 정렬은 오류 → 경고 → 정보, 같은 심각도 안에서 NX-04·NX-03·R-07 우선 후 규칙 id 순, 같은 규칙 안에서는 트리 순서. 스택 전용 규칙은 어댑터가 묶는다(next: NX, css·css-modules·tailwind: HC·CM·TW, fsd: AR).

| 규칙 | 구현한 판정 |
| --- | --- |
| R-08 (경고) | 루트가 아닌 노드의 `kind`가 `page`. 편집 화면은 막지만 AI 초안에서 생길 수 있다 |
| NX-02 | 가장 위의 client 노드(client 조상 없음)가 자기 필요(`state`·`events`·훅 자식)가 없으면 경고. client 조상 아래의 client는 대상이 아니다 |
| R-02 | `state[].name`을 공백 제거·소문자로 비교해 같은 이름이 서로 다른 2개 이상 노드에 있으면 위반. `isOpen`·`open`·`loading`·`isLoading`·`error`·`value`·`hovered`·`focused`·`visible`은 조상-자손 관계일 때만 위반 |
| R-03 | 같은 이름의 prop(`children`·`className`·`key` 제외, 훅 제외)을 부모-자식 사슬로 3개 이상 노드가 연속 선언하면 위반. 이어진 노드 묶음 1건 |
| R-05 | 훅이 아니고 조상-자손이 아닌 두 노드의 이름 단어(PascalCase 분리) Jaccard ≥ 0.5 **그리고** 책임 문장 글자 2-gram Dice ≥ 0.4. 이어진 후보는 묶음 1건. 임계값은 `relations.ts` 상수 |
| R-06 | 루트가 아닌 노드의 `ownsOuterSpacing === true`, 또는 `margin` 계열 속성. 가로 방향(`margin`·`margin-inline*`·`margin-left`·`margin-right`)의 `auto`(와 0)뿐인 값은 가운데 정렬 용도라 제외 |
| TW-02 | (속성, 값) 쌍이 2개 이상이고 완전히 같은 집합이 3개 이상 노드에 있으면 1건 |
| HC-01 | 설계도 안에서 `classPattern`이 일관되지 않을 때: 가장 많이 쓰인 값(같으면 트리에서 먼저 나온 값)과 다른 노드, 값이 있는 노드가 있는데 스타일이 있고 값이 없는 노드. 아무 노드도 값이 없으면 걸지 않는다 |
| AR-03 | `page`는 계층만(pages) 본다. 훅은 세그먼트 model·api·lib, 그 밖의 노드는 ui |
- 근거: `tasks/draft-test-result.md`의 채점 사례 C1(client 아래 server 자식), C2(server 아래 훅), C6(조회 노드 부재). 이 사례들은 모두 스키마 검증을 통과했다.

## 6. 트리 변환과 노드 편집 규칙

### 트리 변환 (평면 → 트리)

`core/schema/tree.ts`의 `buildTree(nodes)`가 평면 배열을 받아 각 노드에 `children`(order 순)을 붙인 트리를 반환한다.
이 `children`은 계산 결과이며 저장하지 않는다. 사용처: 트리 화면, R-03·NX-02 같은 연쇄 검사, 지시서의 계층·배치 문장 생성.

### 노드 이동 (드래그로 부모·순서 변경)

| 규칙 | 내용 |
| --- | --- |
| 루트 보호 | 루트 노드는 이동할 수 없다 |
| 순환 방지 | 새 부모가 자기 자신이거나 자손이면 거부 |
| 훅 부모 금지 | `kind: "hook"`인 노드는 새 부모가 될 수 없다 |
| 순서 재정렬 | 옛 부모·새 부모의 형제 `order`를 0부터 다시 매긴다 |
| 자리 초기화 | 새 부모가 grid가 아니거나 `span`이 새 부모의 열 수보다 크면 이동한 노드의 `placement`를 null로 바꾼다 |
| 위치 유지 | 이동해도 `location`은 바꾸지 않는다 (파일은 그대로). 이동 결과가 AR-01·AR-02를 어기면 검사에서 표시 |

이동하면 해당 노드의 `parentId`, `order`, (필요 시) `placement`와 영향받은 형제의 `order`만 바뀐다. 하위 노드는 수정하지 않는다.

### 이름·스타일·레이아웃 변경

| 변경 | 바뀌는 필드 | 확인할 것 |
| --- | --- | --- |
| 이름 변경 | `name`만 (`id`는 그대로) | 중복 금지, 이름 형식 |
| 스타일 속성 변경 | `style.properties` | 배치 속성 금지, 같은 property 중복 금지 |
| 배치 방식 변경 | `layout` | grid → flex로 바꾸면 자식들의 `placement`를 null로 초기화 |
| 그리드 내 자리 변경 | `placement` | 부모가 grid인지 |
| 파일 위치 변경 | `location.dir` | 구조 방식의 형식, FSD면 AR-01~AR-03 |
| 디렉토리 구조 변경 | `stack.architecture` + 모든 노드의 `location` | 구조 어댑터가 `kind` 기준으로 새 위치를 추천하고 사용자가 확인 후 적용 |

모든 변경 후에는 구조 검사(F-007)를 다시 실행한다.

### 편집 연산 규칙 (구현: `core/edit`)

노드 편집(내용 수정, 부모 변경, 순서 변경, 자식 추가, 삭제)은 `core/edit`의 순수 함수로만 한다. 연산은 결과 전체를 `BlueprintSchema`로 검증해 통과한 것만 새 설계도로 돌려주고, 실패하면 거부 이유(와 노드·경로)를 돌려준다. 편집이 반영되면 `generatedBy`는 `"user"`가 되고, 값이 그대로면 설계도도 `generatedBy`도 바뀌지 않는다. 스키마가 이미 막는 규칙(이름 고유·형식, 훅 제약, placement는 부모가 grid일 때만, 순환 금지, 스타일 배치 속성 금지·중복 금지 등)은 위 절들을 따르고, 아래는 편집 연산이 추가로 정한 규칙이다.

| 규칙 | 내용 |
| --- | --- |
| 페이지 종류는 루트만 | `kind`를 `page`로 바꾸는 편집은 루트 노드에서만 허용하고 루트가 아닌 노드는 거부한다. 스키마는 막지 않는다(AI 초안에 있는 루트가 아닌 `page`는 검사 규칙에서 다룬다). 이미 `page`인 루트가 아닌 노드의 다른 필드 편집과 `page`에서 벗어나는 변경은 막지 않는다 |
| 훅↔컴포넌트 전환 금지 | `kind`를 훅에서 컴포넌트로, 컴포넌트에서 훅으로 바꾸는 편집은 거부한다(훅은 `layout`·`style`·`renderMode`·`events`·자식 제약이 달라서). 새 노드로 추가한다 |
| 배치가 비어 있으면 채움 | 훅이 아닌 자식을 새로 받는 노드(자식 추가, 다른 노드를 옮겨 옴)의 `layout`이 null이면 세로 flex(`direction: "column"`, `gap: null`)로 채우고, 채웠다는 사실을 결과(`filledLayout`)로 알려 화면이 안내한다. 훅만 받을 때는 채우지 않는다 |
| client 아래는 client | Next.js에서 새 노드를 추가하면 부모를 포함한 조상 중 `client`가 있을 때 `client`, 없으면 `server`로 정한다. 노드를 `client` 조상 아래(새 부모 포함)로 옮기면 옮긴 노드와 자손 중 `server`를 `client`로 바꾸고(훅은 null이라 제외) 바꾼 노드를 결과(`toClient`)로 알린다. `client` 밖으로 옮길 때는 되돌리지 않는다. 근거는 NX-04(client가 불러온 컴포넌트는 server일 수 없다) |
| 배치 방식 전환 | 방식을 바꾸면 새 방식에 맞는 `direction`(기본 row)·`columns`(기본 2)를 채우고 맞지 않는 값과 `responsive`를 버린다. 간격·정렬은 유지한다. grid에서 다른 방식(또는 배치 없음)으로 바꾸면 자식들의 `placement`를 모두 null로 비운다. 화면은 변경 전에 "자식 N개의 차지 칸과 반응형 설정이 초기화됩니다" 확인을 보인다 |
| 열 수 줄이기 | 자식의 `span`이 새 열 수보다 크면 거부한다(자식 이름을 이유에 적는다). 자식의 차지 칸이 모두 `"full"`이면 줄일 수 있다 |
| 이동·삭제 뒤 차지 칸 | 이동한 노드, 또는 "자식을 상위로 옮기고 삭제"로 옮겨진 자식의 `placement`는 새 부모가 grid이고 `span`이 열 수 이하일 때만 남기고 아니면 null로 비운다. 옮겨진 자식은 삭제된 노드가 있던 자리에 순서대로 들어간다. 이동·삭제 뒤 옛·새 부모의 형제 `order`는 0부터 다시 매긴다 |
| 새 노드 기본값 | 이름은 `NewComponent`(겹치면 숫자를 붙임), 종류 `presentational`, 위치는 부모와 같은 폴더, `layout`·`placement`·`style`은 null, 책임·상태·props·이벤트는 빈 배열, `dataFetch` false |
| AI 가정 표시 | 사용자가 고친 필드는 `assumedFields`에서 뺀다. 목록이 비면 `assumed`를 false로 바꾸고 `assumedFields`를 지운다. 가정한 필드 목록이 없는 `assumed: true`는 어느 필드인지 알 수 없어 그대로 둔다 |
| 훅 자식·루트 | 훅 아래에는 자식을 추가할 수 없고, 루트는 이동·삭제·순서 변경을 할 수 없다. 삭제는 자식이 있으면 "자식과 함께 삭제"나 "자식을 상위로 옮기고 삭제"를 고른다 |

## 7. 지시서에 들어가는 배치 문장 (예시)

`layout`과 `placement`는 지시서에서 부모 단위 문장으로 바뀐다.

> ProductDetailPage는 자식을 2열 그리드로 배치한다(간격 spacing.6). 순서는 ProductGallery, ProductInfo, ReviewSummary이며 ReviewSummary는 한 줄 전체를 차지한다. 모바일에서는 1열로 쌓는다.
> ProductInfo는 자식을 세로 flex로 배치한다(간격 spacing.4). 자식 컴포넌트는 바깥 margin을 갖지 않는다.

파일 위치는 지시서의 "파일 위치" 섹션이 된다 (Next.js + FSD 예).

> FSD 계층은 src/ 아래에 둔다. app/products/[id]/page.tsx는 src/pages/product-detail의 화면을 re-export만 한다. 루트에 빈 pages/ 폴더를 둔다.
> ProductDetailPage → src/pages/product-detail/ui, AddToCartButton → src/features/add-to-cart/ui, useCart → src/features/add-to-cart/model

## 8. 기획서 대비 변경 이력

- v1.0: `kind`, `events`, `order`, `style.ownsOuterSpacing` 추가, `state`·`props` 객체 배열화, 평면 배열 + parentId 확정, 노드 이동 규칙
- v1.1 (C안): `layout`(부모의 배치 규칙), `placement`(그리드 내 자리) 추가, `style.tokens`·`rawValues`를 `style.properties`(속성-값-토큰 여부)로 통합, 이름 고유·형식 검증 추가
- v1.2 보완 (DS): 토큰 그룹 단수형(color·spacing·radius·font·layout), color·spacing 필수·키 1개 이상, 선택 그룹도 있으면 키 1개 이상, variant kebab-case, props type 자유 문자열
- v1.2 보완: `columns`·`span`을 정수 1~12로 제한, `span`은 부모 열 수 이하, 루트에서 도달할 수 없는 노드·순환 거부
- v1.2 보완 (테스트 결과 반영): 검사 규칙 NX-03, NX-04, R-07 추가(스키마 필드 변경 없음, version 유지). OpenAI 호출 타임아웃 기준을 텍스트만 45초·이미지 포함 60초로 조정(CLAUDE.md)
- v1.2 보완 (반응형 기준): 기본 `layout`은 데스크톱 기준, `responsive`는 태블릿·모바일에서 바뀌는 값(데스크톱 우선)으로 명시. 스키마 필드 변경 없음, 초안 프롬프트 v3에 같은 기준 추가
- v1.2 보완 (span 규칙): `placement.span`이 부모 `layout.columns`보다 크면 스키마가 거부한다(이전에는 문서에만 있던 규칙). 자동 보정은 span을 부모 열 수로 줄인다. 스키마 필드 변경 없음, version 유지
- v1.2 보완 (노드 편집): 스키마 필드 변경 없음, version 유지. 6절에 편집 연산 규칙 추가(페이지 종류는 루트만, 훅↔컴포넌트 종류 전환 금지, 자식을 받는 노드의 빈 배치를 세로 flex로 채움, client 조상 아래로 옮기거나 추가한 노드는 client, grid에서 배치 방식을 바꾸면 자식 차지 칸 비움, 열 수를 줄일 때 자식 차지 칸이 더 크면 거부, 사용자가 고친 필드는 AI 가정 목록에서 제외). 노드 이동의 자리 초기화에 "span이 새 부모 열 수 초과" 추가
- v1.2 보완 (구조 검사 구현): 스키마 필드 변경 없음, version 유지. 검사 규칙 R-08(루트가 아닌 page, 경고) 추가, 5절에 판정 기준 확정(NX-02·R-02·R-03·R-05·R-06·TW-02·HC-01)
- v1.2: `stack.architecture`(type-based / feature-based / fsd), `route`, 노드 `location` 추가, Next.js + FSD 배치 규칙, FSD 검사 규칙 AR-01~AR-03

위 내용은 기획서(F-001, F-006, F-012, 3.2, 3.3, 4.2, 5.3, 6.4, 일정)와 CLAUDE.md에 반영되었다.
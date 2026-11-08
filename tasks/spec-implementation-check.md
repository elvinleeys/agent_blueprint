# 스펙: 구현 검사 (설계 → 지시 → 구현 → 검증)

> **이 문서는**: 에이전트가 지시서대로 만든 코드가 설계도를 지켰는지 검사하는 "구현 검사" 기능의 스펙이다. 목표, 가정, 만들 파일, 판정 원칙, 단계별 계획을 담는다.
> **목록에 들어 있는 것**: §5 설계 대조표(설계도 필드별 판정 방식), 규칙 번호(공통 IC-01~IC-12, Next.js 전용 ICN-01~04, React 전용 ICR-01, FSD 전용 ICF-01), §7 시험 묶음, §10 단계 계획(0~끝), §11 질문 Q1~Q6.

상태: **승인 대기** (구현 전). 브랜치 `feat/implementation-check`. 이 문서는 0단계 산출물(스펙·계획·설계 대조표·채점 기준표)이다.

## 1. 목표

에이전트가 지시서대로 만든 코드(폴더 업로드)가 설계도를 지켰는지 확인한다.
판정은 코드(`core/`)가 하고, 코드로 확신할 수 없는 것만 AI가 제안하며, 최종 결정은 사람이 한다.
결과는 **확실 → 확인 필요 → AI 제안** 순서로 보여 주고, 확실한 항목과 사용자가 받아들인 확인 필요 항목으로 "수정 지시서"를 만든다.

성공 기준
- 바르게 구현한 시험 코드는 확실 0건·확인 필요 0건.
- 규칙마다 일부러 틀린 코드는 기대한 위반만(다른 규칙이 새로 걸리지 않음).
- 이름만 바꾼 코드는 경고 0건, 확인 필요만 나옴.
- 스택에 맞지 않는 규칙(React 코드의 `"use client"` 등)은 걸리지 않음.
- 디자인 시스템 정리 결과가 분리 전과 완전히 같음(기존 테스트 + `fixtures/demo-cleanup`).
- AI를 꺼도, AI 응답이 스키마 검증에 실패해도 1·2번 결과는 그대로 나옴.

## 2. 가정 (틀리면 알려 주세요)

1. 입력은 디자인 시스템 정리와 같은 **폴더 업로드**(`{path, content}[]`)이고 `.ts/.tsx`만 읽는다. 코드는 저장하지 않는다. 한도는 기존(30개·파일 200KB·합계 1MB)을 재사용하되, 화면 구현이 30개를 넘기 쉬우면 별도 상한을 정하자(질문 Q1).
2. **새 패키지 없음.** TypeScript 컴파일러(이미 dependency)만 쓴다. CSS 파일(`.module.css` 등)은 읽지 않는다(PostCSS, 곧 CSS 파일을 읽어 분석하는 도구를 사용 안 함) → CSS·CSS Modules의 배치·토큰은 전부 "확인 필요"로 보낸다.
3. **DB 마이그레이션 없음.** 기존 표만 읽는다: `prompt_exports.blueprint_id`(지시서가 연결된 판), `blueprints`, `spec_inputs.route`. 결과는 저장하지 않는다. (마이그레이션이 필요해 보이면 멈추고 알린다.)
4. `stack.framework === "html"`은 검사하지 않는다(HTML 프로젝트는 `.tsx` 분석 대상이 아님. 화면 안내 문구 표시).
5. 폴더 경로는 업로드 폴더 이름이 앞에 붙어 있을 수 있어 **접미사 일치**로 대조한다(예: 설계 `features/add-to-cart/ui` ↔ 코드 `my-app/src/features/add-to-cart/ui/AddToCartButton.tsx`).
6. 기준 설계도 = `prompt_exports`에서 이 프로젝트의 가장 최근 기록(`source_type = blueprint`)의 `blueprint_id` 판. 기록이 없으면 최신 판을 쓰고 화면에 "내보낸 기록이 없어 최신 판 N 기준" 표시. 내보낸 판보다 새 판이 있으면 "판 N 기준(지시서를 내보낸 판), 이후 판 M이 있음"도 표시.
7. 화면 주소(route)는 `spec_inputs.route`를 우선하고 없으면 설계도의 `route`(지시서와 같은 기준, data-model 7-2절).

## 3. 명령어

아래는 작업 중 쓰는 명령이다. `npx tsc --noEmit`은 파일을 만들지 않고 타입 오류만 찾는 검사(tsc는 TypeScript 컴파일러)다.

```
npm test                 # vitest run
npx tsc --noEmit         # 커밋 전 먼저
npm run lint
npm run build
npm run dev              # 3000번만 (직접 띄우지 않고, 사용자가 띄운 것 사용)
```

## 4. 구조 (새로 만들 것)

```
core/code-model/            # core/cleanup에서 분리한 코드 분석기 (순수 TS)
  types.ts · parse.ts(기존 extract) · filter-files.ts · imports.ts(상대+@/ 별칭) · facts.ts(새 읽기 항목)
  core/cleanup/는 code-model을 import해서 쓰고, 같은 이름으로 다시 내보내 기존 import 경로·테스트를 안 깨뜨림
core/impl-check/            # 구현 검사 (순수 TS)
  types.ts(Finding: ruleId, severity, certainty, nodeIds, message, evidence)
  match.ts(설계 노드 ↔ 코드 컴포넌트 대응, 후보 찾기)
  similarity.ts(비슷한 이름 판단, 임계값 한 곳)
  run.ts(공통 규칙 + 어댑터 규칙 실행, 정렬)
  rules/common/*.ts
core/adapters/framework/impl-next.ts · impl-react.ts
core/adapters/styling/impl-tailwind.ts · impl-css.ts(css·css-modules 공용 "확인 필요" 보내기)
core/adapters/architecture/impl-fsd.ts
core/prompt/fix-prompt.ts   # 수정 지시서 (템플릿만, AI 없음)
lib/ai/impl-check-ai.ts · lib/api/impl-check-handler.ts
app/api/projects/[id]/implementation-check/route.ts   # 라우팅만
components/implementation-check/ (작업공간 새 탭 "구현 검사")
fixtures/implementation-check/{next,react}/
docs/pr/implementation-check.md
```

어댑터(스택마다 규칙을 따로 담아 두는 파일)는 기존 것을 수정하지 않고 `impl-*` 파일을 추가한다(CLAUDE.md: "새 스택 지원은 어댑터 추가").
`core/`는 React·Next import 금지 유지.

## 4-1. 판정 원칙 (모든 규칙이 따른다)

- **분석기가 실제로 확인한 근거 안에서만 판정한다.** 일치 = 설계대로 된 근거를 확인함 / 불일치 = 설계와 다른 근거를 확인함 / 확인 필요 = 근거가 부족함.
- 판정마다 **근거(파일, 위치, 읽은 값)** 를 함께 기록한다.
- 결과 화면에 "설계 항목 N개 중 일치 M개"를 보여 준다.
- §5 설계 대조표에서 **검사 안 함**으로 분류한 항목은 하나씩 확인 필요로 띄우지 않고 "검사 범위 밖" 요약으로만 보여 준다.
- AI 제안은 확인 필요 항목과 책임(responsibilities)에만 붙는다.
- **읽지 못한 코드는 관련된 판정에만 영향을 준다.** 경로가 적힌 `lazy(() => import("./X"))`는 그 파일과 관련된 판정만, 경로를 알 수 없는 `import(변수)`는 "코드에 없음" 판정(IC-01 등)만 확인 필요로 보내고 다른 판정은 그대로 둔다.
- 해석하지 못한 import(`resolved: null`)는 그 import와 관련된 존재·관계 판정만 확인 필요로 보낸다.
- **후보 짝(짝 확인 필요) 노드의 영향 범위**: 자식이 있는 노드가 후보 짝이면 그 노드의 항목은 전부 확인 필요이고, **직계 자식의 부모-자식 항목만** 확인 필요가 된다(부모의 결과 카드 한 장에 묶인다). 자식의 다른 항목(존재·위치·props 등)과 손자 노드는 영향받지 않는다. 일반 규칙이라 모든 노드에 같게 적용한다.

### tsconfig 지원 범위 (경로 별칭을 읽는 규칙)

업로드(4b)와 서버(4a)는 `tsconfig.json`·`jsconfig.json` 두 파일만 더 받는다(거르기 옵션 `allowConfigFiles`). 읽은 설정은 분석기(`readCodeModel`)에 그대로 전달한다. 아래 표는 무엇을 읽고 무엇을 못 읽는지 정리한 것이다.

| 항목 | 지원 | 못 읽거나 지원하지 않을 때 |
| --- | --- | --- |
| `paths` | 정확히 같은 키(`"#exact"`)와 `*` 하나가 든 패턴(`"@/*"`). 대상이 여러 개면 올린 파일로 풀리는 첫 번째. `paths`를 정의한 설정이 있으면 그 설정에 없는 별칭을 기본 규칙으로 몰래 풀지 않는다 | `*`가 둘 이상인 패턴은 지원하지 않는 패턴으로 기록하고 그 패턴으로는 풀지 않는다. 못 풀면 `resolved: null` |
| `baseUrl` | `baseUrl` 기준으로 별칭 없는 import(`components/Foo`)를 푼다. `paths` 대상은 `baseUrl`(없으면 설정 파일 폴더) 기준 | - |
| `extends` | 올린 파일을 가리키는 상대 경로(문자열·배열, 깊이 5까지). 뒤에 적은 것이 앞의 것을 덮고, 자식이 부모를 덮는다 | 패키지에서 이어받는 `extends`(예: `@tsconfig/next`)와 올리지 않은 파일은 따라가지 않고 기록한다. 이때 **그 설정에 기대는 import만** 해석 못 함(`uncertain`)으로 표시한다(별칭처럼 보이는 import와 업로드 폴더 이름으로 시작하는 import). 다른 import는 영향받지 않는다 |
| 설정이 여러 개 | 각 파일에서 가장 가까운 위쪽 폴더의 설정을 쓴다. 같은 폴더에 둘 다 있으면 `tsconfig.json`이 이긴다 | - |
| 설정을 읽지 못함 | - | 읽지 못한 설정(`invalid-json`)에 기대는 import는 위와 같이 해석 못 함으로 표시한다. 틀린 경로로 확정하지 않는다 |
| 그 밖의 별칭 장치 | - | `rootDirs`, `package.json`의 `imports`, vite·webpack 별칭, `references`, `${configDir}` 치환은 읽지 않는다. 이런 것에 기대는 별칭 import는 해석 못 함이다 |

세부 분류(코드 모델이 기록하는 값):

| 대상 | 분류 | 판정 |
| --- | --- | --- |
| 경로 별칭 | 업로드한 `tsconfig.json`·`jsconfig.json`의 `paths`(주석 허용 형식, `extends`를 따라가지 못하면 기록)를 먼저 읽고, 설정이 없으면 기본 규칙(`@/` → `src/` 또는 프로젝트 루트). 사용자 별칭 입력칸은 만들지 않음. 지원 범위와 못 읽는 경우는 아래 "tsconfig 지원 범위" | 풀리면 일치 근거, 못 풀면 `resolved: null`(해석 못 함) |
| 서버 통신 | READ(조회) / WRITE(변경) / UNKNOWN(판별 불가). fetch: method 없음=READ, POST·PUT·PATCH·DELETE=WRITE, method가 변수=UNKNOWN. axios·ky 등은 메서드 이름, useQuery·useSWR=READ, useMutation=WRITE, supabase는 select=READ·insert/update/delete/upsert=WRITE | 설계의 `dataFetch`와는 READ+WRITE를 합쳐 비교하고 유형은 결과에 함께 보임. UNKNOWN만 있으면 확인 필요 |
| 클래스 | 요소마다 ALWAYS / CONDITIONAL / DYNAMIC / ABSENT | 설계 클래스가 ALWAYS면 일치, ABSENT면 불일치, CONDITIONAL·DYNAMIC이면 확인 필요. 같은 요소에 DYNAMIC이 하나라도 있으면 ABSENT로 확정하지 않음. 조건부 클래스는 인터랙션·예외 상태 설계와 비교할 수 있도록 정보로 보존 |
| 화면 주소 | 라우터별 해석기가 공통 형식(`/products/:id`)으로 바꿔 비교. React Router: 객체 설정·`<Route>` 모두 부모 경로를 합침. Next.js App Router: `(그룹)` 폴더는 주소에서 빼고 `[id]`·`[...slug]`·`[[...slug]]`를 공통 형식으로. 그 밖의 라우터는 "읽지 못함" | 같으면 일치 |

## 5. 설계 대조표 (스키마 모든 필드 → 판정 방식)

아래 표들은 설계도의 모든 필드를 코드와 어떻게 비교할지(또는 비교하지 않을지) 정리한 것이다. FSD는 폴더를 계층으로 나누는 구조 방식(Feature-Sliced Design)이다.

범례: **코드** = 확실(코드가 판정) · **확인** = 확인 필요(후보만) · **AI** = AI 제안(2번·책임에만) · **안 함** = 검사 안 함(이유)

### Blueprint

아래 표는 설계도 전체에 붙는 필드의 판정 방식을 정리한 것이다.

| 필드 | 분류 | 내용 |
| --- | --- | --- |
| version | 안 함 | 데이터 형식 버전. 코드에 대응 없음 |
| title | 안 함 | 화면 이름. 코드에 대응 없음 |
| stack.framework | 코드 | 검사 규칙 묶음 선택(next/react). html은 검사 미지원 |
| stack.styling | 코드 | 스타일 규칙 묶음 선택: tailwind=판정, css·css-modules=확인 필요로 보냄 |
| stack.architecture | 코드 | fsd면 import 계층 검사, 그 외는 위치 비교만 |
| route | 코드 | Next: `app/<route>/page.tsx` 존재(+위치 규칙 ICN-04). React: 라우터 설정에 route↔페이지 연결(ICR-01). 라우터 형태를 못 읽으면 확인 필요 |
| source.hasSpec / imageCount | 안 함 | 입력 이력일 뿐 코드와 무관 |
| generatedBy | 안 함 | 마지막 수정 주체, 코드와 무관 |
| nodes | 코드 | 아래 노드 필드로 판정 |

### ComponentNode

아래 표는 컴포넌트 노드 하나하나의 필드가 어떻게 판정되는지 정리한 것이다.

| 필드 | 분류 | 내용 |
| --- | --- | --- |
| id | 안 함 | 내부 키(결과가 노드를 가리키는 데만 씀) |
| name | 코드+확인 | 같은 이름 컴포넌트/훅이 있으면 대응. 없으면 후보 찾기(§6). 후보 있음→**확인**, 후보 없음→IC-01 경고. 코드에만 있는 내보낸 컴포넌트→후보 있음 **확인**, 없음 IC-02 정보. 파일 안 내부용 컴포넌트는 무시(정리 기능과 같음) |
| parentId | 코드 | 부모 컴포넌트의 JSX에서 이 컴포넌트를 렌더링하는지(IC-04). 훅은 "호출"로 본다. 부모가 조건부·map 안에서 렌더링해도 렌더링으로 침 |
| order | 안 함 | 조건부 렌더링·map 때문에 JSX 순서가 설계 순서와 1:1이 아닐 수 있어 오탐 위험. (질문 Q4) |
| location.dir | 코드 | 코드 파일의 폴더 접미사가 `dir`과 일치하는지(IC-03). Next+FSD는 `src/` 접두를 허용 |
| kind | AI | `container/presentational` 구분은 코드로 확신 불가. `page`·`hook`은 이름·라우팅으로 이미 대응에 쓰임. 책임 확인 때 AI에 맥락으로만 보냄 |
| responsibilities | AI | 코드가 책임을 수행하는지는 AI만 판단(제안). 코드 판정 없음 |
| state[].name | 코드+확인 | 컴포넌트 안 `useState` 구조분해 이름과 비교(IC-05 위치·누락). 비슷한 이름이면 **확인**(§6). 훅 노드의 state는 훅 함수 안 useState. **훅 안의 상태**: 설계도에 없는 훅이고, 컴포넌트가 직접 부르는 한 단계이며, `useState`·`useReducer`로 선언된 경우에만 "상태가 있다"(일치)로 본다. 근거에 "어느 훅 안에서 선언, 어느 컴포넌트가 호출"을 적는다. 훅이 다시 다른 훅을 부르거나(두 단계), 컴포넌트나 그 훅이 Context·상태 관리 라이브러리 훅(`useContext`·`useStore`·`useSelector`·`useAtom`·`useRecoilState` 등, 목록은 `state-hooks.ts` 한 곳)을 쓰면 없다고 확정하지 않고 **확인**으로 보낸다. 그 훅이 설계 노드이거나 컴포넌트가 부르지 않는 다른 코드에 있으면 지금처럼 위치 다름 경고 |
| state[].description | 안 함 | 자유 설명문 |
| props[].name | 코드+확인 | 컴포넌트 props 이름과 비교. 누락·설계에 없음 IC-06(경고). 비슷한 이름이면 한 건 **확인** |
| props[].type | 안 함 | 타입 호환은 tsc 영역. 문자열 비교는 오탐이 많다. (질문 Q4) |
| events | 코드 | 이벤트 이름이 `on*` 콜백 props 또는 JSX 속성(`onClick=`)으로 있는지(IC-07). 훅은 events가 항상 빈 배열 |
| dataFetch | 코드+확인 | 파일 안 조회 호출(`fetch`, `axios.*`, `supabase…from`, `useQuery`/`useSWR`, `use(...)`. 목록은 상수)이 있는지. false인데 있음·true인데 없음 IC-08(경고). 조회가 호출하는 훅 안에 있을 수 있으면(자식 훅 노드가 true) **확인** |
| renderMode | 코드 | Next만. `"use client"` 지시문(ICN-01·02). 그 외 스택은 이 필드가 null이라 규칙이 안 걸림 |
| layout.display·direction·columns | 코드(tailwind) / 확인(css·css-modules) | Tailwind: 부모 JSX 컨테이너 `className`의 `flex flex-col/row grid grid-cols-N`. 반응형은 `md:`·`lg:` 접두와 대조(대응표는 `adapters/styling/prompt.ts` 재사용). css·css-modules: 확인 필요로 보냄(IC-09) |
| layout.gap | 코드(tailwind) / 확인 | `gap-N` ↔ 토큰 대응표 |
| layout.align·justify | 코드(tailwind) / 확인 | `items-*`·`justify-*` |
| layout.responsive | 코드(tailwind) / 확인 | 접두 클래스와 대조 |
| placement.span | 코드(tailwind) / 확인 | `col-span-N`·`col-span-full` |
| style.scope | 안 함 | 스택 규칙이 정하는 값(어댑터가 정의), 코드 판정 근거 없음 |
| style.properties(value) | 코드(tailwind)·확인 | 토큰 값을 쓰기로 한 속성이 임의값(`[#333]`)이면 IC-10(경고). 프로젝트 토큰에 대응하지 않는 Tailwind 기본 색·간격 클래스(`text-gray-700`·`bg-blue-500`·`p-3`)는 통과시키지 않고 **확인**. 값이 토큰과 같은지는 대응표로 비교 가능한 것만 판정, 못 비교하면 **확인** |
| style.properties(isToken) | 안 함 | 판정 근거는 value 쪽(위 행) |
| style.ownsOuterSpacing | 코드 | false인데 노드 최상위 요소에 `m-*`·`mt-*` 등 바깥 margin(가운데 정렬 `mx-auto` 제외, 구조 검사 R-06과 같은 기준)이 있으면 IC-11 |
| style.classPattern | 안 함 | BEM 등 명명 규칙은 CSS 파일을 읽어야 해서 1차 제외. (PostCSS 없이 불가) |
| assumed / assumedFields | 안 함 | AI 가정 표시, 코드와 무관 |

### SpecInput 7개 항목 (스펙의 금지 사항 등)

아래 표는 사용자가 적은 스펙 입력 7개 항목 중 무엇을 코드로 검사하는지 정리한 것이다.

| 항목 | 분류 | 내용 |
| --- | --- | --- |
| ② 디자인 토큰 | 코드 | 위 `style.properties` 토큰 대조에 사용 |
| ⑦ 금지·제약 | 코드(정형만) | 설계도에서 정형으로 판정 가능한 두 가지만: **인라인 `style={{}}`**(IC-12), **자식의 바깥 margin**(IC-11). 자유 문장은 해석하지 않음 |
| ① 개요·③ 레이아웃·④ 컴포넌트 규칙·⑤ 상태·데이터·⑥ 접근성 | 안 함 | 자유 텍스트. ③·⑤는 이미 노드 필드로 판정됨. ⑥은 ESLint(jsx-a11y) 영역 |

### 프레임워크·구조 전용 규칙

아래 표는 Next.js(ICN), React(ICR), FSD(ICF)에서만 걸리는 규칙을 정리한 것이다.

| ID | 조건 | 판정 | 심각도 |
| --- | --- | --- | --- |
| ICN-01 | Next, 설계 client | `"use client"` 없음. 상태·이벤트·훅 사용이 있으면 오류, 없으면 경고 | 오류/경고 |
| ICN-02 | Next, 설계 server | `"use client"` 있음 | 경고 |
| ICN-03 | Next | client 파일이 설계상 server 컴포넌트를 직접 import | 오류 |
| ICN-04 | Next, route 있음 | `app/<route>/page.tsx`가 없거나 페이지를 import해 내보내기만 하지 않음(로직·JSX 직접 작성) | 경고 |
| ICR-01 | React, route 있음 | 라우터 설정(`createBrowserRouter`·`<Route path>`)에 route와 페이지가 연결되지 않음. 설정 파일을 못 찾으면 **확인** | 경고 |
| ICF-01 | FSD | 실제 import가 계층 방향(위 계층 import 금지)을 어기거나, 같은 계층의 다른 슬라이스를 가져옴. 계층 방향 검사는 모든 계층에 적용하므로 `shared`가 위 계층을 가져와도 위반이다. 같은 계층 다른 슬라이스 검사는 슬라이스가 있는 pages·widgets·features·entities 사이에만 한다(`shared`는 슬라이스가 없고 어느 계층에서나 가져올 수 있다). 타입만 가져오는 import는 제외 | 오류 |

공통 ID: IC-01 설계에만 있음, IC-02 코드에만 있음, IC-03 위치 다름, IC-04 부모-자식 다름, IC-05 상태 위치·누락, IC-06 props 누락·설계에 없음, IC-07 이벤트 누락, IC-08 조회 담당 불일치, IC-09 배치 다름(Tailwind), IC-10 토큰 대신 직접 값, IC-11 바깥 margin, IC-12 인라인 style. 훅 누락(설계 훅 노드가 부모에서 호출되지 않음)은 IC-04의 훅 변형이며 메시지에서 "훅 사용 누락"으로 구분한다.
React 훅 사용 규칙처럼 ESLint(코드 문법·습관을 검사하는 도구)가 이미 잡는 것은 만들지 않는다.

## 6. 비슷한 이름 판단 (기준·임계값, `similarity.ts` 한 곳에 상수)

공통: 이름을 PascalCase/camelCase 단어로 쪼개 소문자로 비교(`discountRate` → {discount, rate}). 임계값(이름 단어 Jaccard 0.5, props Jaccard 0.5)은 `core/similarity/`의 공용 파일 한 곳에서 관리하고 구조 검사 R-05·정리 C-02·구현 검사가 모두 거기서 가져온다. 단어 쪼개기·Jaccard 함수도 `core/similarity/`에 있으며(정리 쪽 구현을 그대로 옮긴 것) 정리와 구현 검사가 함께 쓴다. 구조 검사 R-05는 자기 쪽 단어 쪼개기와 계산을 그대로 쓰므로(기존 결과 유지) 세 기능의 계산 방식 통합은 고도화 목록이다. 훅은 `use` 접두사를 뗀 뒤 같은 함수로 비교한다.

아래 표는 이름이 달라도 같은 것으로 볼 후보를 어떻게 찾는지 정리한 것이다. Jaccard는 두 단어 묶음이 얼마나 겹치는지 0~1로 나타낸 값이다(겹치는 단어 수 ÷ 전체 단어 수).

| 대상 | 후보로 보는 조건 (하나라도) | 동작 |
| --- | --- | --- |
| 컴포넌트 이름 | ① 단어 Jaccard ≥ 0.5 ② **구조 근거**: 대응된 부모가 렌더링하는 짝 없는 코드 컴포넌트이고, (같은 폴더 접미사이거나 props 이름 Jaccard ≥ 0.5이거나 이름 단어가 1개 이상 겹침) | 후보 있음 → 확인 필요 1건(후보 목록, 점수순). 후보가 없으면 IC-01/IC-02 |
| 상태 이름 | 같은 컴포넌트 안에서 ① 단어 Jaccard ≥ 0.5(예: discount↔discountRate) ② **남은 것끼리 1:1**: 대응된 컴포넌트에서 설계 쪽 상태 1개와 코드 쪽 상태 1개만 서로 짝이 없으면 이름이 달라도 한 쌍(quantity↔count) | 쌍 → 확인 필요 1건("누락 + 설계에 없음" 두 건 대신). 남은 게 다대다·한쪽만이면 쌍을 억지로 만들지 않고, 한쪽만 남으면 확실(누락/추가) |
| props 이름 | 상태와 같은 규칙. ②에서 타입 문자열이 같으면 근거로 표시 | 같음 |
| 대소문자만 다른 이름 | 대소문자만 다르면 같은 이름으로 대응한다(`PRODUCTGALLERY` ↔ `ProductGallery`). `_`·`-`를 뺀 비교는 후보를 찾는 데만 쓴다 | 대소문자만 다름: 확실 / `_`·`-`가 다름: 후보(확인 필요) |

주의: ②(남은 것끼리 1:1)는 "경고를 확인 필요로 낮추는" 장치라 틀려도 사용자에게 손해가 작다. 반대로 임계값을 높이면 확인 필요가 줄고 경고가 늘어난다. 시험 데이터(1단계)로 값을 확정하고 `similarity.ts`에서만 조정한다.

설계에만 있고 짝 못 찾은 **상태/props**: 대응된 컴포넌트가 있으면 확실(누락). 코드에만 있는 상태는 정보(IC-05), 설계에 없는 props는 경고(IC-06, 요청 사항).

### 6-1. 짝짓기 규칙 (3a: 설계 노드 ↔ 코드 컴포넌트·훅)

짝짓기는 이후 모든 검사의 기준이다. 아래 표는 짝의 근거를 확실과 후보로 나누고 각각 어떻게 다루는지 정리한 것이다.

| 구분 | 조건 | 이후 검사 |
| --- | --- | --- |
| **확실** | 이름이 정확히 같거나 대소문자만 다르고, **대상 종류도 같다**(훅 노드 ↔ 코드의 훅, 컴포넌트·페이지 노드 ↔ 코드의 컴포넌트). 파일 안에서만 쓰는(내보내지 않은) 컴포넌트도 확실이며 `exported`는 별도 정보로 기록한다. 파일 위치 적합성(IC-03)은 별도로 판정한다 | props·상태·이벤트·서버 통신·위치 검사를 한다 |
| **같은 이름이 여러 곳** | 파일 위치(`location.dir`)가 맞는 것이 정확히 1개면 확실(근거 "같은 이름 중 위치"). 못 가리면 "짝 확인 필요(같은 이름 여러 개)". 부모가 렌더링하는지는 확실의 근거로 쓰지 않고 후보 순서에만 쓴다(IC-04가 확인할 내용과 같아 검사가 스스로를 증명하게 되기 때문) | 확실일 때만 한다 |
| **후보** | ① 이름 단어 Jaccard ≥ 0.5(훅은 `use`를 뗌) ② 위치: 대응된 부모가 렌더링·호출하는 짝 없는 코드이고 같은 폴더이거나 props Jaccard ≥ 0.5이거나 이름 단어가 1개 이상 겹침 ③ 화면 주소: 페이지 노드의 주소와 같은 주소의 `page.tsx` 안 컴포넌트 ④ 이름 없는 기본 내보내기는 파일 이름이 같아도 후보(컴포넌트 이름이 아니라 파일 이름을 근거로 판단했다고 표시) ⑤ `_`·`-`만 다른 이름 | "짝 확인 필요" 한 건만 낸다. props·상태·이벤트·서버 통신 등 세부 검사는 하지 않는다. 사용자가 같은 것으로 짝지으면 그때 검사한다 |
| **읽지 못한 코드** | `import(변수)`는 확실한 짝을 낮추지 않고 "코드에 없음"(IC-01) 판정만 확인 필요로 보낸다. 확실한 짝을 낮추는 경우는 둘뿐이다: ㉠ 경로에 노드 이름이 보이는데 그 파일을 올리지 않아 읽지 못한 경우(`lazy(() => import("./ProductGallery"))` 대상 파일 없음. 같은 끝 경로의 올린 파일이 있으면 그 파일로 본다), ㉡ 같은 이름이 여러 개인데 특정하지 못한 경우 | 낮춘 짝은 후보와 같이 "짝 확인 필요" 한 건 |

- **같은 입력이면 같은 짝**: 입력 파일은 경로순으로 정렬해 처리한다. 후보 순서는 (이름 유사도와 위치 근거를 둘 다 가진 것) → 이름 유사도 높은 순 → props 유사도 높은 순 → 파일 경로 사전순이다. 하나의 코드가 여러 설계 노드의 1순위 후보가 되면 점수가 가장 높은 노드가 우선권을 갖고, 점수가 같으면 노드 이름 사전순이다. 다만 해당 코드는 다른 노드의 후보 목록에서도 제거하지 않고 유지한다. 파일을 섞어 넣어도 결과가 같은지 테스트로 고정한다.
- **후보 겹침 표시**: 진 노드의 후보 항목에는 그 코드가 다른 노드(노드 이름)의 1순위 후보이기도 하다는 사실(`contestedBy`)을 표시한다. 사용자가 두 노드의 후보 관계를 알 수 있어야 한다.
- **사용자가 짝을 확정한 뒤 다시 판정**(구현은 4단계 "같은 것으로 짝짓기"와 함께): 사용자가 이긴 쪽의 짝을 확정하면 그 짝을 미리 확정한 상태로 **짝짓기 전체를 다시 돌린다**(진 노드의 후보 목록에서 지우기만 하지 않는다). 후보가 지워졌다는 이유만으로 "코드에 없음"으로 확정하지 않고, 남은 후보와 분석 근거(이름·위치·화면 주소·읽지 못한 코드)를 다시 확인해 기존 판정 원칙(일치·불일치·확인 필요)대로 다시 분류한다. 결과 모양은 기존 확실 짝·짝 확인 필요·코드에 없음·코드에만 있음을 그대로 쓰고 새 상태 이름을 만들지 않는다.
- **한 건으로 묶기**: 짝 없는 노드와 코드 컴포넌트가 후보로 묶이면 "없음(IC-01)"과 "코드에만 있음(IC-02)" 두 건을 내지 않고 "짝 확인 필요" 한 건만 낸다.
- **근거 기록**: 짝마다 근거 종류(정확히 같음 / 대소문자 / 같은 이름 중 위치 / 이름 유사도 / 위치 / 화면 주소 / 파일 이름 / 경로에 이름이 보임), 점수(유사도), 설명을 남긴다.
- **결과 모양**: 확실 짝, 짝 확인 필요(후보 목록 포함), 코드에 없음, 코드에만 있음(내보낸 것만). 이후 검사는 확실 짝에 대해서만 한다(`checkable`).

## 7. 채점 기준표 (1단계에서 시험 데이터로 구체화)

시험 묶음 2개, 묶음마다 4종류:

아래 첫 번째 표는 시험 묶음 2개(next, react)를, 두 번째 표는 묶음마다 만들 시험 코드 4종류와 기대 결과를 정리한 것이다.

| 묶음 | 설계도 | 스택 |
| --- | --- | --- |
| next | `core/schema/sample-blueprint.json` 기반(상품 상세, 컴포넌트 8개) + 스타일을 Tailwind로 바꾼 변형 | Next + Tailwind + FSD (+ CSS Modules 변형 1건: 배치가 확인 필요로 가는지) |
| react | 위 설계도를 React용으로 바꾼 변형(renderMode null, `route` 있음) | React + Tailwind + type-based |

| 종류 | 내용 | 기대 결과 |
| --- | --- | --- |
| correct | 설계도대로 바르게 구현 | 확실 0, 확인 필요 0 |
| wrong-<규칙> | 규칙 하나당 일부러 틀린 코드. **correct 위에 바뀐 파일만 덮어쓰는 방식**(복사본 안 늘림) | 그 규칙 1건만, 다른 규칙 0건 |
| renamed | 이름만 바꿔 구현(예: ProductGallery→ItemImages, quantity→count, discountRate→discount) | 경고 0, 확인 필요만(후보 일치) → AI 제안 확인용 |
| stack-mismatch | React 코드에 `"use client"`가 있거나 Next 전용 규칙 대상 상황 | ICN 계열 0건 |

각 묶음에서 나와야 할 결과는 1단계 산출물 `fixtures/implementation-check/<묶음>/expected.md` 표로 먼저 확정해 승인받는다(규칙×기대 건수×기대 노드). 테스트는 이 표와 1:1.
변이 실험(3단계): 핵심 규칙(IC-01·IC-04·IC-06, ICN-01, ICN-03, ICF-01)의 판정 조건을 일부러 뒤집어(예: 비교 연산자 반전) 테스트가 실패하는지 확인하고 PR에 결과를 적는다.

## 8. 결과·AI·내보내기

**결과 표시**: 확실(오류→경고→정보, 구조 검사와 같은 정렬) → 확인 필요 → AI 제안 순서. 각 항목에 설계 노드 이름·코드 위치(파일, 줄)·근거를 보인다.

**확인 필요 항목의 행동** (제안, Q2): `[같은 것으로 짝짓기]`(이름 짝 후보일 때만. 누르면 짝짓기를 반영해 **재계산**하여 그 컴포넌트의 상태·props·위치 등이 확실 결과로 바뀜) · `[수정 요청에 포함]` · `[무시]`.
서버는 상태를 저장하지 않는다: 짝짓기 목록(`pairings`)을 요청에 실어 다시 계산한다.

**AI** (5단계): 켜고 끌 수 있는 토글, 켜기 전에 "코드 일부가 외부 AI(OpenAI)로 전송됩니다" 안내. 보내는 것은 확인 필요 항목에 걸린 컴포넌트와 책임 확인 대상 컴포넌트의 함수 본문 조각뿐이며 컴포넌트당·총 글자 수 상한을 둔다(Q3). 응답은 JSON 스키마(Zod)로 받아 검증, 실패하면 AI 제안 없이 1·2번만 표시. 로그인 필수(`getClaims`), 기존 초안 생성의 모델·시간 제한(텍스트 45초)·오류 매핑·재시도 규칙 재사용. AI는 확실 결과를 바꾸지 못하고, 제안은 "AI 제안" 배지로 구분하며 `[받아들이기]`를 누르면 `pairings`에 반영.

**수정 지시서**: `core/prompt/fix-prompt.ts` 템플릿(AI 없음, 같은 입력 → 같은 출력). 확실 항목 + 받아들인 확인 필요 항목만. 항목마다 "어느 노드·어느 파일·무엇을 설계대로 고칠지"를 적고 기준 판(번호)을 머리말에 적는다. 복사·.md 내려받기는 기존 `ExportDocumentCard` 재사용.

**API** (4a 구현 기준): `POST /api/projects/[id]/implementation-check`
- 요청 JSON: `{ codeFiles: [{path, content}], confirmed?: [{ nodeId, path, name }] }`. `codeFiles`는 `.ts`·`.tsx`와 `tsconfig.json`·`jsconfig.json`을 받고 서버가 화면과 같은 규칙·상한(본문 3MB, 30개·파일 200KB·합계 1MB)으로 다시 거른다. `confirmed`는 사용자가 "같은 것으로 짝짓기"로 확정한 짝이다: `nodeId`는 설계 노드의 고유 id(3b 항목 id `노드id|키`의 앞부분), `path`·`name`은 코드 단위(파일 경로, 컴포넌트·훅 이름). 5단계의 `useAi`·`accepted`는 지금은 모르는 필드로 400.
- 응답 200: `{ baseline, result, meta }`. `baseline` = `{ revision, source: "export"|"latest", newerRevision? }`(지시서를 가장 최근에 내보낸 판, 내보낸 적이 없으면 최신 판이고 `source`가 `latest`, 내보낸 판보다 새 판이 있으면 `newerRevision`). `result` = 3b의 `{ items, bans, findings, summary }` 그대로(`confirmed`가 없으면 3b와 완전히 같은 결과, 보냈을 때만 판정에 영향). `meta` = `{ timing: { totalMs, filterMs, dbMs, parseMs, checkMs, requestNumber, first }, files, bytes, nodes, confirmedApplied }`(`requestNumber`는 서버 인스턴스가 몇 번째로 처리했는지, `first`는 첫 요청 여부. 같은 값을 `Server-Timing` 헤더로도 낸다. 4c 성능 측정용).
- `confirmed` 검증(하나라도 어긋나면 422 `invalid_confirmed`, 어느 항목(`confirmed[i]`)인지만 알리고 코드 내용은 담지 않음): 기준 설계도에 없는 `nodeId`, 올린 코드에 없는 `path`·`name`, 노드와 코드의 종류 불일치(훅은 훅끼리, 컴포넌트·페이지는 컴포넌트끼리), 같은 노드·같은 코드의 중복, 이미 확실한 짝이 있는 노드를 다른 코드로 확정, 다른 노드의 확실한 짝인 코드를 확정. 검증한 뒤에만 검사기에 넘기고, 검사기는 확정한 짝을 먼저 확실한 짝으로 정한 뒤 짝짓기 전체를 처음부터 다시 돌린다(§6-1).
- 오류: 401(세션) · 404(없거나 남의 프로젝트) · 400(형식, 검사할 `.ts`·`.tsx` 없음) · 413(한도) · 422(판 없음, HTML 프로젝트, `confirmed` 오류) · 500(분석 중 예외, 메시지에 코드 없음) · 503(DB). 코드는 저장하지 않고 응답 오류·서버 로그에 코드 내용을 넣지 않는다(서버 로그는 파일 수·크기·노드 수·시간 한 줄).
- 알려진 것(4b에서 다룸): 결과 카드(`findings`)의 후보에는 코드 파일 경로가 없어, 화면이 `confirmed`의 `path`를 만들려면 후보 목록(경로 포함)이 응답에 더 필요하다. 응답 구조를 바꾸는 일이라 4b 시작 때 제안한다.

## 9. 경계

- 항상: tsc → 테스트 → 커밋, 단계별 작은 커밋(`feat:`·`fix:`·`chore:`·`docs:`), core는 React/Next import 금지, 인라인 스타일·`!important` 금지, 새 규칙은 어댑터에 분리.
- 먼저 물어봄: 새 패키지, DB 마이그레이션, 기존 어댑터 파일 수정, 업로드 한도 변경.
- 안 함: 코드 자동 수정, CLI·Action, 결과 DB 저장, 디자인 시스템 검사 고도화, 실제 OpenAI 호출(사용자가 확인할 때만), `main` 직접 커밋.

## 10. 계획 (단계 → 커밋, 각 단계 끝에 확인받기)

아래 표는 단계(0, 1, 2a~2c, 3a~3c, 4a·4b, 5, 끝)마다 할 일, 확인 방법, 커밋 이름을 정리한 것이다.

| 단계 | 내용 | 검증 | 커밋 |
| --- | --- | --- | --- |
| ✅ 0 | 이 문서 | 사용자 승인 | docs: 구현 검사 스펙 |
| ✅ 1 | `fixtures/implementation-check/` 시험 데이터 + expected.md(기대 결과 표) | 표 승인, 시험 코드가 tsc로 컴파일되는지 | test: 구현 검사 시험 데이터 |
| ✅ 2a | `core/code-model` 분리(이동·재내보내기만, 동작 변경 없음) | 기존 테스트 전부 통과 + `demo-cleanup` 결과 동일 | refactor: 코드 분석기를 code-model로 분리 |
| ✅ 2b | code-model 확장(use client, useState, 훅 호출, import 관계(@/ 포함), 렌더링 관계, 이벤트 props, 조회 호출, className·style) | 단위 테스트 | feat: 코드 모델 읽기 항목 확장 |
| ✅ 2c | code-model 보완(§4-1): tsconfig·jsconfig `paths` 읽기(업로드 거르기에 두 파일 추가), 서버 통신 READ/WRITE/UNKNOWN, 클래스 ALWAYS/CONDITIONAL/DYNAMIC/ABSENT, 라우터별 화면 주소 정규화(React Router 중첩 합치기·Next 그룹·동적 세그먼트), 읽지 못한 코드의 영향 범위(lazy 경로 유무), `readCodeModel` 기능별 설정(디자인 시스템 정리는 지금 결과 그대로인 설정). 시험 데이터를 먼저 추가하고 기대 결과 표 승인 후 구현 | 단위 테스트 + 시험 데이터의 `facts` 일치 + 기존 정리 결과·`demo-cleanup` 동일 | feat: 코드 모델 보완 |
| ✅ 3a | 대응시키기·비슷한 이름(match·similarity, §6-1): 확실/후보/같은 이름 여러 곳/읽지 못한 코드, 근거 기록, 순서 불변. 유사도 기준값·단어 쪼개기를 `core/similarity/`로 공용화(구조 검사·정리·구현 검사가 함께 씀). tsconfig를 못 읽는 경우는 해석 못 함으로 표시 | 시험 데이터 `facts.pairs` 일치 + 파일 순서를 섞어도 같은 결과 + 변이 실험(대소문자 단계 제거, 후보에도 세부 검사 허용) + 구조 검사·정리 회귀 동일 | feat: 설계-코드 대응 |
| ✅ 3b | 공통·스택 어댑터 규칙 + run | correct 0건·wrong 기대대로·renamed 확인 필요만 | feat: 구현 검사 규칙 |
| ✅ 3c | 변이 실험 | 결과 문서(`tasks/mutation-result-implementation-check.md`, 러너가 생성)를 남기고, PR 설명(`docs/pr/implementation-check.md`)에 그 요약을 넣는다(끝 단계) | test: 변이 실험 |
| 4a | 기준 판 조회 + 핸들러 + API. 서버가 코드를 다시 거를 때 `allowConfigFiles`로 `tsconfig.json`·`jsconfig.json`을 받고, 읽은 설정을 분석기(`readCodeModel`)에 전달한다(§4-1 "tsconfig 지원 범위"). 요청에 사용자가 확정한 짝(`confirmed`)을 받으면 짝짓기를 그 짝을 미리 확정한 상태로 처음부터 다시 돌린다(§6-1 "사용자가 짝을 확정한 뒤 다시 판정") | 핸들러 테스트(가짜 DB), 설정 파일이 든 요청과 없는 요청, 확정한 짝이 든 요청(진 노드가 후보 제거만으로 "코드에 없음"이 되지 않는지) | feat: 구현 검사 API |
| 4b | 화면(탭, 업로드, 결과, 확인 필요 행동) + 수정 지시서. 업로드가 `tsconfig.json`·`jsconfig.json`을 함께 올리고(`allowConfigFiles`), 결과에 "설정 파일 N개 읽음 / 못 따라간 설정 N개(해석 못 함 import 영향)"를 보인다. 사용자 별칭 입력칸은 만들지 않는다. "같은 것으로 짝짓기"는 짝을 확정하면 4a의 `confirmed`로 다시 판정한 결과를 보이고, 후보 항목에 "다른 노드의 1순위이기도 함" 표시(`contestedBy`)를 보인다 | 3000번에서 직접 확인 | feat: 구현 검사 화면·수정 지시서 |
| 4c | 성능 측정(기능 추가 없음). 코드 파일 30개를 올리고 "검사" 요청을 보낸 시점부터 결과가 돌아온 시점까지를 **서버 처리 시간**(핸들러 시작~응답, 서버 로그나 응답 헤더 기준)과 **화면 체감 시간**(버튼을 누른 뒤 결과가 화면에 그려질 때까지, 브라우저에서 잼)으로 따로 잰다. 파일 수·합계 크기·설계도 노드 수, 측정 환경(컴퓨터 사양, 개발 서버인지 빌드 서버인지, 브라우저), 각 시간을 5회 이상 재서 중앙값과 최댓값을 함께 `docs/perf/implementation-check.md`에 남긴다. 이후 성능을 개선하면 같은 입력·같은 방법으로 다시 재서 이 문서에 전후를 나란히 적는다 | 측정 문서(입력·환경·시간 표)가 남아 있는지. 측정만 하고 코드는 고치지 않는다. 느리면(기준: 서버 처리 3초 초과) 사용자에게 알리고 개선할지 묻는다 | docs: 구현 검사 성능 측정 |
| 5 | AI 제안(가짜 클라이언트 테스트) | 스키마 실패 시 1·2번만 나오는지 | feat: 구현 검사 AI 제안 |
| 끝 | PR 전 정리 커밋: 옛 경로 다시 내보내기 파일(`core/cleanup/extract.ts`·`filter-files.ts`·`types.ts`의 재내보내기)의 import를 `code-model`로 바꾸고 파일 삭제 → `docs/pr/implementation-check.md`, CLAUDE.md·data-model.md 갱신 | tsc·test·lint·build | docs: PR 설명 |

위험: ① `core/cleanup` 분리가 가장 넓게 퍼짐(2a를 이동 전용 커밋으로 격리). ② 렌더링 관계는 정적 분석이라 `React.lazy`·동적 컴포넌트·`export … from` 재내보내기는 놓침 → "확인 필요"가 아닌 "읽지 못함" 요약으로 표시(정리 기능의 한계와 같음). (고도화 목록: 디자인 시스템 정리와 구현 검사의 import 해석·props 읽기 기준 통일. 새 폴더는 만들지 않고 `core/impl-check`를 그대로 쓴다.) ③ **CSS·CSS Modules는 배치·토큰을 코드로 판정하지 않고 노드마다 확인 필요 1건으로 보낸다**(CSS 파일을 읽지 않음). → `docs/pr/implementation-check.md`의 "알려진 한계"에 반드시 적는다(사용자 요청). ④ Tailwind 클래스가 `cn()`·`clsx` 조건식·변수로 만들어지면 문자열 리터럴만 읽음. ⑤ **`_`·`-`만 다른 이름(짝짓기 D3)의 시험 범위**: 설계도 노드 이름과 코드 컴포넌트 이름은 PascalCase만 허용해 `_`·`-`가 든 노드 이름은 입력할 수 없다. 그래서 이 규칙은 이름 유사도 계산(`Product_Gallery`↔`ProductGallery`가 1.00)과 파일 이름(`product-gallery.tsx`)에서 가져온 이름을 비교하는 수준으로만 시험했다 → `docs/pr/implementation-check.md`의 "알려진 한계"에 반드시 적는다(사용자 요청). ⑥ 하나의 코드가 여러 노드의 후보일 때 짝 확정 뒤 다시 판정하는 동작은 4단계에서 구현한다(3a는 후보 겹침 표시까지).

## 11. 질문 (승인 시 같이 답해 주세요. 기본값 = 제 추천)

질문은 6개다. Q1 업로드 한도, Q2 확인 필요 항목의 행동, Q3 AI에 보내는 양, Q4 검사에서 뺀 필드, Q5 시험 묶음 스택, Q6 규칙 번호 접두사.

- **Q1** 업로드 한도: 기존(30개·파일 200KB·합계 1MB) 그대로? → 기본: 그대로, 넘으면 "더 좁은 폴더" 안내. 화면 1개 구현은 대개 충분하다고 봄.
- **Q2** 확인 필요 항목 행동: `[같은 것으로 짝짓기] [수정 요청에 포함] [무시]` 3개로 → 기본: 이대로.
- **Q3** AI에 보내는 양 상한 → 기본: 컴포넌트당 4,000자, 총 30,000자·컴포넌트 12개까지(넘으면 확인 필요 항목에 걸린 것부터, 나머지는 책임 확인 생략을 화면에 표시).
- **Q4** `order`(형제 순서)와 `props[].type`을 검사 안 함으로 둠 → 기본: 1차 제외, 고도화 목록. 필요하면 order를 정보로 추가 가능.
- **Q5** 시험 묶음 스택: next = Next+Tailwind+FSD(+CSS Modules 변형), react = React+Tailwind+type-based → 기본: 이대로. (CSS·CSS Modules는 배치를 코드로 판정하지 않고 확인 필요로 보내므로 Tailwind가 판정 경로 시험용.)
- **Q6** 규칙 ID 접두사 `IC-`(공통)·`ICN-`·`ICR-`·`ICF-` → 기본: 이대로.

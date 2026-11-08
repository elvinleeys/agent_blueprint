# 구현 검사 변이 실험 결과

`npm run verify:mutation`이 만든다(원본 소스는 건드리지 않고 임시 복사본에서 변이를 적용). 손으로 고치지 않는다.

요약: 코드 변이 51개 중 잡힘 50, 동등 변이 1, 살아남음·적용 실패 0 · 중립 변이 6개 중 결과가 달라진 것 0

## 3a: 설계 노드와 코드의 짝짓기 판정

| 번호 | 규칙 | 잘못된 판정 | 결과 | 실패한 테스트 수 | 처음 실패한 테스트 |
| --- | --- | --- | --- | --- | --- |
| A01 | 짝: 대소문자 단계 | 대소문자만 다른 이름을 확실한 짝으로 보지 않음 | 잡힘 | 1 | core/impl-check/match.test.ts › 확실: 이름이 정확히 같거나 대소문자만 다르고 종류가 같다 대소문자만 다르면 확실(근거 case) |
| A02 | 짝: 후보는 검사하지 않음 | 후보(짝 확인 필요)를 확실한 짝처럼 이후 검사에 씀 | 잡힘 | 9 | core/impl-check/match.test.ts › 후보: 근거와 선택 순서 후보·같은 이름 여러 개·읽지 못한 코드·없음은 이후 검사를 하지 않는다(checkable false), 확실만 true |
| A03 | 짝: 같은 이름은 위치로 특정 | 같은 이름이 여러 개일 때 위치로 특정하지 않고 전부 확인 필요로 보냄 | 잡힘 | 4 | core/impl-check/match.test.ts › 시험 데이터의 기대 짝 표(facts.pairs): next 묶음 dup-name-location |
| A04 | 짝: 같은 이름은 위치로 특정 | 위치가 같은 코드가 여러 개여도 첫 번째로 확정 | 잡힘 | 1 | core/impl-check/match.test.ts › 같은 이름이 여러 곳: 위치로 특정하고, 못 하면 확인 필요 위치가 맞는 것이 둘 이상이어도 특정하지 못한다(자동으로 첫 번째를 고르지 않는다) |
| A05 | 짝: 이름 없는 기본 내보내기 | 이름 없는 기본 내보내기를 파일 이름만으로 확실한 짝이라 확정 | 잡힘 | 5 | core/impl-check/match.test.ts › 시험 데이터의 기대 짝 표(facts.pairs): next 묶음 default-anon |
| A06 | 짝: 종류(컴포넌트·훅) | 컴포넌트와 훅을 이름만 같으면 같은 것으로 짝지음 | 잡힘 | 1 | core/impl-check/match.test.ts › 확실: 이름이 정확히 같거나 대소문자만 다르고 종류가 같다 종류가 다르면 짝지어지지 않는다(훅 노드 ↔ 컴포넌트, 컴포넌트 노드 ↔ 훅) |
| A07 | 짝: 읽지 못한 경로 | 경로에 노드 이름이 보이는 읽지 못한 파일이 있어도 확실한 짝을 그대로 둠 | 잡힘 | 4 | core/impl-check/match.test.ts › 시험 데이터의 기대 짝 표(facts.pairs): next 묶음 lazy-missing-named |
| A08 | 짝: 같은 입력이면 같은 결과 | 코드 단위를 입력 파일 순서대로 처리해, 파일 순서를 섞으면 결과가 달라짐 | 잡힘 | 1 | core/impl-check/rules.test.ts › 변이 실험 보강 T1: 설계에 없는 코드가 여러 개여도 입력 파일 순서와 무관하게 경로 순서로 나온다 |
| A09 | 짝: 후보 표시 | 한 코드를 두 노드가 후보로 다툴 때 진 노드에 다툰 상대를 알리지 않음 | 잡힘 | 2 | core/impl-check/match.test.ts › 후보: 근거와 선택 순서 한 코드가 두 노드의 1순위면 점수가 높은 노드가 가지고, 다른 노드의 후보 목록에도 남는다 |
| A10 | 짝: 화면 주소 근거 | 화면 주소가 일치해도 후보 근거로 쓰지 않음 | 잡힘 | 4 | core/impl-check/match.test.ts › 시험 데이터의 기대 짝 표(facts.pairs): next 묶음 page-route |
| A11 | 짝: 코드에만 있음 | 짝 확인 필요의 후보 코드를 '설계에 없는 컴포넌트'로도 보고함 | 잡힘 | 7 | core/impl-check/match.test.ts › 시험 데이터의 기대 짝 표(facts.pairs): next 묶음 dup-name-ambiguous |
| A12 | 짝: 이름 유사도 기준값 | 이름 유사도 기준을 올려 비슷한 이름을 후보로 못 찾음 | 잡힘 | 6 | core/impl-check/match.test.ts › 시험 데이터의 기대 짝 표(facts.pairs): next 묶음 hook-renamed |

## 3b: 구현 규칙 및 결과 집계 판정

| 번호 | 규칙 | 잘못된 판정 | 결과 | 실패한 테스트 수 | 처음 실패한 테스트 |
| --- | --- | --- | --- | --- | --- |
| B01 | IC-03 위치 | 위치가 맞으면 경고, 틀리면 일치 | 잡힘 | 135 | core/impl-check/rules.test.ts › 후보 짝 노드의 연쇄: 직계 자식의 부모-자식 항목만 확인 필요 직계 자식의 다른 항목(존재·위치·서버 통신 등)은 영향받지 않는다 |
| B02 | IC-07 이벤트 | 이벤트가 props와 JSX 속성 둘 다에 있어야 일치로 봄 | 잡힘 | 128 | core/impl-check/run.test.ts › 구현 검사: next 묶음의 기대 결과 correct: 확실·확인 필요 카드 |
| B03 | IC-08 서버 통신 | 조회 담당과 아닌 노드의 판정을 맞바꿈 | 잡힘 | 134 | core/impl-check/rules.test.ts › 후보 짝 노드의 연쇄: 직계 자식의 부모-자식 항목만 확인 필요 직계 자식의 다른 항목(존재·위치·서버 통신 등)은 영향받지 않는다 |
| B04 | IC-09 배치 | 클래스가 있으면 불일치, 없으면 일치 | 잡힘 | 131 | core/impl-check/rules.test.ts › 후보 짝 노드의 연쇄: 직계 자식의 부모-자식 항목만 확인 필요 자식이 있는 노드가 후보 짝이면 그 노드의 항목은 전부 확인 필요이고 결과 카드는 한 장 |
| B05 | IC-10 토큰 | 임의값(대괄호) 판정을 뒤집음 | 잡힘 | 11 | core/impl-check/run.test.ts › 구현 검사: next 묶음의 기대 결과 wrong-IC-10: 확실·확인 필요 카드 |
| B06 | IC-11 바깥 여백 | mx-auto(가운데 정렬)도 바깥 여백 위반으로 봄 | 잡힘 | 1 | core/impl-check/run.test.ts › Tailwind 규칙: 클래스는 항상·조건부·읽지 못함·없음으로 나눠 판정한다 바깥 여백(금지 규칙): margin이 항상 있으면 위반, 조건부·읽지 못함이면 확인 불가, 없으면 준수 |
| B07 | IC-12 인라인 style | style이 없는 요소를 위반으로, 있는 요소를 준수로 봄 | 잡힘 | 132 | core/impl-check/run.test.ts › 구현 검사: next 묶음의 기대 결과 correct: 확실·확인 필요 카드 |
| B08 | ICN-02 server에 use client | server 컴포넌트에 "use client"가 없을 때 위반으로 봄 | 잡힘 | 78 | core/impl-check/run.test.ts › 구현 검사: next 묶음의 기대 결과 correct: 확실·확인 필요 카드 |
| B09 | ICN-04 page.tsx | page.tsx가 화면을 직접 그리면 일치, 재내보내기만 하면 경고 | 잡힘 | 150 | core/impl-check/run.test.ts › 구현 검사: next 묶음의 기대 결과 correct: 확실·확인 필요 카드 |
| B10 | ICR-01 라우터 연결 | 화면 주소가 다른 컴포넌트에 연결돼 있으면 일치로 봄 | 잡힘 | 50 | core/impl-check/run.test.ts › 구현 검사: react 묶음의 기대 결과 correct: 확실·확인 필요 카드 |
| B11 | IC-02 코드에만 있음 | page.tsx 안의 컴포넌트도 '설계에 없는 컴포넌트'로 보고함 | 잡힘 | 2 | core/impl-check/run.test.ts › 구현 검사: next 묶음의 기대 결과 wrong-ICN-04: 확실·확인 필요 카드 |
| B12 | 집계: 일치 수 | 확인 필요 항목을 일치로 셈 | 잡힘 | 36 | core/impl-check/run.test.ts › 구현 검사: next 묶음의 기대 결과 renamed: 설계 준수 일치 M/N과 금지 규칙 집계 |
| B13 | 집계: 코드에 없는 노드 | 코드에 없는 노드의 항목을 불일치가 아니라 확인 필요로 표시 | 잡힘 | 2 | core/impl-check/run.test.ts › 구현 검사: next 묶음의 기대 결과 wrong-IC-01: 설계 준수 일치 M/N과 금지 규칙 집계 |
| B14 | 집계: 금지 규칙 | 코드에 없는 노드의 금지 규칙을 준수로 표시 | 잡힘 | 4 | core/impl-check/run.test.ts › 구현 검사: next 묶음의 기대 결과 wrong-IC-01: 설계 준수 일치 M/N과 금지 규칙 집계 |
| B15 | 집계: 정렬 | 항목이 설계도의 노드 순서를 따라 나와 순서가 입력에 따라 달라짐 | 잡힘 | 66 | core/impl-check/run.test.ts › 집계 구조: next 묶음의 모든 사례 correct: 파일·노드 순서를 섞어도 결과와 카드 id가 같다 |
| B16 | 집계: 카드 id | 카드 id에 노드가 빠져 서로 다른 노드의 카드 id가 같아짐 | 잡힘 | 2 | core/impl-check/rules.test.ts › 후보 짝 노드의 연쇄: 직계 자식의 부모-자식 항목만 확인 필요 직계 자식(Leaf)은 부모-자식 항목만 확인 필요이고, 부모 카드에 묶인다 |
| B17 | 집계: 항목 수 | 설계 준수 항목에서 부모-자식 항목을 빼 전체 수가 줄어듦 | 잡힘 | 75 | core/impl-check/rules.test.ts › 후보 짝 노드의 연쇄: 직계 자식의 부모-자식 항목만 확인 필요 직계 자식(Leaf)은 부모-자식 항목만 확인 필요이고, 부모 카드에 묶인다 |

## 3c: 핵심 규칙 및 근거 원칙 판정

| 번호 | 규칙 | 잘못된 판정 | 결과 | 실패한 테스트 수 | 처음 실패한 테스트 |
| --- | --- | --- | --- | --- | --- |
| C01 | IC-01 코드에 없음 | 코드에 없는 노드의 결과 카드를 내지 않음 | 잡힘 | 4 | core/impl-check/run.test.ts › 구현 검사: next 묶음의 기대 결과 wrong-IC-01: 확실·확인 필요 카드 |
| C02 | IC-04 부모-자식 | 부모가 자식을 렌더링하지 않으면 일치, 하면 확인 필요로 봄 | 잡힘 | 134 | core/impl-check/rules.test.ts › 후보 짝 노드의 연쇄: 직계 자식의 부모-자식 항목만 확인 필요 자식이 있는 노드가 후보 짝이면 그 노드의 항목은 전부 확인 필요이고 결과 카드는 한 장 |
| C03 | IC-04 훅 호출 | 훅을 호출했는지가 아니라 렌더링했는지로 확인해 훅 사용 누락을 잘못 판정 | 잡힘 | 126 | core/impl-check/run.test.ts › 구현 검사: next 묶음의 기대 결과 correct: 확실·확인 필요 카드 |
| C04 | IC-06 props | 코드에 있는 설계 props를 일치가 아니라 없는 것을 일치로 봄 | 잡힘 | 133 | core/impl-check/rules.test.ts › 변이 실험 보강 T2: children·className·key·ref props는 '설계에 없는 props'가 아니다 |
| C05 | IC-06 props | children·className 같은 공통 props를 '설계에 없는 props'로 보고함 | 잡힘 | 1 | core/impl-check/rules.test.ts › 변이 실험 보강 T2: children·className·key·ref props는 '설계에 없는 props'가 아니다 |
| C06 | ICN-01 client | "use client"가 있는 client 컴포넌트를 위반, 없는 것을 일치로 봄 | 잡힘 | 78 | core/impl-check/run.test.ts › 구현 검사: next 묶음의 기대 결과 correct: 확실·확인 필요 카드 |
| C07 | ICN-01 심각도 | 상태·이벤트를 쓰는 경우를 경고, 안 쓰는 경우를 오류로 맞바꿈 | 잡힘 | 2 | core/impl-check/run.test.ts › 구현 검사: next 묶음의 기대 결과 wrong-ICN-01-error: 확실·확인 필요 카드 |
| C08 | ICN-03 타입 import | 타입만 가져오는 import를 위반으로 보고 값을 가져오는 것은 놓침 | 잡힘 | 2 | core/impl-check/run.test.ts › 구현 검사: next 묶음의 기대 결과 wrong-ICN-03: 확실·확인 필요 카드 |
| C09 | ICN-03 client 파일만 | client가 아닌 파일의 import를 검사 | 잡힘 | 75 | core/impl-check/run.test.ts › 구현 검사: next 묶음의 기대 결과 correct: 확실·확인 필요 카드 |
| C10 | ICF-01 계층 방향 | 위 계층을 가져오는 것은 허용, 아래 계층을 가져오는 것을 위반으로 봄 | 잡힘 | 79 | core/impl-check/rules.test.ts › FSD 계층 방향: shared도 위 계층을 가져오면 위반(슬라이스 검사에서만 빠진다) shared가 위 계층(entities)을 가져오면 위반 |
| C11 | ICF-01 슬라이스 | 같은 슬라이스 안 import를 위반, 다른 슬라이스 import를 허용으로 봄 | 잡힘 | 3 | core/impl-check/rules.test.ts › FSD 계층 방향: shared도 위 계층을 가져오면 위반(슬라이스 검사에서만 빠진다) 같은 계층의 다른 슬라이스는 위반(entities끼리), 같은 슬라이스 안은 아님 |
| C12 | ICF-01 app 계층 | app 계층도 검사 대상에 넣음 | 동등 변이 | 0 | - |
| E01 | 근거 원칙: import 해석 | 경로를 풀지 못한 import가 있는데 부모-자식 관계를 불일치로 확정 | 잡힘 | 3 | core/impl-check/run.test.ts › 구현 검사: next 묶음의 기대 결과 alias-unknown: 확실·확인 필요 카드 |
| E02a | 근거 원칙: 서버 통신 유형 | 유형을 알 수 없는(UNKNOWN) 서버 통신을 조회 담당의 근거(일치)로 확정 | 잡힘 | 2 | core/impl-check/run.test.ts › 구현 검사: next 묶음의 기대 결과 fetch-method-unknown: 확실·확인 필요 카드 |
| E02b | 근거 원칙: 서버 통신 유형 | 유형을 알 수 없는(UNKNOWN) 서버 통신을 '조회 안 맡는 노드의 위반'으로 확정 | 잡힘 | 1 | core/impl-check/rules.test.ts › 변이 실험 보강 T3: 서버 통신을 맡지 않는 노드가 유형을 알 수 없는 호출을 하면 확인 필요(위반으로 확정하지 않는다) |
| E03a | 근거 원칙: 조건부 클래스 | 조건부로만 붙는 클래스를 항상 있다고 확정 | 잡힘 | 8 | core/code-model/facts-2c.test.ts › 클래스 분류: ALWAYS · CONDITIONAL · DYNAMIC · ABSENT 항상 > 조건부 > (못 읽은 부분이 있으면) DYNAMIC > ABSENT |
| E03b | 근거 원칙: 조건부 클래스 | 조건부로만 붙는 클래스를 없다고 확정 | 잡힘 | 7 | core/code-model/facts-2c.test.ts › 클래스 분류: ALWAYS · CONDITIONAL · DYNAMIC · ABSENT 항상 > 조건부 > (못 읽은 부분이 있으면) DYNAMIC > ABSENT |
| E03c | 근거 원칙: 읽지 못한 클래스 | 읽지 못한 클래스 값(DYNAMIC)을 없다고(ABSENT) 확정 | 잡힘 | 3 | core/code-model/facts-2c.test.ts › 클래스 분류: ALWAYS · CONDITIONAL · DYNAMIC · ABSENT 항상 > 조건부 > (못 읽은 부분이 있으면) DYNAMIC > ABSENT |
| E04 | 근거 원칙: 알 수 없는 import 경로 | 경로를 알 수 없는 변수 import가 있는데도 짝 없는 노드를 코드에 없다고 확정 | 잡힘 | 4 | core/impl-check/match.test.ts › 시험 데이터의 기대 짝 표(facts.pairs): react 묶음 dynamic-import-variable |
| E05a | 근거 원칙: 두 단계 훅 안의 상태 | 훅이 다시 다른 훅을 불러 그 안에 있는 상태(두 단계)를 근거 없이 이 컴포넌트의 상태로 인정 | 잡힘 | 1 | core/impl-check/rules.test.ts › 훅 안의 상태: 세 조건을 모두 지킬 때만 '상태가 있다' 훅이 다시 다른 훅을 불러 그 안에 상태가 있으면 확인 필요(두 단계) |
| E05b | 근거 원칙: Context·외부 상태 | Context·상태 관리 라이브러리 훅을 쓰면 설계의 상태가 있다고 근거 없이 인정 | 잡힘 | 6 | core/impl-check/rules.test.ts › 훅 안의 상태: 세 조건을 모두 지킬 때만 '상태가 있다' 컴포넌트가 useContext를 쓰면 상태가 없다고 확정하지 않고 확인 필요 |
| E06 | 근거 원칙: 부모 짝이 후보 | 부모 노드의 짝이 후보(확정 아님)인데 자식의 부모-자식 항목을 일치로 판정 | 잡힘 | 2 | core/impl-check/rules.test.ts › 후보 짝 노드의 연쇄: 직계 자식의 부모-자식 항목만 확인 필요 직계 자식(Leaf)은 부모-자식 항목만 확인 필요이고, 부모 카드에 묶인다 |

## 동등 변이(바꿔도 동작이 같아 테스트가 잡을 수 없음)와 근거

- **C12** (ICF-01 app 계층): app은 계층 순서(app, pages, widgets, features, entities, shared)의 맨 위(0번)라 'to 계층이 from보다 위'(indexOf(to) < 0)가 성립할 수 없고, 슬라이스가 없는 계층(SLICED에 없음)이라 '다른 슬라이스' 비교도 성립하지 않는다. 제외 줄이 없어도 app에서는 위반이 나오지 않아 결과가 같다.

## 중립 변이(입력만 바꿔 결과가 같아야 함)

| 번호 | 바꾼 것 | 결과 | 사례 수 | 바뀐 파일 수 | 처음 다른 곳 |
| --- | --- | --- | --- | --- | --- |
| N1 | 줄 바꿈·들여쓰기 다시 쓰기(코드를 다시 출력) | 같음 | 66 | 660 | - |
| N2 | 주석 추가(모든 최상위 문장 앞과 중괄호 뒤) | 같음 | 66 | 660 | - |
| N3 | import 줄 순서 뒤집기 | 같음 | 66 | 162 | - |
| N4 | className 클래스 순서 뒤집기 | 같음 | 66 | 322 | - |
| N5 | 지역 변수 이름 바꾸기(상태가 아닌 const 변수) | 같음 | 66 | 39 | - |
| N6 | 맨 바깥 요소를 <>…</> Fragment로 감싸기 | 같음 | 66 | 463 | - |

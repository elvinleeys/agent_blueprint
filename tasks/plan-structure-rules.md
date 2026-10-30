# 구조 검사 규칙: 진행 기록 (2026-10-30)

스펙과 판정 기준은 `SPEC-structure-rules.md`. 커밋: `311ed72` 규칙·어댑터·테스트, `bfa331b` 화면, 그리고 이번 문서 커밋.

## 단계
- [x] V0 타입·`checkBlueprint`·정렬(`core/rules/types.ts`, `run.ts`)
- [x] V1 NX-04·NX-03·NX-01·NX-02 (`core/adapters/framework/next.ts`)
- [x] V2 R-04·R-07·R-08·R-01·R-06(`common/simple.ts`), R-02·R-03·R-05(`common/relations.ts`)
- [x] V3 CM-01·TW-01·TW-02·HC-01 (`core/adapters/styling/`)
- [x] V4 AR-01~03 (`core/adapters/architecture/fsd.ts`)
- [x] V5 `ViolationsProvider`·`CheckResults`·미리보기·트리 표시, AI 가정 회색 점선
- [x] V6 샘플·회귀·변이·성능
- [x] V7 문서(`CLAUDE.md`, `data-model.md`)

## 검증 결과
- `npx vitest run` 56개 파일 729개 통과, `npx tsc --noEmit`·`npx eslint core lib app components store proxy.ts scripts` 오류 없음, `npm run build` 통과.
- **샘플 설계도(`core/schema/sample-blueprint.json`)는 위반 0건**(오류만이 아니라 경고·정보도 0건).
- **회귀(사전 테스트 응답 원문, `2026-10-29T06-30-55`)**: NX-04는 T-t 4·T-l 3·B-t 5건, AR-02는 T-l 4건으로 채점 기록과 일치. 원문은 선택 필드가 null이라 `stripOptionalNulls`를 거쳐 스키마로 읽는다.
- **변이 실험 10개 모두 테스트가 실패**(소스는 `git checkout`으로 원복하고 변이 문자열이 남지 않았는지 확인):
  - NX-04: 조건 반전(6개 실패), 부모만 확인(1), 항상 빈 결과(4)
  - R-02: 이름 정규화 제거(2), 범용 예외를 항상 적용(3), 범용 예외 제거(1), 노드 1개도 위반(3)
  - R-04: `dataFetch` 조건 제거(2), `kind` 조건 제거(4), `kind` 바꿈(2)
- **성능(1회, 노드 200개: 루트 1·컨테이너 19·컴포넌트 171·훅 9, next+tailwind+fsd로 규칙 전체 실행, 워밍업 20회 후 200회)**: `checkBlueprint` 중앙값 1.52ms, p95 2.21ms, 최대 3.56ms(위반 77건). 선택만 바뀔 때는 다시 계산하지 않는다. 시간 기준은 테스트에 넣지 않았고 측정 파일은 저장소에 남기지 않았다.
- 사전 테스트 응답 전체(스키마를 통과한 10개)에 돌린 건수: NX-04 총 16건(T-t 4·T-l 3·B-t 5·05-59 terra 4), AR-02 4건, NX-03·NX-01 각 1건(05-59 luna), R-02 2건(09-08 luna: `selectedColor`·`selectedSize`가 ProductInfo와 ProductOptions에 중복), R-01 1건, R-07 2건(image 모드 terra 2개). **R-05 후보는 0건**(임계값 0.5·0.4는 보수적이라 오탐 소음은 없었고, 못 잡는 쪽은 실제 사용에서 확인).

## 알려진 한계
- **브라우저 확인 못 함**: 서버 렌더링 스모크 테스트(`components/structure/check-results.render.test.tsx`)로 구성·표시 규칙·문구만 확인했다. 항목 클릭 선택, 편집 후 결과 즉시 갱신, 미리보기·트리의 실제 모양은 사용자가 확인해야 한다.
- R-02는 이름이 다른 같은 상태(`isFavorite`/`favourited`)를 못 잡는다. R-03은 중간 노드가 prop을 쓰는지 알 수 없다. NX-02는 자기 필요가 있는 client 노드에 매달린 큰 server 가능 하위 트리를 판단하지 않는다. HC-01은 설계도 안의 일관성만 본다.
- 어댑터는 검사 규칙만 맡는다. 위치 추천과 지시서 변환은 아직 없다.
- 이번 범위 밖(그대로): 상호작용 책임인데 상태·이벤트 없음(C3), 정의 없는 토큰 참조(C5, 기능 B), 화면 주소 없음(지시서 단계), AI 위반 설명, 규칙 켜기·끄기.

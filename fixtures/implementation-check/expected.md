# 구현 검사 시험 데이터: 기대 결과

이 표는 `expected.json`에서 만든 사람용 요약이다(정본은 JSON). 3단계 테스트가 JSON을 읽어 `checkImplementation` 결과와 **정확히** 비교한다
(확실: 규칙·심각도·노드 집합이 같아야 함. 확인 필요: 규칙·종류·노드·후보가 같아야 함. 표에 없는 결과가 나오면 실패).

## 사례 구조

- `<묶음>/blueprint.json`: 기준 설계도. `next/blueprint.css-modules.json`은 CSS Modules 변형.
- `<묶음>/correct/`: 설계도대로 바르게 구현한 전체 코드.
- `<묶음>/<사례>/`: **correct 위에 덮어쓸 파일만** 둔다. `X.deleted`(빈 파일)는 correct의 `X`를 지운다는 뜻.
- 모든 사례는 correct와 합친 뒤 `tsc --strict`로 컴파일되는 것을 확인했다(타입 오류로 틀린 게 아니라 설계에서만 틀린 코드).
- `ProductInfo.tsx`의 `OPTION_LIMIT`, `ReviewSummary.tsx`의 `MAX_RATING`은 ICN-03·ICF-01 사례가 import할 상수다(correct에서는 어디서도 import하지 않음).

## 판정 약속 (표를 읽을 때 전제)

- 설계의 `events`에 있는 이름(`onChange`, `onClick`)의 `on*` prop은 props 비교(IC-06)에서 제외하고 이벤트(IC-07)로만 본다.
- Tailwind 스타일 토큰은 속성→접두사 대응이 있는 것만 판정한다(color→`text-`, background-color→`bg-`, border-color→`border-`, padding→`p-`, border-radius→`rounded-`). `max-width`·`font-size` 토큰은 대응 클래스가 없어 판정하지 않는다.
- 설계에 있는 클래스가 없고 임의값(`text-[#e11d48]`)도 아니면 IC-10을 걸지 않는다(없는 것은 판정 근거가 약함).
- IC-02는 코드에만 있고 후보도 없는 **내보낸** 컴포넌트에만 건다. 결과의 노드는 코드 컴포넌트 이름(`PromoBanner`).
- IC-05: 같은 이름의 상태가 다른 컴포넌트에 있으면 "누락 + 설계에 없음" 대신 위치 다름 **1건**(노드는 설계상 소유자).
- ICN-03: client 파일이 설계상 server 컴포넌트의 **파일**에서 무언가를 import하면 걸린다(타입 전용 import 제외).
- 확인 필요의 `rule`은 그 항목이 확정되면 걸렸을 규칙: 컴포넌트 짝(IC-01), 상태(IC-05), props(IC-06), CSS 판정 불가(IC-09, 노드마다 1건).

## next 묶음: Next.js + Tailwind + FSD (경로 별칭 `@/` → `src/`)

| 사례 | 확실(규칙 · 심각도 · 노드) | 확인 필요(규칙 · 종류 · 노드 → 후보) | 비고 |
| --- | --- | --- | --- |
| correct | 없음 | 없음 | 설계도대로 바르게 구현 |
| wrong-IC-01 | IC-01 · warning · ReviewSummary | 없음 |  |
| wrong-IC-02 | IC-02 · info · PromoBanner | 없음 |  |
| wrong-IC-03 | IC-03 · warning · AddToCartButton | 없음 |  |
| wrong-IC-04 | IC-04 · warning · PriceTag | 없음 |  |
| wrong-IC-04-hook | IC-04 · warning · useCart | 없음 |  |
| wrong-IC-05 | IC-05 · warning · useCart | 없음 |  |
| wrong-IC-06-missing | IC-06 · warning · PriceTag | 없음 |  |
| wrong-IC-06-extra | IC-06 · warning · PriceTag | 없음 |  |
| wrong-IC-07 | IC-07 · warning · OptionSelector | 없음 |  |
| wrong-IC-08-presentational | IC-08 · warning · PriceTag | 없음 |  |
| wrong-IC-08-missing | IC-08 · warning · useCart | 없음 |  |
| wrong-IC-09 | IC-09 · warning · ProductInfo | 없음 |  |
| wrong-IC-10 | IC-10 · warning · PriceTag | 없음 |  |
| wrong-IC-11 | IC-11 · warning · PriceTag | 없음 |  |
| wrong-IC-12 | IC-12 · warning · ProductGallery | 없음 |  |
| wrong-ICN-01-error | ICN-01 · error · AddToCartButton | 없음 |  |
| wrong-ICN-01-warning | ICN-01 · warning · PriceTag | 없음 |  |
| wrong-ICN-02 | ICN-02 · warning · ProductGallery | 없음 |  |
| wrong-ICN-03 | ICN-03 · error · ProductInfo | 없음 |  |
| wrong-ICN-04 | ICN-04 · warning · ProductDetailPage | 없음 |  |
| wrong-ICF-01-layer | ICF-01 · error · ProductGallery | 없음 |  |
| wrong-ICF-01-slice | ICF-01 · error · ProductGallery | 없음 |  |
| renamed | 없음 | IC-01 · pair · ProductGallery → ItemImages<br>IC-05 · state · useCart → count<br>IC-06 · prop · PriceTag → discount | 이름만 바꿔 구현(ProductGallery→ItemImages, 상태 cartCount→count, prop discountRate→discount) |
| stack-mismatch | 없음 | 없음 | 스택에 맞지 않는 규칙이 걸리지 않아야 함 |
| css-modules | 없음 | IC-09 · style · ProductDetailPage<br>IC-09 · style · ProductGallery<br>IC-09 · style · ProductInfo<br>IC-09 · style · PriceTag<br>IC-09 · style · OptionSelector<br>IC-09 · style · AddToCartButton<br>IC-09 · style · ReviewSummary | 설계도 스타일이 CSS Modules인 변형. 배치·토큰은 코드로 판정하지 않고 노드마다 확인 필요 1건 |

## react 묶음: React + Tailwind + type-based (경로 별칭 `@/` → `src/`)

| 사례 | 확실(규칙 · 심각도 · 노드) | 확인 필요(규칙 · 종류 · 노드 → 후보) | 비고 |
| --- | --- | --- | --- |
| correct | 없음 | 없음 | 설계도대로 바르게 구현 |
| wrong-IC-01 | IC-01 · warning · ReviewSummary | 없음 |  |
| wrong-IC-02 | IC-02 · info · PromoBanner | 없음 |  |
| wrong-IC-03 | IC-03 · warning · AddToCartButton | 없음 |  |
| wrong-IC-04 | IC-04 · warning · PriceTag | 없음 |  |
| wrong-IC-04-hook | IC-04 · warning · useCart | 없음 |  |
| wrong-IC-05 | IC-05 · warning · useCart | 없음 |  |
| wrong-IC-06-missing | IC-06 · warning · PriceTag | 없음 |  |
| wrong-IC-06-extra | IC-06 · warning · PriceTag | 없음 |  |
| wrong-IC-07 | IC-07 · warning · OptionSelector | 없음 |  |
| wrong-IC-08-presentational | IC-08 · warning · PriceTag | 없음 |  |
| wrong-IC-08-missing | IC-08 · warning · useCart | 없음 |  |
| wrong-IC-09 | IC-09 · warning · ProductInfo | 없음 |  |
| wrong-IC-10 | IC-10 · warning · PriceTag | 없음 |  |
| wrong-IC-11 | IC-11 · warning · PriceTag | 없음 |  |
| wrong-IC-12 | IC-12 · warning · ProductGallery | 없음 |  |
| wrong-ICR-01 | ICR-01 · warning · ProductDetailPage | 없음 |  |
| renamed | 없음 | IC-01 · pair · ProductGallery → ItemImages<br>IC-05 · state · useCart → count<br>IC-06 · prop · PriceTag → discount | 이름만 바꿔 구현(ProductGallery→ItemImages, 상태 cartCount→count, prop discountRate→discount) |
| stack-mismatch | 없음 | 없음 | 스택에 맞지 않는 규칙이 걸리지 않아야 함 |

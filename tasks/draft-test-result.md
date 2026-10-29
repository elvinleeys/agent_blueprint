# 초안 생성 테스트 결과

## 실행 2026-10-29T05:37:26.835Z — product-detail

- 설정: effort low, max-output 16000, runs 1, 모델 gpt-6.1-terra, gpt-6-luna (+gpt-6.1-sol은 gpt-6.1-terra 실패 모드에만 1회)
- 단가(1M 토큰당 입력/출력, 2026-10-29 공식 문서): gpt-6.1-terra $1/$5, gpt-6-luna $0.1/$0.5, gpt-6.1-sol $2/$10. 추론 토큰은 출력 토큰으로 과금되며 `출력 토큰`에 이미 포함됨(공식 Reasoning guide, 합산 안 함), 캐시 할인은 반영하지 않음(보수적)
- 누적 예상 비용: $0.0094 / 한도 $1

| 화면 | 모드 | 모델 | 회차 | 스키마 통과 | 실패 필드 | 응답 시간(초) | 입력 토큰 | 출력 토큰 | 추론 토큰(출력에 포함) | 예상 비용($) | 30초 초과 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| product-detail | text | gpt-6.1-terra | 1 | O | - | 16.5 | 1956 | 1254 | 0 | 0.0082 | - |
| product-detail | text | gpt-6-luna | 1 | O | - | 16.2 | 1956 | 1877 | 506 | 0.0011 | - |

## 실행 2026-10-29T05:59:13.065Z — product-detail

- 응답 원문: tasks/draft-outputs/2026-10-29T05-59-13-065Z/
- 설정: effort low, max-output 16000, runs 1, 모델 gpt-6.1-terra, gpt-6-luna (+gpt-6.1-sol은 gpt-6.1-terra 실패 모드에만 1회)
- 단가(1M 토큰당 입력/출력, 2026-10-29 공식 문서): gpt-6.1-terra $1/$5, gpt-6-luna $0.1/$0.5, gpt-6.1-sol $2/$10. 추론 토큰은 출력 토큰으로 과금되며 `출력 토큰`에 이미 포함됨(공식 Reasoning guide, 합산 안 함), 캐시 할인은 반영하지 않음(보수적)
- 누적 예상 비용: $0.0098 / 한도 $1

| 화면 | 모드 | 모델 | 회차 | 스키마 통과 | 실패 필드 | 응답 시간(초) | 입력 토큰 | 출력 토큰 | 추론 토큰(출력에 포함) | 예상 비용($) | 30초 초과 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| product-detail | text | gpt-6.1-terra | 1 | O | - | 17.8 | 1956 | 1367 | 0 | 0.0088 | - |
| product-detail | text | gpt-6-luna | 1 | O | - | 15.6 | 1956 | 1707 | 298 | 0.0010 | - |

## 실행 2026-10-29T06:09:13.223Z — product-detail

- 응답 원문: tasks/draft-outputs/2026-10-29T06-09-13-223Z/
- 설정: effort low, max-output 16000, runs 1, 모델 gpt-6.1-terra, gpt-6-luna (+gpt-6.1-sol은 gpt-6.1-terra 실패 모드에만 1회)
- 단가(1M 토큰당 입력/출력, 2026-10-29 공식 문서): gpt-6.1-terra $1/$5, gpt-6-luna $0.1/$0.5, gpt-6.1-sol $2/$10. 추론 토큰은 출력 토큰으로 과금되며 `출력 토큰`에 이미 포함됨(공식 Reasoning guide, 합산 안 함), 캐시 할인은 반영하지 않음(보수적)
- 누적 예상 비용: $0.0192 / 한도 $1

| 화면 | 모드 | 모델 | 회차 | 스키마 통과 | 실패 필드 | 응답 시간(초) | 입력 토큰 | 출력 토큰 | 추론 토큰(출력에 포함) | 예상 비용($) | 30초 초과 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| product-detail | image | gpt-6.1-terra | 1 | O | - | 26.8 | 6322 | 2039 | 0 | 0.0165 | - |
| product-detail | image | gpt-6-luna | 1 | X | nodes.0.layout.responsive.1.direction: grid의 responsive는 columns만 가질 수 있습니다 | 29.4 | 6321 | 4192 | 176 | 0.0027 | - |

## 실행 2026-10-29T06:30:55.935Z — product-detail

- 응답 원문: tasks/draft-outputs/2026-10-29T06-30-55-935Z/
- 설정: effort low, max-output 16000, runs 1, 모델 gpt-6.1-terra, gpt-6-luna (+gpt-6.1-sol은 gpt-6.1-terra 실패 모드에만 1회)
- 단가(1M 토큰당 입력/출력, 2026-10-29 공식 문서): gpt-6.1-terra $1/$5, gpt-6-luna $0.1/$0.5, gpt-6.1-sol $2/$10. 추론 토큰은 출력 토큰으로 과금되며 `출력 토큰`에 이미 포함됨(공식 Reasoning guide, 합산 안 함), 캐시 할인은 반영하지 않음(보수적)
- 누적 예상 비용: $0.0502 / 한도 $1

| 화면 | 모드 | 모델 | 회차 | 스키마 통과 | 실패 필드 | 응답 시간(초) | 입력 토큰 | 출력 토큰 | 추론 토큰(출력에 포함) | 예상 비용($) | 30초 초과 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| product-detail | text | gpt-6.1-terra | 1 | O | - | 27.2 | 2131 | 2216 | 54 | 0.0132 | - |
| product-detail | image | gpt-6.1-terra | 1 | O | - | 22.1 | 2872 | 1811 | 50 | 0.0119 | - |
| product-detail | both | gpt-6.1-terra | 1 | O | - | 35.7 | 3317 | 3074 | 51 | 0.0187 | 초과 |
| product-detail | text | gpt-6-luna | 1 | O | - | 27.0 | 2131 | 3702 | 339 | 0.0021 | - |
| product-detail | image | gpt-6-luna | 1 | X | nodes.3.layout.responsive.0.direction: grid의 responsive는 columns만 가질 수 있습니다; nodes.0.location.dir: FSD 형식(<계층>/<슬라이스>/<세그먼트>)이 아닙니다 | 27.4 | 2871 | 3503 | 182 | 0.0020 | - |
| product-detail | both | gpt-6-luna | 1 | X | nodes.2.order: 같은 부모 아래 order가 겹칩니다 | 28.4 | 3316 | 3832 | 103 | 0.0022 | - |

### 채점 — expected.md 기준 (실행 2026-10-29T06:30:55.935Z, product-detail)

- 대상: `tasks/draft-outputs/2026-10-29T06-30-55-935Z/`의 응답 원문 6개. 판정은 응답 원문을 읽고 한 수동 판정이며, 스키마 밖 문제는 원문을 훑는 스크립트로 먼저 걸러낸 뒤 확인했다. API 호출 없음.
- 열 이름: `T`=text, `I`=image, `B`=both, `t`=terra, `l`=luna (예: `T-t` = text × terra).
- 판정 기준(사용자 확정): 이름이 달라도 역할이 맞으면 O. 수량·장바구니·찜을 한 노드가 겸하면 그 노드의 책임이 3개 이하(R-01 기준)일 때 O이며, 옵션 선택은 별도 노드여야 한다. 옵션까지 한 노드에 모두 있으면 X(옵션·수량·장바구니 항목). 찜하기도 옵션까지 겸한 노드에 흡수되면 X(I-t, I-l, 사용자 확정). image 모드의 "상품 조회는 page만" 항목은 N/A(채점 제외)이며 아래 "이미지 단독 입력의 한계"에 따로 적었다.
- 스키마 통과: T-t O, T-l O, I-t O, I-l **X**, B-t O, B-l **X**.

| 항목 | T-t | T-l | I-t | I-l | B-t | B-l |
| --- | --- | --- | --- | --- | --- | --- |
| **구조** 루트 page, pages 계층 | O ProductDetailPage `pages/product-detail/ui` | O 동일 | O ProductPage `pages/product-detail/ui` | O ProductPage, 계층은 pages이나 세그먼트가 `page`¹ | O ProductPage `pages/product-detail/ui` | O ProductPage `pages/products/ui` |
| 상품명·탭 / 이미지 / 상품 정보 영역 노드 | O ProductHeader(+ProductTabs), ProductGallery, ProductInfo | O ProductHeader, ProductGallery, ProductInfo | O ProductHeading, ProductTabs, ProductGallery, ProductDetails | O ProductHeading, ProductTabs, ProductGallery, PurchasePanel | O ProductHeading, ProductTabs, ProductGallery, ProductInfo | O ProductHeading, ProductTabs, ProductGallery, ProductInformation |
| 옵션·수량·장바구니 노드 | O ProductOptions, QuantityControl, AddToCartButton 각각 존재 | O VariantSelector(옵션) + PurchaseControls(수량·장바구니·찜, 책임 2개) | X PurchaseOptions 한 노드에 색상·사이즈·수량·장바구니·찜 전부 | X ProductOptions 한 노드에 옵션+수량+구매 전부 | O VariantSelector(옵션) + PurchaseActions(수량·장바구니·찜, 책임 2개) | O ProductOptions(옵션) + PurchaseControls(수량·장바구니·찜, 책임 3개) |
| 찜하기 노드 | O WishlistButton | O PurchaseControls가 겸함(책임 2개, 이벤트 onToggleWishlist) | X 옵션까지 겸한 PurchaseOptions에 흡수(상태 favourited) | X 옵션까지 겸한 ProductOptions에 흡수(이벤트 onToggleFavorite) | O PurchaseActions가 겸함(책임 2개, 이벤트 onFavoriteToggle·상태 isFavorite) | O PurchaseControls가 겸함(책임 3개, 이벤트 onToggleFavorite) |
| **배치** 이미지·상품 정보 같은 줄 | O 루트 grid 2열 | O ProductContent grid 2열 | O ProductContent grid 2열 | O ProductContent grid 2열 | O 루트 grid 2열 | O 루트 grid 2열 |
| 상품명·탭 영역 한 줄 전체 | O ProductHeader placement span "full" | O ProductHeader가 2열 영역(ProductContent) 위 별도 줄 | O ProductHeading·ProductTabs가 flex column에서 ProductContent 위 | O 루트 block에서 ProductContent 위 | O ProductHeading·ProductTabs 모두 span "full" | O ProductHeading·ProductTabs 모두 span "full" |
| 모바일 1열 | O 루트 responsive mobile:1 | O ProductContent mobile:1 (tablet·desktop 2) | O ProductContent mobile:1 | 애매 grid인 ProductContent에 `mobile: direction "column"`(올바른 필드는 columns 1, 스키마 실패 원인) | O 루트 mobile:1 | O 루트 mobile:1 |
| **상태·데이터** 상품 조회는 page만 | O ProductDetailPage만 dataFetch true | O 동일 | N/A 채점 제외(dataFetch true 노드 0개, route도 null)² | N/A 채점 제외(동일)² | O ProductPage만 | O ProductPage만 |
| 탭 선택 상태가 탭 영역 | O ProductTabs.selectedTab | O ProductTabs.selectedTab | O ProductTabs.activeTab | X ProductTabs presentational, state·events 모두 비어 있음 | O ProductTabs.selectedTab | O ProductTabs.selectedTab |
| 옵션(색상·사이즈)·수량 상태가 상품 정보 영역 | O ProductInfo.selectedColor·selectedSize·quantity | O ProductInfo 동일 | O PurchaseOptions.color·size·quantity(상품 정보 영역 안, 상위 ProductDetails는 상태 없음)³ | O ProductOptions.selectedColor·selectedSize·quantity | O ProductInfo 동일 | O ProductInformation 동일 |
| 장바구니 개수는 훅, 중복 없음 | O useCart.cartCount (다른 노드는 prop으로만 받음) | O useCart.cartCount | X 훅 노드 없음 | X 훅 노드 없음 | O useCart.cartCount | O useCart.cartCount(위치 문제는 아래 C2) |
| **규칙** presentational은 dataFetch false | O | O | O | O | O | O |
| 자식 노드 ownsOuterSpacing true 없음 | O | O | O 루트 ProductPage만 true(자식 아님)⁴ | O | O | O |
| 상태·이벤트 노드는 client | O | O | O | O | O | O |
| **O / X / 애매** (14항목, image 모드는 N/A 제외 13항목) | **14 / 0 / 0** | **14 / 0 / 0** | **10 / 3 / 0** | **8 / 4 / 1** | **14 / 0 / 0** | **14 / 0 / 0** |

1. I-l 루트의 `pages/product-detail/page`: 계층은 pages라 O로 봤지만 FSD 세그먼트 형식 위반이며, 스키마 실패 원인 중 하나다.
2. image 모드는 텍스트 스펙이 없어 상품 데이터를 어디서 조회하는지 단서가 이미지에 없다. 사용자 결정으로 채점에서 제외(N/A)하고 "이미지 단독 입력의 한계"로 따로 기록했다.
3. 엄격하게 "상품 정보 영역 노드 자체"를 요구하면 애매다.
4. R-06은 자식 노드가 대상이라 루트는 제외했다. 루트가 바깥 여백(`margin: 0 auto`)을 갖는 것은 R-06 위반이 아니다.

#### 스키마는 통과했지만 실제로는 문제가 있는 사례

스키마 통과 응답은 T-t, T-l, I-t, B-t 4개다. 스키마 실패 응답(I-l, B-l)에서 발견된 같은 유형은 "참고"로 표시했다. 사용자가 든 예시 중 "콜백 prop이 있는데 events가 비어 있음"과 "토큰 참조 형식 오류"는 6개 응답 모두에서 **0건**이었다.

| ID | 유형 | 응답 | 근거(노드·필드) | 잡을 곳 |
| --- | --- | --- | --- | --- |
| C1 | client 노드 아래 server 자식 | T-t ×4, T-l ×3, B-t ×5 (참고: B-l ×4) | T-t: ProductInfo[client] > ProductPriceRating·DeliveryNotice·ReturnNotice·PaymentMethods[server]. T-l: ProductInfo > ProductPriceRating·DeliveryReturnInfo, ProductActions > PaymentMethods. B-t: ProductInfo > PriceRating·DeliveryInfo·ReturnInfo·ShareLinks·PaymentMethods. 설계도에서 부모가 자식을 포함하는 것은 "부모 파일이 자식 파일을 import"하는 것이라, client 파일이 import한 컴포넌트는 server로 남지 않는다 | 규칙. 현재 NX-02("Client 범위가 필요 이상으로 넓음")와 가깝지만 판정 기준이 "client 부모 하위의 server 지정"으로 구체화돼 있지 않아 NX-02 정의 보강 또는 신규 규칙 필요 |
| C2 | server 노드 아래 훅 | 참고: B-l 1건 (스키마 통과 응답에는 없음) | B-l: ProductPage[server] > useCart. 훅은 클라이언트에서만 동작하므로 server 부모 아래에 둘 수 없다 | 규칙(NX-01 확장 후보). 스키마의 "훅은 자식을 가질 수 없다/부모가 될 수 없다"와 별개 |
| C3 | 상호작용 책임이 있는데 state·events가 비어 있고 server | T-l 1건 (참고: I-l ProductTabs) | T-l: ProductGallery[server] 책임 "이전·다음 이미지 이동을 제공한다"인데 state [], events []. 선택 이미지 상태가 없고 client도 아님. 같은 화면의 T-t·B-t는 selectedImageIndex·이벤트를 둠. I-l: ProductTabs 탭 선택이 필요한데 state·events 없음(스키마 실패 응답) | 규칙 필요(책임 텍스트 기반이라 판정이 어려움) → 프롬프트에서 "상호작용 책임이 있으면 state·events를 채운다"고 강제하는 편이 현실적 |
| C4 | FSD 같은 계층 다른 슬라이스(AR-02) | T-l ×4 | ProductInfo(features/product-info/ui) > VariantSelector(features/variant-selector/ui), PurchaseControls(features/purchase-controls/ui), useCart(features/cart/model), ProductActions(features/product-actions/ui). 모두 features 계층의 다른 슬라이스를 자식으로 가짐 | 규칙 AR-02. 스키마의 `location.dir` 형식 검사는 통과하므로 규칙 구현 전에는 잡히지 않음 |
| C5 | 스펙에 정의되지 않은 토큰 참조 | I-t ×1 (참고: I-l ×2) | I-t: ProductContent.layout.gap = `spacing.12`(isToken true). I-l: `spacing.10`, `spacing.3`. image 모드에는 토큰 정의가 없는데도 존재하지 않는 토큰을 참조했고, 같은 응답의 style 값은 `922px`·`#e5e7eb` 같은 하드코딩이라 일관성도 없음. 형식(`spacing.N`)은 올바르므로 "형식 오류"가 아닌 "정의 없음" | 규칙(설계도 토큰이 DS 스펙·입력 토큰에 있는지 대조). image 모드는 입력 토큰이 없으므로 가정 표시(assumed)를 요구하는 쪽이 맞음 |
| C6 | 상품 조회 노드 부재 + route 누락 | I-t, 참고: I-l | dataFetch true 노드가 0개이고 route가 null. presentational 노드는 price·rating 같은 prop을 받지만 값의 출처가 설계도에 없음. route가 없으면 Next+FSD 지시서의 `app/<route>/page.tsx` re-export 규칙을 만들 수 없음 | 규칙 후보("설계도 전체에 dataFetch true 노드가 없음" 경고) 또는 draft 단계에서 route 질의 |
| C7 | 입력 언어와 다른 언어로 작성 | 참고: I-l, B-l | I-l: title "Product Detail", responsibilities 영어. B-l: 스펙이 한국어인데 title·responsibilities 영어. 스키마는 문자열 언어를 보지 않음. I-l은 assumed가 12/12(전 노드)라 가정 표시가 변별력을 잃음. 통과 응답은 T-t 0/16, T-l 0/13, I-t 3/12, B-t 1/13 | 프롬프트("한국어로 작성"). assumed는 설정 기준을 프롬프트에 구체화 |
| C8 | container인데 상태·데이터가 없음 | T-t (경미) | ProductHeader[container, 상태·fetch 없음], PurchaseActions[container, 상태 없이 배치만 담당]. data-model의 container 정의("상태·데이터를 다루고 하위에 전달")와 어긋나지만 동작에는 영향 없음 | 규칙 필요성 낮음 |

#### 관찰 요약

- **text·both** 4건(terra·luna 모두)이 구조·배치·상태·규칙 14항목을 모두 충족했다(14/14). 옵션·수량·장바구니·찜은 겸한 노드의 책임이 3개 이하라는 기준으로 O 처리했다.
- **image 단독**은 옵션까지 한 노드에 몰아 넣었고(I-t, I-l: X), 장바구니 훅이 없으며, I-l은 탭 선택 상태도 놓쳤다. 상품 조회·route처럼 이미지에 없는 정보는 아래 "이미지 단독 입력의 한계"로 분리했다.
- **luna**는 text·both에서 점수는 terra와 같지만 스키마 규칙을 더 자주 어겼다(I-l 2건: grid에 direction, FSD 세그먼트 / B-l 1건: 형제 order 겹침). 구조 규칙 위반은 점수에 나타나지 않는 차이다.
- 스키마 통과 4건 중 **3건에 C1(client>server)**가 있어, 프롬프트만으로는 이 규칙을 지키게 하기 어렵다. 검사 규칙(NX 계열)에서 잡고 설명·수정 제안을 AI에 맡기는 현재 역할 분담(CLAUDE.md)이 타당하다는 근거가 된다.
- 응답 시간은 B-t가 35.7초로 CLAUDE.md의 30초 기준을 넘었다(위 표의 "30초 초과" 열).

#### 이미지 단독 입력의 한계 (채점 제외 또는 별도 기록)

- **상품 조회 위치**: I-t, I-l 모두 dataFetch true 노드가 없다(채점 N/A). 이미지에는 데이터 조회 방식이 드러나지 않는다.
- **route**: 두 응답 모두 null. URL 경로가 이미지에 없어 Next+FSD 지시서의 `app/<route>/page.tsx` re-export 규칙을 만들 수 없다.
- **보이지 않는 동작**: 장바구니 개수 훅(I-t, I-l: 채점 X)과 탭 선택 상태(I-l: 채점 X)처럼 화면 그림만으로는 드러나지 않는 상태·로직은 누락되기 쉽다. 이 두 항목은 채점에서 제외하지 않고 X로 유지했다.
- **토큰·언어**: 디자인 토큰이 입력에 없어 하드코딩 값(`922px`, `#e5e7eb`)과 정의 없는 토큰(`spacing.12`)이 섞였다. assumed 표시는 I-t 3/12, I-l 12/12(전 노드)로 변별력이 낮고, I-l은 영어로 작성했다.


## 결정 사항 (2026-10-29, 사용자 결정)

| 항목 | 결정 | 근거(이 기록의 측정·채점) |
| --- | --- | --- |
| 기본 모델 | `gpt-6.1-terra`, effort `low`. `gpt-6-luna`는 저비용 후보로 보류 | terra는 3개 모드 모두 스키마 통과(luna는 3개 중 1건)이고 text·both 14/14. luna도 text·both 점수는 같지만 스키마 규칙 위반이 더 잦았고(I-l 2건, B-l 1건) 영어 응답이 섞임 |
| 입력 | 스펙 중심, 이미지는 보조. 이미지만 입력하면 스펙 보완 안내가 필요 | image 단독은 상품 조회 위치·route·훅·탭 상태를 놓침(채점 X 또는 N/A), 토큰 정의가 없어 하드코딩 값과 정의 없는 토큰이 섞임 |
| 시간 기준 | 텍스트 45초, 이미지 포함 60초로 조정 제안 | 측정: text 27.2/27.0초, image 22.1/27.4초, both 35.7/28.4초(terra/luna). 현재 기준 30초를 B-t가 초과. **CLAUDE.md의 에러 처리 규칙(30초)은 아직 수정하지 않았다** |
| 규칙 우선순위 | NX-04(client 자손에 server 금지) > NX-03(훅의 부모는 client) > 조회 노드 부재 경고 | C1(client>server)이 스키마 통과 4건 중 3건에서 발생, C2(server 아래 훅)는 B-l에서 발생, C6(조회 노드·route 부재)은 image 모드에서 발생 |

- NX-03, NX-04는 새 규칙 ID이며 CLAUDE.md의 구조 검사 규칙 표(현재 NX-01, NX-02까지)에는 아직 없다. 규칙 구현 전에 표와 `data-model.md` 5절에 추가해야 한다.
- C4(FSD 같은 계층 다른 슬라이스)는 기존 AR-02로 판정된다. 규칙 구현 시 우선순위 표에 별도 항목은 두지 않았다.
## 실행 2026-10-29T09:08:49.165Z — product-detail (프롬프트 v2, lib/ai/draft-blueprint.ts 경유)

- 응답 원문: tasks/draft-outputs/2026-10-29T09-08-49-165Z/ (재시도 응답은 -retry 접미사)
- 설정: effort low, max-output 16000, runs 1, 모델 gpt-6.1-terra, gpt-6-luna (+gpt-6.1-sol은 gpt-6.1-terra 실패 모드에만 1회)
- 마감(재시도 포함 전체): 텍스트만 45초, 이미지 포함 60초. 검증 실패 시 1회 재시도, 남은 시간이 max(첫 시도 시간, 15초) 미만이면 생략
- 단가(1M 토큰당 입력/출력, 2026-10-29 공식 문서): gpt-6.1-terra $1/$5, gpt-6-luna $0.1/$0.5, gpt-6.1-sol $2/$10. 추론 토큰은 출력 토큰으로 과금되며 `출력 토큰`에 이미 포함됨(공식 Reasoning guide, 합산 안 함), 캐시 할인은 반영하지 않음(보수적)
- 누적 예상 비용: $0.0170 / 한도 $1

| 화면 | 모드 | 모델 | 회차 | 스키마 통과 | 시도 | 실패 필드 | 응답 시간(초) | 입력 토큰 | 출력 토큰 | 추론 토큰(출력에 포함) | 예상 비용($) | 마감 초과 | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| product-detail | text | gpt-6.1-terra | 1 | O | 1 | - | 30.0 | 2446 | 2470 | 98 | 0.0148 | - | - |
| product-detail | text | gpt-6-luna | 1 | O | 1 | - | 28.3 | 2446 | 3900 | 279 | 0.0022 | - | - |


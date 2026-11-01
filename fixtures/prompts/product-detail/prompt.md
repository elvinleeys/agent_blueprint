# 상품 상세 화면 — 구현 지시서

## 작업 목표

구현 대상: 상품 상세 화면

이 화면을 설계도대로 구현한다. 무엇을 만들지(화면 개요·규칙·구조·위치·배치·스타일)는 화면 규칙 파일에 있고, 이 지시서는 만드는 절차를 정한다.

## 참조할 규칙 파일

- `.claude/rules/product-detail.md`
- 구현을 시작하기 전에 이 파일을 끝까지 읽는다. 파일이 없으면 구현하지 말고 먼저 보고한다.

## 구현 전 확인

코드를 쓰기 전에 아래를 확인한다.

- Next.js 버전과 라우터 구성(App Router 여부, 기존 `pages/` 폴더)
- 의존성과 package.json의 스크립트(타입 검사·린트·빌드)
- 기존 디렉토리 구조
- 기존 공통 컴포넌트와 디자인 토큰
- API·타입·상태 관리 방식
- 규칙 파일과 실제 프로젝트 구조의 차이

충돌하거나 어긋나면 임의로 고치지 말고, 내용과 영향 범위를 먼저 보고한다.

## 구현 순서

아래 순서에 따라 컴포넌트와 훅을 구현한다. 하위 컴포넌트와 훅을 먼저 구현하고, 이를 사용하는 상위 컴포넌트를 나중에 구현한다.
각 단계가 끝나면 구현한 파일의 타입과 import 관계를 확인하고, 전체 구현이 끝나면 프로젝트의 타입 검사 스크립트를 실행한다.

1. `ProductHeading` — `src/widgets/product-heading/ui/ProductHeading.tsx`
2. `ProductTabs` — `src/widgets/product-tabs/ui/ProductTabs.tsx`
3. `ProductGallery` — `src/widgets/product-gallery/ui/ProductGallery.tsx`
4. `useCart` — `src/widgets/product-info/model/useCart.ts`
5. `PurchaseActions` — `src/widgets/product-info/ui/PurchaseActions.tsx`
6. `FulfillmentInfo` — `src/widgets/product-info/ui/FulfillmentInfo.tsx`
7. `PaymentMethods` — `src/widgets/product-info/ui/PaymentMethods.tsx`
8. `ProductInfo` — `src/widgets/product-info/ui/ProductInfo.tsx`
9. `ProductDetailPage` — `src/pages/product-detail/ui/ProductDetailPage.tsx`
10. 라우팅 파일 — `app/products/[id]/page.tsx`

## 구현 원칙

- 규칙 파일의 구조·책임·상태 위치·배치·스타일을 그대로 따른다.
- 설계에 정의되지 않은 컴포넌트·상태·스타일을 임의로 추가하지 않는다.
- 로딩·오류 같은 예외 상태는 기존 프로젝트에 공통 컴포넌트나 처리 방식이 있으면 그것을 사용한다. 기존 방식이 없으면 임의로 UI나 동작을 정하지 않고, 필요한 예외 상태를 완료 보고에 기록한다.
- 디자인 토큰·공통 컴포넌트·코드 작성 방식은 기존 프로젝트의 것을 재사용한다.
- 규칙 파일과 어긋난다고 판단되면 코드를 바꾸기 전에 보고한다.

## 검증

- 화면 개요의 모든 요소가 구현됐다.
- 각 컴포넌트의 책임과 상태 위치가 규칙 파일의 컴포넌트 구조·상태 소유 요약과 같다.
- 반응형: 규칙 파일의 배치대로 데스크톱·태블릿·모바일에서 확인한다.
- 인터랙션(이벤트)이 동작한다.
- 접근성 항목을 충족한다.
- 프로젝트 스크립트로 `tsc`·린트·빌드를 실행해 오류가 없다.
- 규칙 파일에 인터랙션·예외 기준이 정의돼 있으면 그 기준을 따른다. 정의되지 않은 인터랙션이나 예외 처리는 임의로 구현하지 않고 확인 사항에 기록한다.

## 완료 보고

작업을 마치면 아래를 보고한다.

- 만든 파일
- 완료한 항목
- 실행한 검증 명령과 결과
- 설계와 다르게 한 것과 그 이유
- 확인이 필요한 것

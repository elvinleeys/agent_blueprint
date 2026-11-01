---
paths:
  - "app/products/*/page.tsx"
  - "src/pages/product-detail/ui/**"
  - "src/widgets/product-gallery/ui/**"
  - "src/widgets/product-heading/ui/**"
  - "src/widgets/product-info/model/**"
  - "src/widgets/product-info/ui/**"
  - "src/widgets/product-tabs/ui/**"
---

# 상품 상세 화면 — 화면 규칙

이 파일은 이 화면 하나의 규칙이다. 위 paths의 파일을 만들거나 고칠 때 적용된다. 만드는 절차는 지시서가 맡는다.

## 우선순위

- 디자인 토큰·디렉토리 구조·코드 작성 방식·공통 컴포넌트는 기존 프로젝트를 따른다.
- 이 화면의 구조·책임·상태 위치·배치는 이 파일을 따른다. 기존 프로젝트와 정면으로 충돌하면 임의로 고치지 말고 먼저 보고한다.
- 컴포넌트 구조와 화면 개요가 어긋나면 컴포넌트 구조가 우선이다. 컴포넌트 구조에 없는 요구사항은 구현 전에 보고한다.

## 화면과 스택

- 화면 이름: 상품 상세 화면
- 화면 주소: /products/[id]
- 스택: Next.js · CSS Modules · FSD

### 화면 개요
상품 상세 화면(/products/[id]). 맨 위에 상품명과 탭 영역(일반 정보·상품 상세·리뷰, 리뷰 수 표시)이 있다. 그 아래 왼쪽은 상품 이미지 영역(큰 이미지, 이전·다음 이동, 썸네일 목록), 오른쪽은 상품 정보 영역(가격·할인율, 평점·리뷰 수, 색상·사이즈 선택, 사이즈 가이드 링크, 수량, 장바구니 담기, 찜하기, 배송 안내, 반품 안내, 공유, 결제 수단 표시)이다.

## 규칙

### 디자인 토큰
색상 color.primary, color.text, 간격 spacing.4, spacing.6, 모서리 radius.md, 최대 너비 layout.maxWidth

### 레이아웃·반응형
상품명·탭 영역은 한 줄 전체를 차지한다. 그 아래 데스크톱은 2열 그리드(이미지 영역 | 상품 정보 영역). 상품 정보 영역은 세로로 쌓고, 수량·장바구니 담기·찜하기는 한 줄에 가로로 놓는다. 모바일은 1열로 쌓는다.

### 컴포넌트 규칙
상품 정보 영역은 가격, 색상·사이즈 선택, 수량, 장바구니 담기 버튼, 찜하기 버튼을 포함한다. 배송 안내와 반품 안내, 결제 수단 표시는 표시 전용이다. 표시 전용 영역은 데이터를 직접 요청하지 않는다.

### 상태·데이터
상품 데이터는 페이지에서 한 번 조회한다. 선택된 탭은 탭 영역이 상태로 가진다. 선택한 색상·사이즈·수량은 상품 정보 영역이 상태로 가진다. 장바구니 개수는 장바구니 훅이 관리한다.

### 접근성
이미지에 대체 텍스트, 버튼은 키보드로 조작 가능해야 한다.

### 서버 통신
같은 데이터는 페이지에서 조회한 값을 전달한다. 하위 컴포넌트가 같은 데이터를 다시 조회하지 않는다.

### 스택 규칙
- 상태·이벤트·브라우저 API·훅을 쓰면 Client Component이고, 그 파일은 맨 위에 `"use client"`를 둔다. 쓰지 않으면 Server Component로 둔다.
- Client 파일이 직접 가져오는 컴포넌트는 Client 모듈에 포함된다. Server Component를 Client 파일 안에서 직접 가져오지 않는다.
- Server Component가 만든 UI를 Client Component에 `children` 같은 props로 넘기는 것은 허용한다.
- 서버에서 조회한 데이터는 필요한 Client Component에 props로 전달한다.
- 설계도에서 client 노드 아래 노드는 그 client 파일이 가져오는 컴포넌트다. Server로 유지할 UI는 설계도에서 server 부모 아래 두고, 구현할 때 `children`으로 넘긴다.
- 컴포넌트 전용 스타일은 컴포넌트와 같은 이름의 `<컴포넌트명>.module.css`에 둔다. 전역 CSS에 두지 않는다.
- 디자인 토큰이 기존 테마(또는 CSS 변수)에 있는지 확인하고, 있으면 그대로 사용한다. 없으면 임의의 값을 만들지 않고 확인이 필요한 항목으로 보고한다. 사용자가 값을 확정한 경우에만 정의한다(CSS Modules는 기존 전역 변수 파일).
- FSD 계층은 app > pages > widgets > features > entities > shared 순이다. 아래 계층이 위 계층을 가져오지 않는다.
- 같은 계층의 다른 슬라이스를 가져오지 않는다. 슬라이스는 `ui`·`model`·`api`·`lib`·`config` 세그먼트로 나눈다.

## 금지 사항

인라인 스타일 금지, 자식 컴포넌트가 바깥 margin을 가지지 않는다.

## 상태 소유 요약

상태는 아래 노드가 소유한다. 다른 노드는 props로 받는다.

- ProductTabs: selectedTab
- ProductGallery: selectedImageIndex
- ProductInfo: selectedColor, selectedSize, quantity, isWishlisted
- useCart: cartCount

## 컴포넌트 구조

서버 통신은 서버에서 데이터를 조회하거나 요청을 보내는 노드를 뜻한다. 구체적인 내용은 책임에 적혀 있다.

- **ProductDetailPage** (페이지)
  - 책임:
    - 상품 식별자로 상품 데이터를 한 번 조회한다.
    - 상품 상세 화면을 배치한다.
  - props: params: Promise<{ id: string }>
  - 서버 통신(조회·요청): 예
  - 렌더링: Server Component
  - **ProductHeading** (표시)
    - 책임: 상품명을 표시한다.
    - props: name: string
    - 서버 통신(조회·요청): 아니오
    - 렌더링: Server Component
  - **ProductTabs** (컨테이너)
    - 책임:
      - 일반 정보·상품 상세·리뷰 탭과 리뷰 수를 표시한다.
      - 선택된 탭을 관리한다.
    - 상태: selectedTab(현재 선택된 탭)
    - props: reviewCount: number
    - 이벤트: onClick, onKeyDown
    - 서버 통신(조회·요청): 아니오
    - 렌더링: Client Component
  - **ProductGallery** (컨테이너)
    - 책임:
      - 큰 상품 이미지와 대체 텍스트를 표시한다.
      - 이전·다음 버튼과 썸네일로 이미지를 전환한다.
    - 상태: selectedImageIndex(현재 표시하는 이미지의 순서)
    - props: images: Array<{ src: string; alt: string }>
    - 이벤트: onClick
    - 서버 통신(조회·요청): 아니오
    - 렌더링: Client Component
  - **ProductInfo** (컨테이너)
    - 책임:
      - 가격, 할인율, 평점과 리뷰 수를 표시한다.
      - 색상·사이즈·수량 선택과 사이즈 가이드, 장바구니·찜·공유 동작을 처리한다.
      - 배송·반품 안내와 결제 수단을 배치한다.
    - 상태: selectedColor(선택한 색상), selectedSize(선택한 사이즈), quantity(선택한 수량), isWishlisted(찜 여부)
    - props: product: Product
    - 이벤트: onChange, onClick
    - 서버 통신(조회·요청): 아니오
    - 렌더링: Client Component
    - 사용하는 훅: useCart
    - **useCart** (훅)
      - 책임:
        - 장바구니 개수를 관리한다.
        - 선택한 상품을 장바구니에 담는 기능을 제공한다.
      - 상태: cartCount(장바구니 상품 개수)
      - 서버 통신(조회·요청): 아니오
      - 사용 위치: ProductInfo (Client Component)
    - **PurchaseActions** (표시)
      - 책임:
        - 수량과 장바구니·찜 버튼을 한 줄에 표시한다.
        - 사용자의 조작을 상위 영역에 전달한다.
      - props: quantity: number, isWishlisted: boolean, onQuantityChange: (quantity: number) => void, onAddToCart: () => void, onWishlist: () => void
      - 이벤트: onQuantityChange, onAddToCart, onWishlist
      - 서버 통신(조회·요청): 아니오
      - 렌더링: Client Component
    - **FulfillmentInfo** (표시)
      - 책임: 배송 안내와 반품 안내를 표시한다.
      - props: shippingInfo: string, returnInfo: string
      - 서버 통신(조회·요청): 아니오
      - 렌더링: Client Component
    - **PaymentMethods** (표시)
      - 책임: 결제 수단을 표시한다.
      - props: methods: string[]
      - 서버 통신(조회·요청): 아니오
      - 렌더링: Client Component

## 파일 위치

- 라우팅 파일 `app/products/[id]/page.tsx`은 FSD 페이지(`src/pages/product-detail`의 ProductDetailPage)를 가져와 내보내기만 한다. 다른 로직·마크업을 두지 않는다.
- 라우팅용 `app/` 폴더는 프로젝트 루트에 둔다.
- FSD 계층(app·pages·widgets·features·entities·shared)은 `src/` 아래에 둔다.
- 프로젝트 루트에 빈 `pages/` 폴더를 둔다. Next.js가 `src/pages`를 Pages Router로 인식하지 않게 한다. 기존 프로젝트면 먼저 라우터 구성(App Router 여부, 기존 `pages/` 폴더)을 확인하고, 충돌하면 임의로 고치지 말고 보고한다. 대안으로 FSD의 pages 계층 이름을 `views`로 바꾸는 방법이 있다(보고 후 결정한다).
- import 별칭은 `@/*` → `./src/*`로 설정한다.
- 미들웨어(프록시) 파일은 프로젝트 루트에 둔다.

- ProductDetailPage: `src/pages/product-detail/ui/ProductDetailPage.tsx`
- ProductHeading: `src/widgets/product-heading/ui/ProductHeading.tsx`
- ProductTabs: `src/widgets/product-tabs/ui/ProductTabs.tsx`
- ProductGallery: `src/widgets/product-gallery/ui/ProductGallery.tsx`
- ProductInfo: `src/widgets/product-info/ui/ProductInfo.tsx`
- useCart: `src/widgets/product-info/model/useCart.ts`
- PurchaseActions: `src/widgets/product-info/ui/PurchaseActions.tsx`
- FulfillmentInfo: `src/widgets/product-info/ui/FulfillmentInfo.tsx`
- PaymentMethods: `src/widgets/product-info/ui/PaymentMethods.tsx`

## 배치

설계도의 기본 배치는 데스크톱 기준이고, 괄호 안은 태블릿·모바일에서 바뀌는 값이다.

- **ProductDetailPage**: 자식을 grid 2열(모바일 grid 1열) 배치로 놓는다. 간격 토큰 spacing.6, align-items start.
  - ProductHeading: 한 줄 전체 차지.
  - ProductTabs: 한 줄 전체 차지.
  - ProductGallery: 1칸 차지.
  - ProductInfo: 1칸 차지.
- **ProductInfo**: 자식을 flex 세로 배치로 놓는다. 간격 토큰 spacing.4, align-items stretch.

## 스타일

- **ProductDetailPage** (모듈 스타일)
  - max-width: layout.maxWidth (토큰)
- **ProductHeading** (모듈 스타일)
  - color: color.text (토큰)
- **ProductGallery** (모듈 스타일)
  - border-radius: radius.md (토큰)
- **ProductInfo** (모듈 스타일)
  - color: color.text (토큰)

# 상품 상세 기대 결과

기준: spec.json (sample-blueprint.json이 아님). 이름은 달라도 역할이 맞으면 통과.

## 구조
- [ ] 루트는 page 노드 1개이고, location이 pages 계층 (FSD)
- [ ] 상품명·탭 영역, 이미지 영역, 상품 정보 영역에 해당하는 노드가 각각 있음
- [ ] 상품 정보 영역 안에 옵션 선택, 수량 선택, 장바구니 담기 버튼 노드가 있음
- [ ] 찜하기 노드가 있음

## 배치
- [ ] 이미지 영역과 상품 정보 영역이 같은 줄에 배치됨 (부모 layout이 grid 2열 또는 row flex)
- [ ] 상품명·탭 영역이 한 줄 전체를 차지함 (placement.span이 "full" 또는 2열 영역 위 별도 줄)
- [ ] 모바일에서 1열로 바뀜 (layout.responsive에 mobile 1열)

## 상태·데이터
- [ ] 상품 조회(dataFetch: true)는 page 노드에서만 일어남
- [ ] 탭 선택 상태가 탭 영역 노드에 있음
- [ ] 선택한 옵션(색상·사이즈)과 수량 상태는 상품 정보 영역 노드에 있음
- [ ] 장바구니 개수 상태는 훅 노드에 있고, 다른 노드에 중복되지 않음

## 규칙
- [ ] 표시 전용(presentational) 노드는 dataFetch가 false
- [ ] 자식 노드 중 ownsOuterSpacing이 true인 노드가 없음
- [ ] 상태나 이벤트가 있는 노드는 renderMode가 client
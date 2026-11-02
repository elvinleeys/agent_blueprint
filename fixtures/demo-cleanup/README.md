# 디자인 시스템 정리 예시 (일부러 문제를 넣은 폴더)

디자인 시스템 정리 탭을 눈으로 확인하기 위한 예시다. 기대 결과는 `core/cleanup/demo-cleanup.test.ts`가 고정한다.

| 폴더·파일 | 역할 |
| --- | --- |
| `design-system/` | 공식 컴포넌트 3개: Button(variant 포함), Input, Dialog |
| `design-system.json` | 위 세 컴포넌트를 JSON 스펙으로 적은 것(JSON 붙여넣기 확인용) |
| `app/` | 검사할 코드 8개 |

`app/`에 넣은 문제

| 파일 | 문제 | 기대 결과 |
| --- | --- | --- |
| `ButtonPrimary.tsx` | 공식 Button과 이름·props가 비슷함 | C-02 경고(공식 포함 합치기 후보) |
| `Button.tsx` | 공식 Button과 같은 이름의 별도 구현 | C-05 경고(디자인 시스템 파일을 올린 경우만) |
| `OrderSummaryForm.tsx` | props 9개 | C-03 경고(나누기 후보) |
| `ProductCard.tsx`, `ProductCardWide.tsx` | 이름·props가 서로 비슷함 | C-02 정보(공식이 없는 쌍) |
| `CartPage.tsx`, `SiteHeader.tsx`, `SiteFooter.tsx` | 화면 전용 | C-01 정보(접힌 묶음) |

## 화면에서 해 보기

1. 디자인 시스템 칸: **폴더 업로드**로 `design-system/` 폴더를 올린다(또는 **스펙 JSON 붙여넣기**로 `design-system.json` 내용을 붙여 넣는다).
2. 검사할 코드 칸: **폴더 선택**으로 `app/` 폴더를 올린다.
3. 분석하기.

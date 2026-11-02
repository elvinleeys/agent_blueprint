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

## 화면 숫자와 테스트 숫자의 대응

화면 요약은 `경고 N · 정보 M (서로 비슷한 컴포넌트 a + 공식 목록에 없음 b)`로 보인다. 정보 M은 a+b이고 b는 접힌 "공식 목록에 없음" 묶음이다.

| 올린 방식 | 화면 요약 | 테스트의 기대 결과 |
| --- | --- | --- |
| 디자인 시스템 칸 `design-system/`, 코드 칸 `app/` | 경고 3 · 정보 8 (1 + 7) · 합계 11 | 경고 3, 정보 8 |
| JSON 붙여넣기, 코드 칸 `app/` | 경고 2 · 정보 8 (1 + 7) · 합계 10 | 경고 2, 정보 8 |

## 올리는 방식에 따른 결과

- 디자인 시스템 칸 `design-system/`, 코드 칸 `demo-cleanup/` 전체: 코드 칸의 `design-system/` 파일 3개(Button·Dialog·Input)는 디자인 시스템 칸의 같은 파일이라 비교에서 빠지고, "검사할 코드에서 뺀 같은 파일 3개"에 목록으로 나온다. 내용이 다른 `app/Button.tsx`는 C-05로 남는다(경고 3 · 정보 8).
- 두 칸 모두 `demo-cleanup/` 전체: 코드 파일 11개가 모두 디자인 시스템 칸의 파일과 같아 비교할 코드가 없다. `app/Button.tsx`도 디자인 시스템 칸에 올린 파일이라 공식 구성원이 되므로 C-05가 나오지 않는다. 같은 이름의 Button이 디자인 시스템 칸에서 두 파일에 있다는 알림만 나온다. C-05를 보려면 디자인 시스템 칸에는 `design-system/`만 올린다.

## 화면에서 해 보기

1. 디자인 시스템 칸: **폴더 업로드**로 `design-system/` 폴더를 올린다(또는 **스펙 JSON 붙여넣기**로 `design-system.json` 내용을 붙여 넣는다).
2. 검사할 코드 칸: **폴더 선택**으로 `app/` 폴더를 올린다.
3. 분석하기.

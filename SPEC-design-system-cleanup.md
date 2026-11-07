# Spec: 디자인 시스템 정리 (기능 B) 최소 버전

> **이 문서는**: 팀의 디자인 시스템과 실제 `.tsx` 코드를 비교해 "합치기·나누기 후보"를 찾고, 정리 지시서(.md)를 내보내는 기능 B의 설명서다. 가장 작은 버전만 다룬다.
> **목록에 들어 있는 것**: 목표, 구조 원칙, 현황, 가정 5개, 구현 단계 6개, 비교 판정 기준표(`C-01`~`C-04` 규칙), 파일 구조, 시험 방법, 경계, 업로드 상한, 성공 기준 5개, 알려진 한계, 남은 질문 3개.

단일 기능이라 capability map은 만들지 않는다. 승인 전에는 구현하지 않는다.

## Objective (목표)
팀의 디자인 시스템(공식 컴포넌트·variant·props·토큰)과 실제 `.tsx` 코드를 비교해
(1) 공식 목록에 없는 컴포넌트, (2) 합칠 만한 비슷한 쌍, (3) props가 과한 컴포넌트를 찾고,
정리 지시서(.md)를 내보낸다. 코드 원본은 저장하지 않는다.
사용자: 디자인 시스템을 쓰는 프론트엔드 개발자(AI 에이전트에게 정리를 시키려는 사람).
완료: 파일 여러 개 올리면 결과 3종이 목록으로 나오고, 정리 지시서를 복사·내려받을 수 있다.

## 구조 원칙
(순수 함수는 같은 입력이면 항상 같은 결과를 주고, 화면·DB·네트워크를 쓰지 않는 함수다.)
분석 핵심은 `SourceFile = { path: string; content: string }[]`만 받는 순수 함수(`core/cleanup/`).
입력 방식(업로드, GitHub)은 이 배열을 만드는 쪽에만 있고 분석 코드는 바뀌지 않는다.

## 현황 (읽은 결과)
- 기능 A 완료·배포됨. vitest 859개 통과. 기능 B는 코드 없음. 탭 `design-system`은 `enabled: false` (`Workspace.tsx:19`).
- `core/schema/design-system.ts`는 아직 옛 표기(colors/typography). **data-model.md 4절은 이미 단수형 확정본** → `SPEC-design-system-schema.md`의 Open Question 1은 해소(문서 갱신 불필요, 코드만 맞춤).
- `schema.test.ts`의 DS 거부 테스트 일부는 엉뚱한 이유로 통과 중(보강 필요).
- DB `prompt_exports.source_type`에 `cleanup` 값은 이미 있으나 이번엔 DB 저장 제외 → 사용 안 함.
- `typescript`는 devDependency(`^5`)에만 있다. 새 패키지는 아님.

## Assumptions (가정, 틀리면 알려 주세요)
1. variants = 컴포넌트 props 중 이름이 `variant`인 prop의 문자열 리터럴 유니온 값. 다른 유니온(`size` 등)은 `props[].type`에 원문 그대로 남기고 variants에는 넣지 않음. (DS 스키마의 variants는 평면 목록이라 합치면 의미가 섞임)
2. 컴포넌트 인식: PascalCase 이름의 함수 선언 / 화살표 함수 / `forwardRef`·`memo` 래핑 중 JSX를 반환하는 것. export 여부는 불문, 한 파일에 여러 개 가능. `.tsx`만, `.d.ts`·`*.test.tsx`·`*.stories.tsx` 제외.
3. props 추출: 첫 번째 매개변수의 타입이 인라인 타입 리터럴 / 같은 파일의 `interface`·`type` 별칭일 때. 다른 파일에서 import한 props 타입은 못 읽고 "props를 읽지 못함"으로 표시(건너뛰지 않고 표시).
4. 토큰은 비교 대상이 아님(이번 최소 버전). 스펙 JSON에서만 받는다.
5. 분석은 서버 `POST /api/analyze`에서 한다(CLAUDE.md에 이미 있는 라우트, 세션 401, 본문 저장 안 함). 브라우저에 typescript(수 MB)를 싣지 않기 위함. → `typescript`를 devDependencies에서 dependencies로 옮겨야 함 (아래 Open Question 1).

## 단계 (이 순서)
아래 표는 구현 단계 6개와 단계마다 낼 커밋을 정리한 것이다.

| 단계 | 내용 | 커밋 |
| --- | --- | --- |
| 1 | DS 스키마를 단수형(color·spacing·radius·font·layout)·SPEC-design-system-schema 규칙으로 변경, `sample-design-system.json`, 테스트 보강 | `feat:` 스키마 변경은 단독 커밋 |
| 2 | `core/cleanup/extract.ts`: `.tsx` → 컴포넌트 이름·props·variants (`ts.createSourceFile`만 사용, 프로그램·타입체커 없음) | `feat:` |
| 3 | 스펙 얻기: JSON 직접 입력(스키마 검증) / 디자인 시스템 폴더 지정 → 그 폴더 파일들의 컴포넌트로 `DSComponent[]` 자동 생성 (`core/cleanup/infer-spec.ts`) | `feat:` |
| 4 | `core/cleanup/compare.ts` + 테스트 (기준표 승인 후) | `feat:` |
| 5 | `/api/analyze` + 정리 탭 화면(업로드·결과·지시서 내보내기), `core/prompt/cleanup-prompt.ts` | `feat:` |
| 6 | (시간 남으면) 공개 GitHub 저장소 → `.tsx` 가져오기 | `feat:` |

## 비교 판정 기준표 (구현 전 승인 요청)
아래 표는 비교 규칙 `C-01`~`C-04`가 무엇을 어떤 기준으로 찾는지 정리한 것이다. (Jaccard는 두 집합이 얼마나 겹치는지 0~1로 나타낸 값이다. 1이면 완전히 같다.)

입력: `DSComponent[]`(공식) + 분석된 컴포넌트 목록(파일 경로 포함). 디자인 시스템 폴더에서 자동 생성한 경우 그 폴더 안 컴포넌트는 "공식"이라 비교 대상 후보에서 제외한다. 상수는 `core/cleanup/compare.ts` 위쪽 한 곳.

| ID | 결과 | 판정 | 심각도 |
| --- | --- | --- | --- |
| C-01 공식 목록에 없음 (공식 이름 아님) | 공식 이름과 대소문자까지 같은 이름이 없는 컴포넌트 | 이름 정확 일치 여부 | 경고 |
| C-02 합치기 후보 | 공식이 아닌 컴포넌트 A와 다른 컴포넌트 B(공식 포함, 공식끼리는 제외) | (이름 단어(PascalCase 분리) Jaccard ≥ 0.5) **그리고** (props 이름 집합 Jaccard ≥ 0.5, 양쪽 props가 1개 이상). 같은 이름이 다른 파일에 중복돼도 이름 Jaccard=1이라 같은 기준으로 잡힘. 이어진 후보는 묶음 1건(R-05 방식) | 정보 |
| C-03 나누기 후보 | props가 9개 이상(`MAX_PROPS = 8` 초과)인 컴포넌트 | props 개수 | 경고 |
| C-04 읽지 못함 (props 타입 못 읽음) | props 타입을 못 읽은 컴포넌트(import한 타입 등) | 추출 단계 표시 | 정보 |

근거: R-05(이름 Jaccard 0.5 + 내용 유사도)·R-01(책임 과다)의 기존 기준과 맞춤. 8개 기준은 임의 기준이라 사용해 보고 조정(상수 하나).
미포함(범위 밖): 공식 컴포넌트와 같은 이름인데 props·variants가 다른 경우(드리프트), 토큰 하드코딩 값 검사.

## Commands (명령어)
```
npm test                          # vitest run
npx vitest run core/cleanup
npx tsc --noEmit                  # 커밋 전 필수
npm run lint
npm run build
```

## Project Structure (파일 구조, 추가분)
```
core/cleanup/types.ts            # SourceFile, AnalyzedComponent, CleanupFinding
core/cleanup/extract.ts          # .tsx → 컴포넌트 목록 (+ 테스트)
core/cleanup/infer-spec.ts       # 폴더 지정 → DSComponent[]
core/cleanup/compare.ts          # C-01~C-04 (+ 테스트)
core/prompt/cleanup-prompt.ts    # 정리 지시서(템플릿, AI 호출 없음). export-common의 block·toDocument 재사용
lib/api/analyze-handler.ts       # 세션 확인·제한 검사·분석 호출
app/api/analyze/route.ts         # 라우팅만
components/design-system/        # 정리 탭: 입력·결과 목록·내보내기
lib/client/                      # 파일 읽기·개수·크기 검사
```

## Code Style (코드 스타일)
기존과 동일: core는 순수 TS(React·Next·브라우저 API 금지), Zod `PascalCase+Schema`, 같은 입력 → 같은 출력, 인라인 스타일·임의값·색 직접 쓰기 금지.

## Testing Strategy (시험 방법)
- extract: 함수/화살표/forwardRef/memo, interface·type 별칭·인라인 props, variant 유니온, 제외 파일, import한 타입(C-04), 문법 오류 파일이 전체를 깨지 않음
- compare: 기준표의 경계값(Jaccard 0.5 직전·직후, props 8개/9개), 공식끼리 제외, 같은 이름 중복
- infer-spec: 결과가 `DSComponentSchema`를 통과(variant 형식 위반 값은 버리고 경고)
- 지시서: 같은 입력 같은 출력, 결과가 없을 때 안내
- 화면: 서버 렌더링 스모크(기존 방식), 상한 검사
- 실제 OpenAI 호출 없음(이번 범위에 AI 자체가 없음)

## Boundaries (경계: 항상 / 먼저 물어봄 / 하지 않음)
- Always(항상): 커밋 전 `tsc`, 단계별 작은 커밋, 업로드 상한을 클라이언트와 서버 둘 다 검사, 코드 원본 저장·로그 금지
- Ask first(먼저 물어봄): 새 패키지, `typescript`를 dependencies로 이동, `/api/analyze` 본문 형식, 단계 6의 GitHub 호출 방식
- Never(하지 않음): AI 설명·정리 결과 DB 저장·코드 자동 수정·비공개 저장소·추가 OAuth 권한, 기존 어댑터·규칙 수정

## 업로드 상한 (제안)
`.tsx` 30개까지(CLAUDE.md), 파일당 200KB, 합계 1MB(함수 본문 한도 4.5MB 이내), 스펙 JSON 200KB. 초과 시 올리기 전 안내.

## Success Criteria (성공 기준)
1. 샘플 `.tsx` 여러 개 + 스펙 JSON으로 C-01~C-03 결과가 기대대로 나온다(테스트로 고정).
2. 디자인 시스템 폴더 지정 시 스펙이 자동 생성되고 `DSComponentSchema`를 통과한다.
3. 정리 지시서가 복사·`.md` 내려받기 된다. 같은 입력이면 같은 내용.
4. 코드 원본이 DB·로그에 남지 않는다.
5. `vitest`·`tsc --noEmit`·`lint`·`next build` 통과.

## 알려진 한계 (실제 코드에서 못 읽는 경우가 많으면 나중에 보완)
- `@/` 같은 tsconfig 경로 별칭 import는 따라가지 않는다(상대 경로만). 못 읽은 타입은 `unresolved`로 남는다.
- `export { X } from "./y"` 재내보내기를 거쳐 가져온 타입·cva는 따라가지 않는다.
- 패키지(`node_modules`)의 타입, 올리지 않은 파일의 타입은 읽지 못한다. `typeof 라이브러리.컴포넌트`는 상속한 컴포넌트로 이름만 기록한다.
- 완전한 타입 검사기(program) 기반 분석은 고도화 목록에 둔다.
- 디자인 시스템 폴더에서 자동 생성한 스펙은 컴포넌트 목록만 만든다(토큰은 JSON 입력으로만).

## Open Questions (남은 질문)
1. `/api/analyze`(서버 분석)를 위해 `typescript`를 `devDependencies`→`dependencies`로 옮겨도 될까요? (새 패키지는 아님) 싫으면 브라우저 분석으로 바꾸되 번들이 커집니다.
2. 기준표의 임계값(Jaccard 0.5, props 8개)과 "variant 이름 한정" 가정이 괜찮은가요?
3. 폴더 업로드(`webkitdirectory`)로 경로를 받아도 되는지, 아니면 파일 여러 개 선택 + 경로 접두사 직접 입력만 할지?

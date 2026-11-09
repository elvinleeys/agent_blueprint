# 구현 검사 채점 (`npm run score`)

화면 없이 터미널에서 구현 검사를 돌려 숫자만 뽑는 명령이다. 같은 설계도로 만든 지시서를 바꿔 가며 에이전트가 만든 코드를 채점해 **지시서 효과를 비교**하는 데 쓴다.
판정은 화면·API와 같은 `checkImplementation`을 그대로 쓴다. AI를 부르지 않고 DB도 쓰지 않으며, 설계도는 파일로 받는다.

## 사용법

```bash
npm run score -- --blueprint <설계도 JSON 파일> --code <코드 폴더> [옵션]
```

| 옵션 | 뜻 |
| --- | --- |
| `--blueprint <파일>` | 설계도 JSON(필수). 앱의 설계도와 같은 형식(`BlueprintSchema`)이며 형식이 틀리면 원인 필드를 보여 주고 끝난다 |
| `--code <폴더>` | 검사할 코드 폴더(필수). 경로는 화면에서 폴더를 올릴 때처럼 폴더 이름으로 시작한다 |
| `--tsconfig <파일>` | 폴더 밖의 tsconfig를 프로젝트 맨 위 설정(`<폴더>/tsconfig.json`)으로 간주해 쓴다(폴더의 같은 경로 설정은 이것으로 바뀐다). 폴더 안의 `tsconfig.json`·`jsconfig.json`은 옵션 없이도 읽는다 |
| `--json` | 같은 내용을 한 줄 JSON으로 출력(여러 결과를 모아 비교) |
| `--all` | 코드 폴더 전체를 읽는다(기본은 설계도 위치 기준, 아래) |
| `--max-files N` | 분석할 파일 수 상한(기본 1000) |
| `--max-file-kb N` | 파일 하나 크기 상한(기본 1024KB) |
| `--max-total-mb N` | 합계 크기 상한(기본 20MB) |

종료 코드: 채점이 끝나면 위반이 있어도 0, 입력 오류·상한 초과는 1.

## 어떤 파일을 읽나

거르기 규칙은 업로드와 같다(`.ts`·`.tsx`와 `tsconfig.json`·`jsconfig.json`, `node_modules`·`.next`·`dist` 등 제외 폴더와 `.d.ts`·테스트·스토리 제외).

**기본: 설계도 위치 기준.** FSD처럼 화면 하나의 코드가 여러 폴더에 흩어지므로, 하위 폴더 하나가 아니라 설계도 노드의 위치에서 출발한다.

1. 설정 파일(tsconfig·jsconfig)은 모두 읽는다.
2. 노드의 `location.dir`(예: `entities/product/ui`)이 경로 중간에 그대로 들어 있는 폴더의 파일(앞에 `src/`가 붙어도 된다).
3. 2번 파일이 가져오는(import) 파일을 끝까지 따라간다. 설계 위치가 아닌 곳에 둔 파일도 이렇게 들어와 "코드에 없음"이 아니라 "위치 다름"으로 판정된다.
4. 2번 파일을 직접 가져오는 파일(화면 진입 파일: `app/…/page.tsx`, 라우터 설정)도 읽는다. 진입 파일이 가져오는 것은 따라가지 않는다(라우터가 앱 전체를 끌어오지 않게).

한계: 위치 밖에 있으면서 어디서도 가져오지 않는 컴포넌트는 읽지 못한다. 그래서 "설계에 없는 컴포넌트"를 놓칠 수 있고, 출력에 "설계도 위치 기준으로 읽음" 줄을 적는다. 전체를 보려면 `--all`.

**상한**은 내 컴퓨터용이다(서버 보호용 상한 30개·1MB와 별개, `core/impl-check/score.ts`의 `LOCAL_LIMITS`). 분석할 파일(위치 기준으로 고른 결과 또는 `--all`의 전체)에만 걸며, 넘으면 넘은 항목과 바꿀 옵션을 알려 준다.

## 출력

```
$ npm run score -- --blueprint fixtures/implementation-check/next/blueprint.json --code fixtures/demo-implementation-check/renamed

구현 검사 채점: 상품 상세 (next · tailwind · fsd)
코드: renamed (11개 분석 / 폴더의 대상 파일 11개, 설정 파일 1개 읽음 / 못 따라간 설정 0개)
읽은 방식: 설계도 위치 기준으로 읽음(노드 위치 + 가져오는 파일 + 화면 진입 파일). 위치 밖에서 가져오지 않는 "설계에 없는 컴포넌트"는 찾지 못합니다. 전체를 보려면 --all

설계 준수   설계 항목 65개 중 일치 56개 · 불일치 0개 · 확인 필요 9개
금지 규칙   위반 0개 · 확인 불가 2개
설계 밖     0건
결과 카드   확실 0장 · 확인 필요 3장
```

`--json`:

```json
{"blueprint":{"file":"…/blueprint.json","title":"상품 상세","stack":{"framework":"next","styling":"tailwind","architecture":"fsd"}},"code":{"source":"…/renamed","mode":"blueprint-locations","files":11,"scanned":11,"configs":{"read":1,"unsupported":0}},"design":{"total":65,"match":56,"mismatch":0,"review":9},"ban":{"violated":0,"unknown":2},"outsideDesign":{"count":0,"messages":[]},"cards":{"certain":0,"review":3}}
```

- `code.mode`: `blueprint-locations`(위치 기준) 또는 `all`. `files`는 분석한 파일 수(설정 파일 포함, 화면의 "파일 N개"와 같은 기준), `scanned`는 거르기를 통과한 폴더의 대상 파일 수.
- `outsideDesign.messages`와 텍스트의 "설계 밖" 목록은 메시지 뒤에 파일 경로를 붙인다(`— <경로> 에서 내보냄`). 같은 이름이 여러 파일에 있어도 구분된다.
- 집계(`design`·`ban`)는 화면의 집계 줄과 같은 값이다. 확정한 짝(`confirmed`)은 받지 않으므로 화면에서 짝짓기 전의 결과와 같다.

React Router로 해 보기: `--blueprint fixtures/score/react-router-blueprint.json --code fixtures/score/react-router`(위치 기준이면 라우터 `src/router.tsx`를 화면 진입 파일로 읽고 59개 모두 일치, `--all`이면 라우터에만 연결된 설정 화면 2개가 "설계 밖"으로 나온다).

시연 세트로 해 보기: `--code fixtures/demo-implementation-check/correct`(65개 중 일치 65), `renamed`(일치 56·확인 필요 9), `warning`(일치 64·불일치 1·금지 규칙 위반 2).

## 코드 구성

- `core/impl-check/score.ts`: 거르기 → (위치 기준 고르기) → 상한 → 분석·검사 → 숫자, 텍스트·JSON 출력(순수 함수)
- `core/impl-check/select-files.ts`: 설계도 위치 기준 고르기(순수 함수)
- `lib/score/read-local.ts`: 내 컴퓨터 폴더 읽기. 코드 읽기를 여기로 분리해 두었으므로 GitHub 공개 저장소 입력은 같은 모양(`{ path, content }[]`)을 돌려주는 파일을 더하면 된다
- `scripts/score.ts`: 인자 읽기·설계도 검증·출력

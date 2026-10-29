# Spec: OpenAI 구조 초안 생성 사전 검증 (기능 A, F-004 사전 검증)

단일 기능(검증 실험)이라 capability map은 만들지 않는다. 구현은 승인 후 시작한다.
작업 순서와 태스크는 `tasks/plan-draft-test.md` 참조.

## Objective
`/api/draft`를 만들기 전에, OpenAI Responses API가 스펙 7개 항목과 와이어프레임 이미지로 `BlueprintSchema`를 통과하는 설계도를 만들어 내는지 확인한다. 통과 여부, 실패 필드, 응답 시간, 토큰 사용량을 기록해 F-004 구현 방식(프롬프트, 스키마 강제, 재시도)을 정하는 근거로 쓴다.

완료 기준: 같은 화면을 **텍스트만 / 이미지만 / 텍스트+이미지** 3가지로 실행했을 때 세 경우 모두 `BlueprintSchema` 검증을 통과한다.

## 조사 결과 (공식 문서 기준, 2026-10-29 확인)

### 모델·가격
| 항목 | 내용 |
| --- | --- |
| 기본 모델 | `gpt-6.1-terra` (텍스트+이미지 입력, 텍스트 출력, Responses API·Structured Outputs 지원) |
| 가격 (표준, ≤272K 입력, 1M 토큰당) | 입력 $1.00 / 캐시 입력 $0.05 / 출력 $5.00. 272K 초과 시 입력 2배·출력 1.5배 |
| 이미지 | 별도 단가 없이 모델의 입력 토큰 단가로 청구 (공식 가격 페이지에 이미지 전용 단가 없음) |
| 비교용 상위 모델 | `gpt-6.1-sol` $2.00 / $10.00 (terra가 실패하면 시도) |
| 컨텍스트 | 1,050,000, 최대 출력 128,000 |
| Rate limit (Build 티어) | 5,000 RPM / 1,000,000 TPM |

- 출처: developers.openai.com/api/docs/pricing, developers.openai.com/api/docs/models/gpt-6.1-terra
- CLAUDE.md 지시("모델명·가격은 작업 중 공식 문서로 재확인")에 따라 구현 시작 시점에 한 번 더 확인한다. 이미지 입력 지원 여부는 terra 모델 페이지의 "Input: text, image"로 확인했다.

### Structured Outputs와 Zod v4
- OpenAI SDK(`openai ^7.45.1`)의 `helpers/zod`는 Zod v4를 지원한다(`zod/v4`의 `toJSONSchema` 사용). **호환성 자체는 문제없다.**
- 그러나 `zodTextFormat(BlueprintSchema, "blueprint")`는 **현재 실패한다**(로컬 실행으로 확인):
  `Schema field at properties/nodes/items/properties/assumedFields uses .optional() without .nullable() which is not supported by the API`
- 원인은 strict 모드 규칙: 모든 필드가 `required`에 있어야 하고(선택 필드는 `null` 유니온으로 표현), 모든 객체에 `additionalProperties: false`. `BlueprintSchema`에는 `.optional()` 필드가 있다(`assumedFields`, `LayoutSpec.direction/columns/align/justify/responsive`, `StyleSpec.classPattern`, `StateItem.description`).
- 지원 키워드: `pattern`, `minItems/maxItems`, `minimum/maximum`, `anyOf`, `$defs/$ref`, `const/enum`. 미지원: `allOf`, `not`, `if/then/else`. 한도: 객체 프로퍼티 합계 5000, 중첩 10단계. `BlueprintSchema`는 한도 안이다(중첩 약 4단계).
- **스키마는 수정하지 않는다.** 우회: `z.toJSONSchema(BlueprintSchema)`로 JSON Schema를 만들고 변환 함수 `toStrictJsonSchema`가
  1. 모든 객체의 `additionalProperties`를 `false`로,
  2. 원래 선택이던 필드를 `required`에 넣고 `null` 허용으로 바꾼다.
  응답을 받으면 `stripOptionalNulls`가 **원래 선택이던 필드의 `null`만** 제거한 뒤 `BlueprintSchema`로 검증한다(`parentId`, `layout` 등 원래 nullable 필드의 `null`은 유지).
- JSON Schema로 표현되지 않는 규칙(superRefine 전부)은 스키마로 강제되지 않는다: 루트 1개, id·name 고유, 형제 order 겹침, 훅 규칙, `renderMode`의 framework 의존, placement↔부모 grid, FSD `location.dir` 형식 등. → **프롬프트에 명시하고, 위반은 `BlueprintSchema` 검증 실패로 기록**한다. 이것이 이 실험이 재려는 핵심이다.
- 응답 처리: `status`가 `incomplete`이면 `incomplete_details.reason`을 기록, 출력 항목이 `refusal`이면 스키마 미준수로 기록한다.

## Assumptions (틀리면 알려주세요)
1. 호출은 Node 스크립트(서버 측)에서만 한다. 화면·API 라우트는 만들지 않는다(CLAUDE.md 필수 규칙 위반 없음).
2. 모델: 기본 `gpt-6.1-terra`, 비교 `gpt-6-luna`(이미지 입력·Structured Outputs 지원을 공식 문서로 확인함, $0.10/$0.50). `gpt-6.1-sol`($2/$10, 동일 지원 확인)은 terra가 실패한 모드에 한해 1회씩만 실행(`--no-sol`로 끔). 추론 강도는 기본 `low`, `--effort`로 변경.
3. 케이스당 1회 호출(모드 3개 × 모델 2개 = 6회)이 기본이며, `--runs N`으로 반복한다. LLM 출력은 확률적이라 1회 통과가 안정성을 뜻하지는 않는다.
4. 재시도(F-004의 "검증 실패 시 1회 재시도")는 이번 범위에 넣지 않는다. 1차 시도 결과만 기록한다.
5. 키는 환경변수 `OPENAI_API_KEY`에서만 읽는다. 실행은 사용자가 `! npm run test:draft`로 하고(승인됨), 저는 `.env.local`을 읽지 않는다(`Read(.env.local)` 거부 규칙 유지).
7. **예산(API 잔액 $5)**: 호출 전에 "누적 예상 비용 + 이번 호출의 출력 상한 비용"이 `--max-cost`(기본 $1)를 넘으면 중단하고 그때까지의 결과를 기록한다. 호출당 `max_output_tokens`는 기본 16000(`--max-output`)이며 추론 토큰도 이 안에 든다. 비용은 응답 `usage`의 입력·출력 토큰 × 단가로 계산하고, 추론 토큰은 출력 토큰으로 과금되며(공식 Reasoning guide 명시) `output_tokens`에 이미 포함되어 있다(같은 문서의 usage 예시: output 1186 = 추론 1024 + 눈에 보이는 출력 162). 그래서 추론 토큰을 따로 더하지 않는다. "포함"이 문장으로 명시된 것은 아니고 예시 수치에 근거하므로 첫 실제 응답의 usage로 재확인하고, 추론 토큰이 출력 토큰보다 크면 스크립트가 경고한다. 캐시 할인은 반영하지 않아 비용을 높게 잡는다.
8. 이미지(`wireframe.png|jpg|webp`)와 `expected.md`는 사용자가 준비한다. 이미지가 없으면 `--modes text`만 실행할 수 있고, image·both는 비용이 들기 전에 안내 후 종료한다.
6. 응답 시간 30초 초과는 CLAUDE.md 에러 규칙(OpenAI 타임아웃 30초) 위반이므로 표에 별도 표시한다. 스크립트의 클라이언트 타임아웃은 90초로 두어 실제 소요 시간을 측정한다.

## 범위
| 산출물 | 내용 |
| --- | --- |
| `core/prompt/draft-prompt.ts` | `buildDraftPrompt({ spec, stack })` → `{ instructions, userText }` (이미지 여부는 `spec.imageCount > 0`으로 판단). 순수 함수, React·Next import 금지. 비어 있는 스펙 항목은 생략, 설계도 규칙(평면 배열·parentId, 배치 책임은 부모, location 규칙, renderMode 규칙, 훅 규칙, assumed 표시)을 지시문에 포함 |
| `core/prompt/strict-json-schema.ts` (승인됨) | `toStrictJsonSchema`, `stripOptionalNulls`. 순수 함수라 이후 `/api/draft`가 그대로 재사용한다 |
| `scripts/test-draft.ts` | 픽스처를 읽어 3가지 모드로 Responses API 호출 → strip → `BlueprintSchema.safeParse` → 결과 기록 |
| `fixtures/wireframes/<화면>/` | `wireframe.png`(사용자 준비), `spec.json`(`{ stack, ...SpecInput 텍스트 7항목 }`, `product-detail`은 작성 완료), `expected.md`(사용자 작성) — 첫 화면은 `product-detail`(= sample-blueprint.json과 같은 상품 상세) |
| `tasks/draft-test-result.md` | 스크립트가 생성하는 결과 표 |

## 결과 표 형식 (`tasks/draft-test-result.md`)
| 화면 | 모드 | 모델 | 스키마 통과 | 실패 필드(경로: 메시지) | 응답 시간(초) | 입력 토큰 | 출력 토큰 | (추론 토큰, 출력에 포함) | 비용($) | 30초 초과 |

- 비용은 usage 토큰 × 위 단가로 계산한다.
- 실패 필드는 Zod issue의 `path`와 `message`를 최대 10개까지 적는다.

## Tech Stack
TypeScript, Zod ^4.6.7, openai ^7.45.1(Responses API), vitest ^5, **tsx(신규 devDependency 제안)**.

## Commands
```
npm run test:draft -- --screen product-detail --runs 1   # = tsx --env-file=.env.local scripts/test-draft.ts
  옵션: --models gpt-6.1-terra,gpt-6-luna  --modes text,image,both  --effort low  --max-cost 1
        --max-output 16000  --no-sol  --dry-run(API 호출 없이 요청 형태·스키마 크기·비용 상한 출력)
npx vitest run core/prompt
npx tsc --noEmit
npx eslint core scripts
```
- `tsx`가 필요한 이유: Node 24의 타입 스트립 실행은 상대 import에 `.ts` 확장자를 요구하는데, tsconfig에 `allowImportingTsExtensions`가 없어 `tsc`(PostToolUse 훅)가 실패한다. tsconfig 변경보다 tsx 추가가 영향이 작다.

## Project Structure
```
core/prompt/draft-prompt.ts            # 프롬프트 생성 (순수)
core/prompt/draft-prompt.test.ts
core/prompt/strict-json-schema.ts      # JSON Schema 변환·null 제거 (순수, 제안)
core/prompt/strict-json-schema.test.ts
scripts/test-draft.ts                  # 실행 스크립트
fixtures/wireframes/<화면>/{wireframe.png, spec.json, expected.md}
tasks/draft-test-result.md             # 결과 표
```
CLAUDE.md의 "폴더 구조" 절에 `scripts/`, `fixtures/`, `tasks/`가 없다. "구조가 바뀌면 갱신" 규칙에 따라 해당 절에 추가한다.

## Code Style
기존 `core/schema/*.ts`와 같은 스타일(Zod, `z.infer`, 파일당 책임 1개).
```ts
export function buildDraftPrompt(input: { spec: SpecInput; stack: Stack; hasImage: boolean }): {
  instructions: string;
  userText: string;
}
```

## Testing Strategy
- **오프라인(API 없음, vitest)**
  - `buildDraftPrompt`: 채워진 항목만 포함, 빈 항목 생략, 스택 값 포함, hasImage 분기.
  - `toStrictJsonSchema`: 모든 객체가 `additionalProperties: false`이고 `required`가 `properties`와 같다. `BlueprintSchema`의 선택 필드가 `null` 허용이다.
  - 왕복: `core/schema/sample-blueprint.json`에 선택 필드의 `null`을 채운 뒤 `stripOptionalNulls`를 거치면 `BlueprintSchema`를 통과하고 원본과 같다. 원래 nullable 필드의 `null`은 유지된다.
- **온라인(실제 API)**: 사용자가 `npm run test:draft`로 실행, 3모드 × 화면별 결과 표 생성.

## Boundaries
- Always: 키는 환경변수로만, 호출은 스크립트에서만, 응답은 즉시 `BlueprintSchema`로 검증, 결과는 표로 기록
- Ask first: `core/schema/` 수정(필요해지면 먼저 질문), 새 의존성(`tsx`), 범위 추가 파일(`strict-json-schema.ts`), 모델 변경에 따른 비용 증가
- Never: 화면·API 라우트 작성, API 키 하드코딩·커밋·로그 출력, `.env.local` 읽기, 스키마 수정, 응답 원문을 저장소에 커밋(표에는 요약만)

## Success Criteria
1. 오프라인 테스트 전부 통과, `tsc --noEmit`·`eslint` 통과.
2. 같은 화면의 텍스트만 / 이미지만 / 텍스트+이미지 3모드가 모두 `BlueprintSchema` 검증을 통과한다(1차 시도 기준).
3. `tasks/draft-test-result.md`에 모드별 통과 여부, 실패 필드, 응답 시간, 토큰, 비용이 기록된다.
4. 모델명·가격이 결과 문서에 날짜와 함께 남는다.
5. 실패한 경우에도 실패 필드와 원인 가설이 기록되어 F-004 설계 입력으로 쓸 수 있다.

## Risks
| 위험 | 대응 |
| --- | --- |
| superRefine 규칙(고유 name, 루트 1개 등)을 모델이 어김 | 프롬프트에 규칙을 명시. 반복 실패 시 "검증 실패 시 오류 메시지를 넣어 1회 재시도"를 F-004 설계에 반영 |
| API가 변환한 스키마의 특정 키워드를 거부(400) | 첫 호출에서 확인, `toStrictJsonSchema`에서 해당 키워드를 제거(검증은 Zod가 담당)하는 방식으로 조정 |
| 이미지만 입력 시 모델이 한국어/영어 이름·상태를 임의로 채움 | `assumed`/`assumedFields` 표시를 프롬프트에 요구하고, 결과 표 비고에 기록 |
| 응답 시간이 30초를 넘음(큰 출력) | 표에 표시, 필요하면 모델·추론 강도 조정 또는 CLAUDE.md의 타임아웃 값 재검토를 제안 |
| 출력 토큰이 커서 비용 증가 | 1회 호출당 수 센트 이하로 추정. 반복 실행은 `--runs`로 명시할 때만 |

## 결정 사항 (승인됨)
이미지·expected.md는 사용자가 준비, `tsx` 추가, `strict-json-schema.ts` 분리, 실행은 사용자가 직접(`.env.local` 거부 규칙 유지), 기본 1회 + `--runs 3` 옵션, 예산 옵션(effort low, max-cost $1), luna 비교·sol은 terra 실패 시에만.

## Open Questions
1. 이미지가 `wireframe.png`가 아니라 다른 이름이면 알려주세요(현재 `wireframe.png|jpg|jpeg|webp`만 인식).

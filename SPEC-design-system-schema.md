# Spec: 디자인 시스템 스펙 스키마 확정 (기능 B, 2단계)

단일 기능이라 capability map은 만들지 않는다. 구현은 사용자 지시 후에 시작한다.

## 현황 (작성 시점)
| 항목 | 상태 |
| --- | --- |
| `core/schema/design-system.ts` | 있음. version `"1.2"`, 형식만 검증. 토큰 그룹명은 아직 colors/spacing/radius/typography |
| `blueprint.ts`, `spec-input.ts` | version `"1.2"`, stack.architecture·route·노드 location 모두 있음 → v1.2 승급 작업 불필요 |
| DS 테스트 | `schema.test.ts`에 정상 1, 거부 2 (인라인 객체) |
| 예시 스펙 JSON | 없음 |
| `data-model.md` 4절 | **저장소 파일은 아직 옛 표기(colors/typography)**. 갱신본이 반영되지 않은 상태 → 구현 전 대조 필요 |
| 기능 B 나머지(/api/analyze, 비교, 화면, ComponentInventory·CleanupSuggestion) | 없음, 범위 밖 |

## Objective
디자인 시스템 스펙(공식 컴포넌트 목록 + 토큰)의 토큰 그룹명과 값 규칙을 확정해, 잘못된 스펙이 기능 B의 비교 기준으로 들어오지 못하게 한다.
완료 기준: 예시 스펙 JSON 1개(`core/schema/sample-design-system.json`)가 `DesignSystemSpecSchema` 검증을 통과한다.

## Assumptions (틀리면 알려주세요)
1. 기준은 data-model.md 4절이며 이 스펙의 규칙이 그 확정 내용이다. 문서 4절이 아직 옛 표기이므로 구현 시 문서도 이 스펙대로 갱신한다.
2. 값 형식(색은 hex 등)은 강제하지 않는다 (data-model 0절: 스키마는 형식, 판단은 규칙).
3. 샘플 정본 위치는 `core/schema/`다. 기존 blueprint 샘플 이동은 별도 chore로 처리한다 (이 스펙 범위 밖).

## 확정 규칙

### 구조 (T4 대체: 이 스펙 범위에 포함)
| 필드 | 규칙 |
| --- | --- |
| version | `"1.2"` 유지 |
| tokens.**color**, tokens.**spacing** | 필수, Record<string,string>, 키 최소 1개 (빈 객체 실패) |
| tokens.**radius**, tokens.**font**, tokens.**layout** | 선택. 있으면 키 최소 1개 (빈 객체 실패). 기존 `colors`→`color`, `typography`→`font`, `layout` 신규 |

### 값 규칙
| 대상 | 규칙 |
| --- | --- |
| components[].name | PascalCase `^[A-Z][A-Za-z0-9]*$`, 목록 내 고유 |
| components[].variants | 각 항목 빈 문자열 금지, 소문자 kebab-case `^[a-z0-9]+(-[a-z0-9]+)*$`, 중복 금지. 빈 배열 허용 |
| components[].props[].name | 컴포넌트 내 고유 |
| components[].props[].type | 자유 문자열, 빈 문자열만 금지 (Blueprint `PropItem.type`과 동일) |
| 모든 토큰 그룹 공통 | 키 1자 이상·`.` 포함 금지, 값 1자 이상 |

토큰 그룹명(단수)은 Blueprint의 참조 접두사(`color.primary`, `spacing.6`, `radius.md`, `layout.maxWidth`)와 일치한다.

## Tech Stack
TypeScript, Zod ^4.6.7, vitest ^5 (설치됨).

## Commands
```
npx vitest run core/schema
npx tsc --noEmit
npx eslint core
```

## Project Structure
```
core/schema/design-system.ts                # DesignSystemSpecSchema
core/schema/sample-design-system.json       # 예시 1개 (신규)
core/schema/schema.test.ts                  # DS 테스트 보강
.claude/skills/define-schema/data-model.md  # 4절을 확정 규칙으로 갱신
```

## Code Style
기존 `core/schema/*.ts`와 동일: Zod 정의, `z.infer` 타입 추출, PascalCase+`Schema` 접미사, 파일당 최상위 스키마 1개.

## Testing Strategy
- 통과: `core/schema/sample-design-system.json` 로드 → `safeParse` 성공 (예시에 radius·font·layout 포함)
- 거부(예시 복제·변형): 컴포넌트명 소문자·중복, variant 빈 문자열·중복·대문자·공백, prop 이름 중복, `props[].type` 빈 문자열, `tokens.color` 빈 객체, `tokens.spacing` 누락, `radius`/`font`/`layout` 빈 객체, 옛 그룹명(`colors`만 있음), 토큰 키에 `.`, 토큰 값 빈 문자열, `required` 누락, version 불일치

## Boundaries
- Always: 필드명은 data-model.md와 일치, 변경 시 문서도 함께 갱신
- Ask first: 필드 추가·삭제, 새 의존성
- Never: React/Next/Supabase import, 화면·API 코드, 범위 밖 스키마(ComponentInventory 등) 작성, 지시 전 구현 시작

## Success Criteria
1. `core/schema/sample-design-system.json`이 검증을 통과한다.
2. 위 거부 케이스가 전부 실패한다.
3. `vitest`, `tsc --noEmit`, `eslint core`가 모두 통과한다.
4. data-model.md 4절이 이 스펙의 그룹명·검증 조건과 일치한다.

## Open Questions
1. data-model.md 4절의 갱신본이 저장소 파일에 아직 없다. 어디에 반영하셨는지(미저장·다른 경로) 알려주시거나, 이 스펙대로 구현 시 제가 갱신해도 되는지 확인 부탁드립니다.

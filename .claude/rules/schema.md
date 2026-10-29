---
paths:
  - "core/schema/**"
---

# Schema Rules

- Zod로 스키마를 정의하고, 타입은 z.infer로 추출한다. 타입을 따로 손으로 쓰지 않는다.
- React, Next.js, Supabase import 금지. 순수 TypeScript만 사용한다.
- 파일 하나에 스키마 하나: blueprint.ts, spec-input.ts, design-system.ts
- 모든 스키마에는 version 필드를 둔다.
- 필드명은 기획서 6.4 데이터 모델과 동일하게 맞춘다. 임의로 이름을 바꾸지 않는다.
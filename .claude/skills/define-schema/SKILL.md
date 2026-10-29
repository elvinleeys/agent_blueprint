---
description: 설계도·스펙·디자인 시스템 Zod 스키마를 기획서 기준으로 정의하고 검증한다
disable-model-invocation: true
---

# 스키마 확정 작업

1. data-model.md를 읽고 필드 목록을 표로 정리해 먼저 보여준다. 코드 작성 전 사용자 확인을 받는다.
2. core/schema/ 아래에 blueprint.ts, spec-input.ts, design-system.ts를 작성한다.
3. sample-blueprint.json이 스키마 검증을 통과하는지 확인하는 테스트를 작성하고 실행한다.
4. 일부러 틀린 예시(필드 누락, 잘못된 enum)가 실패하는지도 확인한다.
5. 완료 후 변경 파일 목록과 검증 결과만 요약한다.

범위: core/schema/ 와 그 테스트 파일만 수정한다. 화면·API 코드는 만들지 않는다.
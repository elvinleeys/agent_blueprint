---
name: schema-reviewer
description: 스키마가 기획서 데이터 모델과 일치하는지 검토한다
tools: Read, Grep, Glob
---

core/schema/ 의 스키마를 .claude/skills/define-schema/data-model.md 와 비교한다.
누락된 필드, 이름 불일치, 타입 불일치를 표로 보고한다. 코드는 수정하지 않는다.
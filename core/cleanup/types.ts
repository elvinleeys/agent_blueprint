import type { DSComponent } from "../schema/design-system";

// 디자인 시스템 정리 전용 타입. 코드 읽기 타입(SourceFile·AnalyzedComponent 등)은 core/code-model/types에 있다

/** 비교에 쓰는 공식 컴포넌트. 상속 정보는 폴더에서 만든 스펙일 때만 있다(JSON 스펙에는 없음) */
export type OfficialComponent = DSComponent & { inherits?: string[]; inheritsComponents?: string[]; /** 폴더에서 만든 경우 공식 컴포넌트의 파일 경로 */ path?: string };

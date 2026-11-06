import type { DSComponent } from "../schema/design-system";

// 코드 읽기 타입은 core/code-model로 옮겼다. 기존 import 경로를 위해 다시 내보낸다
export type { AnalyzedComponent, ExtractedProp, PartialFile, SourceFile } from "../code-model/types";

/** 비교에 쓰는 공식 컴포넌트. 상속 정보는 폴더에서 만든 스펙일 때만 있다(JSON 스펙에는 없음) */
export type OfficialComponent = DSComponent & { inherits?: string[]; inheritsComponents?: string[]; /** 폴더에서 만든 경우 공식 컴포넌트의 파일 경로 */ path?: string };

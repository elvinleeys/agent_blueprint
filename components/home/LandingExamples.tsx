"use client";

import type { ReactNode } from "react";
import CheckResults from "../structure/CheckResults";
import PreviewCanvas from "../structure/PreviewCanvas";
import { StructureStoreProvider } from "../structure/StructureStoreProvider";
import { ViolationsProvider } from "../structure/ViolationsProvider";
import { LANDING_BLUEPRINT } from "./landing-blueprint";

// 작업공간과 같은 미리보기·검사 결과 부품을 읽기 전용으로 쓴다. 저장·로그인·AI 호출 없이 정적 예시 설계도만 넣는다
function Example({ children }: { children: ReactNode }) {
  return (
    <StructureStoreProvider init={{ blueprint: LANDING_BLUEPRINT, savedInput: null }}>
      <ViolationsProvider>{children}</ViolationsProvider>
    </StructureStoreProvider>
  );
}

export function LandingPreview() {
  return (
    <Example>
      <PreviewCanvas readOnly />
    </Example>
  );
}

export function LandingCheck() {
  return (
    <Example>
      <CheckResults readOnly />
    </Example>
  );
}

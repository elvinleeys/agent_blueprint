"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { checkBlueprint, countByNode } from "@/core/rules/run";
import type { Violation } from "@/core/rules/types";
import { useStructureStore } from "./StructureStoreProvider";
import type { NodeCounts } from "./violation-mark";

type Violations = { violations: Violation[]; counts: Map<string, NodeCounts> };

const EMPTY: Violations = { violations: [], counts: new Map() };
const Context = createContext<Violations>(EMPTY);

/** 설계도가 바뀔 때만 검사를 다시 계산한다(결과는 저장하지 않는다). 선택·보기 변경에는 다시 계산하지 않는다 */
export function ViolationsProvider({ children }: { children: ReactNode }) {
  const blueprint = useStructureStore((s) => s.blueprint);
  const value = useMemo<Violations>(() => {
    if (!blueprint) return EMPTY;
    const violations = checkBlueprint(blueprint);
    return { violations, counts: countByNode(violations) };
  }, [blueprint]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useViolations = () => useContext(Context);

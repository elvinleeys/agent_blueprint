import { createStore } from "zustand/vanilla";
import type { Blueprint } from "../core/schema/blueprint";
import type { NormalizeChange } from "../core/schema/normalize-blueprint";
import type { Viewport } from "../core/preview/preview";
import type { StoredSpecInput } from "../lib/db/spec-inputs";

export type StructureView = "preview" | "tree";

export type StructureInit = {
  blueprint: Blueprint | null;
  /** 저장된 스펙 입력. 입력칸에 불러올 초기값이다(이미지는 저장하지 않아 개수만 있다) */
  savedInput: StoredSpecInput | null;
};

export type StructureState = StructureInit & {
  /** 이번에 새로 만든 초안의 자동 보정 내역. 저장된 판을 불러온 경우는 DB에 없어 비어 있다 */
  normalized: NormalizeChange[];
  selectedNodeId: string | null;
  viewport: Viewport;
  view: StructureView;
  select: (id: string | null) => void;
  setViewport: (viewport: Viewport) => void;
  setView: (view: StructureView) => void;
  setBlueprint: (blueprint: Blueprint | null, normalized?: NormalizeChange[]) => void;
};

/** 작업공간(프로젝트)마다 따로 만든다. 탭을 오가도 선택·보기 상태가 유지된다 */
export function createStructureStore(init: StructureInit) {
  return createStore<StructureState>()((set) => ({
    ...init,
    normalized: [],
    selectedNodeId: null,
    viewport: "desktop",
    view: "preview",
    select: (id) => set({ selectedNodeId: id }),
    setViewport: (viewport) => set({ viewport }),
    setView: (view) => set({ view }),
    // 설계도가 바뀌면 사라진 노드를 가리키는 선택은 해제한다
    setBlueprint: (blueprint, normalized = []) =>
      set((s) => ({
        blueprint,
        normalized,
        selectedNodeId: blueprint?.nodes.some((n) => n.id === s.selectedNodeId) ? s.selectedNodeId : null,
      })),
  }));
}

export type StructureStore = ReturnType<typeof createStructureStore>;

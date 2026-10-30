"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createStructureStore, type StructureInit, type StructureState, type StructureStore } from "../../store/structure-store";

const Context = createContext<StructureStore | null>(null);

export function StructureStoreProvider({ init, children }: { init: StructureInit; children: ReactNode }) {
  const [store] = useState(() => createStructureStore(init));
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

function useApi(): StructureStore {
  const store = useContext(Context);
  if (!store) throw new Error("StructureStoreProvider 안에서만 쓸 수 있습니다.");
  return store;
}

export function useStructureStore<T>(selector: (state: StructureState) => T): T {
  return useStore(useApi(), selector);
}

/** 이벤트 핸들러에서 최신 상태를 바로 읽고 쓸 때 쓴다(렌더링에는 useStructureStore를 쓴다) */
export const useStructureApi = useApi;

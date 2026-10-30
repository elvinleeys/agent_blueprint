"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Blueprint } from "@/core/schema/blueprint";
import { setLeaveGuard, warnBeforeUnload } from "@/lib/client/leave-guard";
import type { SaveQueue } from "@/lib/client/save-queue";
import { selectHasUnsaved } from "../../store/structure-store";
import { connectAutoSave, createSessionQueue } from "./auto-save";
import { useStructureApi, useStructureStore } from "./StructureStoreProvider";

const Context = createContext<SaveQueue<Blueprint> | null>(null);

/**
 * 작업공간 하나의 자동 저장과 떠나기 전 경고를 맡는다. 탭을 바꿔도 사라지지 않도록 작업공간(Workspace) 바로 아래, 스토어 Provider 안에 둔다.
 * - 편집이 반영될 때마다 저장 큐에 예약한다(connectAutoSave)
 * - 저장되지 않은 수정이 있는 동안 링크 이동·로그아웃(setLeaveGuard)과 탭 닫기·새로고침(beforeunload)을 막고 묻는다
 * - 떠날 때(언마운트)는 보내지 않은 저장을 버린다. 떠나도 되는지는 이미 확인을 받았다
 */
export function SaveQueueProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const store = useStructureApi();
  const [queue] = useState(() => createSessionQueue(store, projectId));
  const unsaved = useStructureStore(selectHasUnsaved);

  useEffect(() => {
    const disconnect = connectAutoSave(store, queue);
    return () => {
      disconnect();
      void queue.settle();
    };
  }, [store, queue]);

  useEffect(() => {
    setLeaveGuard(unsaved);
    if (!unsaved) return;
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [unsaved]);

  useEffect(() => () => setLeaveGuard(false), []);

  return <Context.Provider value={queue}>{children}</Context.Provider>;
}

export function useSaveQueue(): SaveQueue<Blueprint> {
  const queue = useContext(Context);
  if (!queue) throw new Error("SaveQueueProvider 안에서만 쓸 수 있습니다.");
  return queue;
}

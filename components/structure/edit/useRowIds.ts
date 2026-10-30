import { useState } from "react";
import { alignRowIds, appendRowId, removeRowId, rowIdsFor } from "./list-draft";

/**
 * 목록 행의 고유 id를 들고 있는다. idOf(i)를 React 키로 쓰면 행을 지워도 나머지 행의 DOM(입력 상태·포커스)이 그대로 유지된다.
 * added()는 새 행의 id를 focusId로 남기고(그 행의 첫 입력이 포커스를 받는다), removed(i)는 focusId를 비운다.
 */
export function useRowIds(initialLength: number, shownLength: number) {
  const [state, setState] = useState(() => rowIdsFor(initialLength));
  const [focusId, setFocusId] = useState<number | null>(null);
  const aligned = state.ids.length === shownLength; // 어긋난 동안은 행 번호를 키로 쓴다(음수라 id와 겹치지 않는다)

  return {
    idOf: (index: number) => (aligned ? state.ids[index] : -1 - index),
    focusId,
    added: () => {
      const next = appendRowId(alignRowIds(state, shownLength));
      setState(next);
      setFocusId(next.ids[next.ids.length - 1]);
    },
    removed: (index: number) => {
      setState(removeRowId(alignRowIds(state, shownLength), index));
      setFocusId(null);
    },
  };
}

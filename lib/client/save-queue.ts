/** idle 대기 / pending 편집 있음(전송 전) / saving 전송 중 / saved 저장됨 / error 마지막 전송 실패 */
export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export type SaveQueue<T> = {
  /** 편집이 생겼다. 마지막 편집 후 delayMs가 지나면 최신 값만 보낸다. settle 중에는 무시한다 */
  schedule: (value: T) => void;
  /** 실패했거나 대기 중인 최신 값을 지금 보낸다. 전송 중이거나 보낼 값이 없으면 아무것도 하지 않는다 */
  retry: () => void;
  /**
   * 초안 다시 생성 직전에 부른다: 보내지 않은 저장(대기·실패한 값)은 버리고, 진행 중인 전송은 끝날 때까지 기다린다.
   * 끝나면 대기 상태(idle)가 된다. 기다리는 동안 들어온 schedule은 무시한다. 전송이 실패해도 resolve한다.
   */
  settle: () => Promise<void>;
  /** 저장되지 않은 수정이 있는가: 전송 전 값, 전송 중, 실패한 값 */
  hasUnsaved: () => boolean;
};

type Deps<T> = {
  /** 한 번 전송한다. 실패하면 reject */
  send: (value: T) => Promise<void>;
  onStatus: (status: SaveStatus) => void;
  delayMs?: number;
};

/**
 * 자동 저장 큐. 전송은 한 번에 하나만 나가고(저장 순서 보장), 전송 중에 생긴 편집은 합쳐 끝난 뒤 최신본으로 한 번 더 보낸다.
 * 전송이 실패하면 error로 멈추고 자동으로 다시 보내지 않는다(retry 또는 다음 편집의 디바운스 전송).
 */
export function createSaveQueue<T>({ send, onStatus, delayMs = 800 }: Deps<T>): SaveQueue<T> {
  let pending: { value: T } | null = null; // 아직 보내지 않은 최신 값
  let failed: { value: T } | null = null; // 마지막 전송이 실패한 값
  let timer: ReturnType<typeof setTimeout> | null = null;
  let due = false; // 디바운스 시간이 지났지만 전송 중이라 기다리는 중
  let inflight: Promise<void> | null = null;
  let settling = false;

  const emit = (status: SaveStatus) => onStatus(status);

  const run = (item: { value: T }) => {
    pending = null;
    failed = null;
    due = false;
    emit("saving");
    inflight = send(item.value).then(
      () => {
        inflight = null;
        if (settling) return;
        if (!pending) return emit("saved");
        if (due) run(pending);
        else emit("pending"); // 디바운스 타이머가 아직 남아 있어 곧 전송된다
      },
      () => {
        inflight = null;
        if (settling) return;
        failed = item;
        emit("error");
      },
    );
  };

  const fire = () => {
    timer = null;
    if (!pending) return;
    if (inflight) due = true;
    else run(pending);
  };

  return {
    schedule(value) {
      if (settling) return;
      pending = { value };
      due = false;
      if (timer) clearTimeout(timer);
      timer = setTimeout(fire, delayMs);
      if (!inflight) emit("pending");
    },
    retry() {
      const item = pending ?? failed;
      if (settling || inflight || !item) return;
      if (timer) clearTimeout(timer);
      timer = null;
      run(item);
    },
    async settle() {
      settling = true;
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      failed = null;
      due = false;
      try {
        while (inflight) await inflight;
      } finally {
        settling = false;
      }
      emit("idle");
    },
    hasUnsaved: () => pending !== null || inflight !== null || failed !== null,
  };
}

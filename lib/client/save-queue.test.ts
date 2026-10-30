import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSaveQueue, type SaveStatus } from "./save-queue";

type Call = { value: string; resolve: () => void; reject: () => void };

function setup(delayMs = 800) {
  const calls: Call[] = [];
  const log: string[] = [];
  const statuses: SaveStatus[] = [];
  const queue = createSaveQueue<string>({
    delayMs,
    send: (value) =>
      new Promise<void>((resolve, reject) => {
        log.push(`start:${value}`);
        calls.push({
          value,
          resolve: () => (log.push(`end:${value}`), resolve()),
          reject: () => (log.push(`fail:${value}`), reject(new Error("network"))),
        });
      }),
    onStatus: (s) => statuses.push(s),
  });
  return { queue, calls, log, statuses, last: () => statuses.at(-1) };
}

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("자동 저장 큐: 디바운스·직렬 전송", () => {
  it("편집이 멈추고 800ms 뒤에 마지막 값만 한 번 보낸다", async () => {
    const { queue, calls, last } = setup();
    queue.schedule("a");
    await tick(500);
    queue.schedule("b");
    await tick(500);
    expect(calls).toHaveLength(0); // 마지막 편집 후 500ms
    await tick(300);
    expect(calls.map((c) => c.value)).toEqual(["b"]);
    expect(last()).toBe("saving");
    calls[0].resolve();
    await tick(0);
    expect(last()).toBe("saved");
    expect(queue.hasUnsaved()).toBe(false);
  });

  it("전송 중에는 두 번째 요청을 보내지 않고, 끝난 뒤 중간 편집을 합쳐 최신본만 한 번 더 보낸다", async () => {
    const { queue, calls, log } = setup();
    queue.schedule("a");
    await tick(800);
    expect(log).toEqual(["start:a"]);

    queue.schedule("b");
    await tick(800); // 디바운스가 지나도 전송 중이라 기다린다
    queue.schedule("c");
    await tick(800);
    expect(log).toEqual(["start:a"]);

    calls[0].resolve();
    await tick(0);
    expect(log).toEqual(["start:a", "end:a", "start:c"]); // b는 건너뛰고 최신 c만
    calls[1].resolve();
    await tick(0);
    expect(calls).toHaveLength(2);
  });

  it("전송 중 편집이 있고 디바운스가 아직 남았으면 상태는 pending이고 타이머가 지나면 보낸다", async () => {
    const { queue, calls, last } = setup();
    queue.schedule("a");
    await tick(800);
    queue.schedule("b");
    calls[0].resolve();
    await tick(0);
    expect(last()).toBe("pending");
    expect(calls).toHaveLength(1);
    await tick(800);
    expect(calls.map((c) => c.value)).toEqual(["a", "b"]);
  });

  it("전송이 겹치지 않는다(동시에 두 요청이 나가지 않는다)", async () => {
    let inflight = 0;
    let maxInflight = 0;
    const q = createSaveQueue<string>({
      send: () => {
        maxInflight = Math.max(maxInflight, ++inflight);
        return new Promise<void>((r) => setTimeout(() => (inflight--, r()), 1000));
      },
      onStatus: () => {},
    });
    for (let i = 0; i < 6; i++) {
      q.schedule(`v${i}`);
      await tick(900);
    }
    await tick(5000);
    expect(maxInflight).toBe(1);
  });
});

describe("자동 저장 큐: 실패와 다시 시도", () => {
  it("실패하면 error로 멈추고 자동으로 다시 보내지 않는다", async () => {
    const { queue, calls, last } = setup();
    queue.schedule("a");
    await tick(800);
    calls[0].reject();
    await tick(5000);
    expect(last()).toBe("error");
    expect(calls).toHaveLength(1);
    expect(queue.hasUnsaved()).toBe(true);
  });

  it("retry는 실패한 값을 다시 보내고 성공하면 saved가 된다", async () => {
    const { queue, calls, last } = setup();
    queue.schedule("a");
    await tick(800);
    calls[0].reject();
    await tick(0);
    queue.retry();
    expect(calls.map((c) => c.value)).toEqual(["a", "a"]);
    calls[1].resolve();
    await tick(0);
    expect(last()).toBe("saved");
    expect(queue.hasUnsaved()).toBe(false);
  });

  it("실패 뒤 더 새 편집이 있으면 retry는 최신 값을 보낸다", async () => {
    const { queue, calls } = setup();
    queue.schedule("a");
    await tick(800);
    queue.schedule("b"); // 전송 중 편집
    calls[0].reject();
    await tick(0);
    queue.retry();
    expect(calls.map((c) => c.value)).toEqual(["a", "b"]);
  });

  it("실패 뒤 새 편집은 디바운스 후 그대로 전송된다", async () => {
    const { queue, calls, last } = setup();
    queue.schedule("a");
    await tick(800);
    calls[0].reject();
    await tick(0);
    queue.schedule("b");
    expect(last()).toBe("pending");
    await tick(800);
    expect(calls.map((c) => c.value)).toEqual(["a", "b"]);
  });

  it("전송 중이거나 보낼 값이 없을 때 retry는 아무것도 하지 않는다", async () => {
    const { queue, calls } = setup();
    queue.retry();
    expect(calls).toHaveLength(0);
    queue.schedule("a");
    await tick(800);
    queue.retry();
    expect(calls).toHaveLength(1);
  });
});

describe("자동 저장 큐: 초안 다시 생성 전 settle (이전 편집이 새 초안 위에 저장되면 안 된다)", () => {
  it("보내지 않은 저장은 취소하고, 이후 타이머가 지나도 전송하지 않는다", async () => {
    const { queue, calls, last } = setup();
    queue.schedule("a");
    await tick(300); // 아직 전송 전
    expect(queue.hasUnsaved()).toBe(true);
    await queue.settle();
    await tick(10_000);
    expect(calls).toHaveLength(0);
    expect(last()).toBe("idle");
    expect(queue.hasUnsaved()).toBe(false);
  });

  it("진행 중인 저장은 끝날 때까지 기다리고, 그 사이 들어온 편집은 버린다. 순서: 전송 시작 → 전송 끝 → settle 끝", async () => {
    const { queue, calls, log } = setup();
    queue.schedule("a");
    await tick(800);
    queue.schedule("b"); // 전송 중 편집 — 보내지면 안 된다

    const events: string[] = [];
    const settled = queue.settle().then(() => events.push("settled"));
    await tick(5000);
    expect(events).toEqual([]); // 전송이 안 끝났으니 아직 기다린다

    calls[0].resolve();
    await settled;
    await tick(10_000);
    expect(log).toEqual(["start:a", "end:a"]); // b는 보내지 않았다
    expect(events).toEqual(["settled"]);
    expect(calls).toHaveLength(1);
  });

  it("settle이 끝난 뒤에야 생성을 시작할 수 있다(호출 쪽 순서 고정)", async () => {
    const { queue, calls } = setup();
    const order: string[] = [];
    queue.schedule("a");
    await tick(800);
    queue.schedule("stale");

    const regenerate = async () => {
      await queue.settle();
      order.push("generate-start");
    };
    const done = regenerate();
    await tick(100);
    expect(order).toEqual([]);
    order.push("save-end");
    calls[0].resolve();
    await done;
    expect(order).toEqual(["save-end", "generate-start"]);
    await tick(10_000);
    expect(calls).toHaveLength(1); // stale은 끝내 전송되지 않았다
  });

  it("진행 중인 저장이 실패해도 settle은 끝나고 실패한 값은 버린다", async () => {
    const { queue, calls, last } = setup();
    queue.schedule("a");
    await tick(800);
    const settled = queue.settle();
    calls[0].reject();
    await settled;
    expect(last()).toBe("idle"); // error로 남지 않는다
    expect(queue.hasUnsaved()).toBe(false);
    queue.retry();
    expect(calls).toHaveLength(1); // 버린 값은 다시 보내지 않는다
  });

  it("실패 상태에서 settle하면 실패한 값을 버린다", async () => {
    const { queue, calls } = setup();
    queue.schedule("a");
    await tick(800);
    calls[0].reject();
    await tick(0);
    await queue.settle();
    queue.retry();
    expect(calls).toHaveLength(1);
    expect(queue.hasUnsaved()).toBe(false);
  });

  it("settle 중에는 schedule을 무시하고, 끝난 뒤의 편집은 정상 전송된다", async () => {
    const { queue, calls } = setup();
    queue.schedule("a");
    await tick(800);
    const settled = queue.settle();
    queue.schedule("during"); // 무시
    calls[0].resolve();
    await settled;
    await tick(10_000);
    expect(calls).toHaveLength(1);

    queue.schedule("after");
    await tick(800);
    expect(calls.map((c) => c.value)).toEqual(["a", "after"]);
  });

  it("아무 일도 없을 때 settle은 바로 끝난다", async () => {
    const { queue, last } = setup();
    await queue.settle();
    expect(last()).toBe("idle");
  });
});

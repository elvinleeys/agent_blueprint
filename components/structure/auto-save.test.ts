import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateNode } from "../../core/edit/update-node";
import { BlueprintSchema, type Blueprint } from "../../core/schema/blueprint";
import { SaveError, type putBlueprint } from "../../lib/client/save-blueprint";
import { createStructureStore, selectHasUnsaved, type SaveFailure } from "../../store/structure-store";
import { connectAutoSave, createSessionQueue } from "./auto-save";

const sample = () => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));
const nameOf = (bp: Blueprint) => bp.nodes.find((n) => n.id === "n-price")!.name;
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

function setup() {
  const store = createStructureStore({ blueprint: sample(), savedInput: null });
  const calls: { value: Blueprint; resolve: () => void; reject: (e: unknown) => void }[] = [];
  const put = ((_id: string, value: Blueprint) => new Promise<void>((resolve, reject) => calls.push({ value, resolve, reject }))) as typeof putBlueprint;
  const queue = createSessionQueue(store, "p1", put);
  const disconnect = connectAutoSave(store, queue);
  const edit = (name: string) => store.getState().applyEdit((bp) => updateNode(bp, "n-price", { name }));
  const statuses: string[] = [];
  // 구독 안에서 다른 구독이 상태를 다시 바꾸는 중첩 때문에 (state, prev) 인자는 믿지 않고, 알림마다 실제 상태를 읽어 연속 중복을 합쳐 기록한다
  store.subscribe(() => {
    const status = store.getState().saveStatus;
    if (statuses.at(-1) !== status) statuses.push(status);
  });
  return { store, calls, edit, disconnect, statuses };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("자동 저장 연결", () => {
  it("편집하면 800ms 뒤 마지막 설계도만 한 번 보내고, 상태가 pending → saving → saved로 스토어에 반영된다", async () => {
    const t = setup();
    t.edit("Abc");
    await tick(500);
    t.edit("Abcd"); // 글자마다 편집이 반영되어도 마지막 것만 보낸다
    expect(t.store.getState().saveStatus).toBe("pending");
    expect(selectHasUnsaved(t.store.getState())).toBe(true);
    await tick(300);
    expect(t.calls).toHaveLength(0);
    await tick(500);
    expect(t.calls).toHaveLength(1);
    expect(nameOf(t.calls[0].value)).toBe("Abcd");
    expect(t.calls[0].value.generatedBy).toBe("user");

    t.calls[0].resolve();
    await tick(0);
    expect(t.statuses).toEqual(["pending", "saving", "saved"]);
    expect(selectHasUnsaved(t.store.getState())).toBe(false);
  });

  it("바뀐 것이 없는 편집과 거부된 편집은 저장을 예약하지 않는다", async () => {
    const t = setup();
    t.edit("PriceTag"); // 같은 값
    t.store.getState().applyEdit((bp) => updateNode(bp, "n-price", { name: "" })); // 거부
    await tick(10_000);
    expect(t.calls).toHaveLength(0);
    expect(t.store.getState().saveStatus).toBe("idle");
  });

  it("새 초안이 반영되는 것(finishDraft)은 저장을 예약하지 않는다", async () => {
    const t = setup();
    t.store.getState().startDraft(1, false);
    t.store.getState().finishDraft(sample(), []);
    await tick(10_000);
    expect(t.calls).toHaveLength(0);
  });

  it("실패하면 error와 안내 문구(로그인 필요 여부 포함)가 스토어에 남고, 다시 시도해 성공하면 지워진다", async () => {
    const t = setup();
    const queue = createSessionQueue(t.store, "p1", (() => Promise.reject(new SaveError("로그인이 만료되어 저장하지 못했습니다.", 401, true))) as typeof putBlueprint);
    const off = connectAutoSave(t.store, queue);
    t.disconnect(); // 이 테스트는 위 큐만 쓴다
    t.edit("Abc");
    await tick(800);
    expect(t.store.getState().saveStatus).toBe("error");
    expect(t.store.getState().saveError).toEqual<SaveFailure>({ message: "로그인이 만료되어 저장하지 못했습니다.", needsLogin: true });
    expect(selectHasUnsaved(t.store.getState())).toBe(true);
    off();
  });

  it("SaveError가 아닌 오류는 일반 문구로 바꾼다(원문을 노출하지 않는다)", async () => {
    const t = setup();
    const queue = createSessionQueue(t.store, "p1", (() => Promise.reject(new Error("ECONNRESET 10.0.0.3"))) as typeof putBlueprint);
    t.disconnect();
    connectAutoSave(t.store, queue);
    t.edit("Abc");
    await tick(800);
    expect(t.store.getState().saveError).toEqual({ message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", needsLogin: false });
  });

  it("실패한 뒤 다시 시도(retry)로 성공하면 saved가 되고 실패 문구가 지워진다", async () => {
    const store = createStructureStore({ blueprint: sample(), savedInput: null });
    let attempt = 0;
    const put = (async () => {
      if (++attempt === 1) throw new SaveError("저장 실패", 503, false);
    }) as unknown as typeof putBlueprint;
    const queue = createSessionQueue(store, "p1", put);
    connectAutoSave(store, queue);
    store.getState().applyEdit((bp) => updateNode(bp, "n-price", { name: "Abc" }));
    await tick(800);
    expect(store.getState()).toMatchObject({ saveStatus: "error", saveError: { message: "저장 실패" } });
    queue.retry();
    await tick(0);
    expect(store.getState()).toMatchObject({ saveStatus: "saved", saveError: null });
  });

  it("해제하면 더는 예약하지 않는다", async () => {
    const t = setup();
    t.disconnect();
    t.edit("Abc");
    await tick(10_000);
    expect(t.calls).toHaveLength(0);
  });
});

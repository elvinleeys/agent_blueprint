import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateNode } from "../../core/edit/update-node";
import { BlueprintSchema, type Blueprint } from "../../core/schema/blueprint";
import type { RunResult } from "../../lib/client/run-draft";
import { SaveError, type putBlueprint } from "../../lib/client/save-blueprint";
import { createStructureStore, selectHasUnsaved } from "../../store/structure-store";
import { connectAutoSave, createSessionQueue } from "./auto-save";
import { generateDraft } from "./generate";

const sample = () => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));
const nameOf = (bp: Blueprint | null | undefined) => bp?.nodes.find((n) => n.id === "n-price")?.name;
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

// 실제 스토어·실제 저장 큐·실제 자동 저장 연결을 쓰고, 서버 전송(put)과 생성(run)만 가짜로 바꾼다
function setup() {
  const store = createStructureStore({ blueprint: sample(), savedInput: null });
  const log: string[] = [];
  const sends: { value: Blueprint; resolve: () => void; reject: () => void }[] = [];
  const put = ((_id: string, value: Blueprint) =>
    new Promise<void>((resolve, reject) => {
      log.push("send:start");
      sends.push({
        value,
        resolve: () => (log.push("send:end"), resolve()),
        reject: () => (log.push("send:fail"), reject(new SaveError("저장 실패", 503, false))),
      });
    })) as typeof putBlueprint;
  const queue = createSessionQueue(store, "p1", put);
  connectAutoSave(store, queue);

  const newDraft: Blueprint = { ...sample(), title: "새 AI 초안", generatedBy: "ai" };
  const done: RunResult = { kind: "done", blueprint: newDraft, normalized: [], saved: true };
  const makeRun = (result: RunResult = done) =>
    vi.fn(async () => {
      log.push(`run(status=${store.getState().status})`);
      return result;
    });
  const edit = (name: string) => store.getState().applyEdit((bp) => updateNode(bp, "n-price", { name }));
  return { store, queue, log, sends, newDraft, done, makeRun, edit, generate: (run: ReturnType<typeof makeRun>) => generateDraft({ store, projectId: "p1", queue, run: run as never }) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("generateDraft — 새 AI 초안 위에 이전 편집이 저장되지 않는다", () => {
  it("보내지 않은 편집은 취소되고, 생성 뒤 시간이 지나도 전송되지 않는다", async () => {
    const t = setup();
    t.edit("PriceLabel");
    expect(t.store.getState().saveStatus).toBe("pending");

    const run = t.makeRun();
    await t.generate(run);
    await tick(10_000);

    expect(t.sends).toHaveLength(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(t.store.getState().blueprint).toEqual(t.newDraft);
    expect(t.store.getState()).toMatchObject({ saveStatus: "idle", status: "done" });
    expect(selectHasUnsaved(t.store.getState())).toBe(false);
  });

  it("진행 중인 저장은 끝날 때까지 기다린 뒤 생성을 시작한다. 순서: 전송 시작 → 전송 끝 → 생성. 그 사이의 편집은 보내지 않는다", async () => {
    const t = setup();
    t.edit("A");
    await tick(800); // A 전송 시작
    t.edit("B"); // 전송 중에 생긴 편집: 보내지면 안 된다

    const run = t.makeRun();
    const generating = t.generate(run);
    await tick(5_000);
    expect(run).not.toHaveBeenCalled(); // 저장이 끝나지 않았으니 아직 시작하지 않는다
    expect(t.store.getState().status).toBe("running"); // 편집은 이미 막혀 있다
    expect(t.edit("C")).toMatchObject({ ok: false }); // 기다리는 동안의 편집은 거부된다

    t.sends[0].resolve();
    await generating;
    await tick(10_000);

    expect(t.log).toEqual(["send:start", "send:end", "run(status=running)"]);
    expect(t.sends).toHaveLength(1); // B는 끝내 전송되지 않았다
    expect(nameOf(t.store.getState().blueprint)).toBe("PriceTag"); // 새 초안 그대로
    expect(t.store.getState().blueprint).toEqual(t.newDraft);
  });

  it("진행 중인 저장이 실패해도 생성은 진행되고 저장 실패 상태가 남지 않는다", async () => {
    const t = setup();
    t.edit("A");
    await tick(800);
    const generating = t.generate(t.makeRun());
    t.sends[0].reject();
    await generating;

    expect(t.log).toEqual(["send:start", "send:fail", "run(status=running)"]);
    expect(t.store.getState().saveStatus).toBe("idle");
    expect(selectHasUnsaved(t.store.getState())).toBe(false);
  });

  it("저장이 실패한 상태에서 다시 생성해도 실패한 값을 버리고 생성한다", async () => {
    const t = setup();
    t.edit("A");
    await tick(800);
    t.sends[0].reject();
    await tick(0);
    expect(t.store.getState().saveStatus).toBe("error");

    await t.generate(t.makeRun());
    await tick(10_000);
    expect(t.sends).toHaveLength(1);
    expect(t.store.getState()).toMatchObject({ saveStatus: "idle", status: "done" });
  });

  it("이미 생성 중이면 두 번째 호출은 무시한다", async () => {
    const t = setup();
    let release: (r: RunResult) => void = () => {};
    const slow = vi.fn(() => new Promise<RunResult>((r) => (release = r)));
    const first = t.generate(slow as never);
    await t.generate(t.makeRun()); // 무시되어 곧바로 끝난다
    expect(slow).toHaveBeenCalledTimes(1);
    release(t.done);
    await first;
    expect(t.store.getState().status).toBe("done");
  });

  it("생성이 끝난 뒤의 편집은 새 초안 위에서 정상적으로 저장된다", async () => {
    const t = setup();
    await t.generate(t.makeRun());
    expect(t.edit("AfterDraft")).toMatchObject({ ok: true });
    await tick(800);
    expect(t.sends).toHaveLength(1);
    expect(nameOf(t.sends[0].value)).toBe("AfterDraft");
    expect(t.sends[0].value.title).toBe("새 AI 초안");
    t.sends[0].resolve();
    await tick(0);
    expect(t.store.getState().saveStatus).toBe("saved");
  });
});

describe("generateDraft — 생성이 실패한 경우", () => {
  const failed: RunResult = { kind: "failed", error: { message: "시간 초과", status: 504, retryable: true, needsLogin: false } };

  it("취소했던 편집이 화면에 그대로 남으므로 다시 저장을 예약한다", async () => {
    const t = setup();
    t.edit("PriceLabel");
    await t.generate(t.makeRun(failed));
    expect(t.store.getState()).toMatchObject({ status: "error", saveStatus: "pending" });
    expect(nameOf(t.store.getState().blueprint)).toBe("PriceLabel");

    await tick(800);
    expect(t.sends).toHaveLength(1);
    expect(nameOf(t.sends[0].value)).toBe("PriceLabel");
    t.sends[0].resolve();
    await tick(0);
    expect(t.store.getState().saveStatus).toBe("saved");
  });

  it("저장할 편집이 없었으면 아무것도 예약하지 않는다", async () => {
    const t = setup();
    await t.generate(t.makeRun(failed));
    await tick(10_000);
    expect(t.sends).toHaveLength(0);
    expect(t.store.getState().saveStatus).toBe("idle");
  });

  it("저장만 실패한 새 초안(keptBlueprint)이 보일 때는 이전 편집을 다시 저장하지 않는다", async () => {
    const t = setup();
    t.edit("PriceLabel");
    await t.generate(t.makeRun({ kind: "failed", error: { message: "저장 실패", status: 503, retryable: true, needsLogin: false }, keptBlueprint: t.newDraft }));
    await tick(10_000);
    expect(t.sends).toHaveLength(0);
    expect(t.store.getState().blueprint).toEqual(t.newDraft);
    expect(t.store.getState().unsaved).toBe(true); // 새 초안 저장 실패는 기존 표시로 알린다
  });
});

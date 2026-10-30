import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmLeave, isLeaveGuardActive, LEAVE_MESSAGE, setLeaveGuard, warnBeforeUnload } from "./leave-guard";

afterEach(() => setLeaveGuard(false));

describe("leave-guard", () => {
  it("경고가 꺼져 있으면 묻지 않고 떠나게 한다", () => {
    const ask = vi.fn(() => false);
    expect(confirmLeave(ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it("켜져 있으면 확인을 받고, 승낙하면 떠나고 거절하면 머문다", () => {
    setLeaveGuard(true);
    expect(isLeaveGuardActive()).toBe(true);
    const yes = vi.fn(() => true);
    const no = vi.fn(() => false);
    expect(confirmLeave(yes)).toBe(true);
    expect(confirmLeave(no)).toBe(false);
    expect(yes).toHaveBeenCalledWith(LEAVE_MESSAGE);
  });

  it("다시 끄면 더 묻지 않는다", () => {
    setLeaveGuard(true);
    setLeaveGuard(false);
    const ask = vi.fn(() => false);
    expect(confirmLeave(ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it("문구는 수정이 사라진다는 사실을 알린다", () => {
    expect(LEAVE_MESSAGE).toContain("저장되지 않은 수정");
    expect(LEAVE_MESSAGE).toContain("사라집니다");
  });

  it("beforeunload 처리기는 기본 동작을 막고 returnValue를 비워 둔다(브라우저가 경고를 띄운다)", () => {
    const event = { preventDefault: vi.fn(), returnValue: "x" } as unknown as BeforeUnloadEvent;
    warnBeforeUnload(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.returnValue).toBe("");
  });
});

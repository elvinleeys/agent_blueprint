import { describe, expect, it } from "vitest";
import { checkPicked, encodeAttempts, fitSize, isTotalWithinLimit, MAX_TOTAL_BYTES } from "./fit-size";

describe("fitSize", () => {
  it("가로가 1,200px을 넘으면 비율을 유지해 1,200px로 줄인다", () => {
    expect(fitSize(2400, 1200)).toEqual({ width: 1200, height: 600 });
    expect(fitSize(3000, 2001)).toEqual({ width: 1200, height: 800 });
  });

  it("1,200px 이하는 그대로 둔다(키우지 않는다)", () => {
    expect(fitSize(1200, 900)).toEqual({ width: 1200, height: 900 });
    expect(fitSize(400, 300)).toEqual({ width: 400, height: 300 });
  });

  it("아주 납작한 이미지도 높이는 1px 이상", () => {
    expect(fitSize(12_000, 2).height).toBe(1);
  });

  it("최대 폭을 바꿀 수 있다", () => {
    expect(fitSize(1000, 500, 500)).toEqual({ width: 500, height: 250 });
  });
});

describe("isTotalWithinLimit", () => {
  it("합계 4,000,000바이트 이하면 통과(같으면 통과, 1바이트 넘으면 실패)", () => {
    expect(isTotalWithinLimit([MAX_TOTAL_BYTES])).toBe(true);
    expect(isTotalWithinLimit([MAX_TOTAL_BYTES - 10, 10])).toBe(true);
    expect(isTotalWithinLimit([MAX_TOTAL_BYTES, 1])).toBe(false);
    expect(isTotalWithinLimit([])).toBe(true);
  });
});

describe("encodeAttempts", () => {
  const attempts = encodeAttempts();

  it("처음은 품질 0.85·원래 폭, 같은 폭에서는 품질을 0.6까지 낮춘 뒤 폭을 줄인다", () => {
    expect(attempts[0]).toEqual({ quality: 0.85, widthScale: 1 });
    expect(attempts.slice(0, 4).map((a) => a.quality)).toEqual([0.85, 0.75, 0.65, 0.6]);
    expect(attempts.slice(0, 4).every((a) => a.widthScale === 1)).toBe(true);
    expect(attempts[4]).toEqual({ quality: 0.85, widthScale: 0.85 });
  });

  it("시도마다 품질이 0.6~0.85, 폭 배율은 줄기만 하고 중복이 없다", () => {
    expect(attempts.every((a) => a.quality >= 0.6 && a.quality <= 0.85)).toBe(true);
    const scales = attempts.map((a) => a.widthScale);
    expect([...scales].sort((x, y) => y - x)).toEqual(scales);
    expect(new Set(attempts.map((a) => `${a.quality}/${a.widthScale}`)).size).toBe(attempts.length);
  });
});

describe("checkPicked (고르는 순간의 검사)", () => {
  const png = (size = 1000, name = "a.png") => ({ name, type: "image/png", size });

  it("PNG·JPEG·WebP, 장당 5MB 이하, 합쳐서 3장까지 통과", () => {
    expect(checkPicked(0, [png(), { name: "b.jpg", type: "image/jpeg", size: 5 * 1024 * 1024 }, { name: "c.webp", type: "image/webp", size: 1 }])).toEqual({ ok: true });
  });

  it("이미 고른 장수와 합쳐 3장을 넘으면 거절", () => {
    const r = checkPicked(2, [png(), png(1, "b.png")]);
    expect(r).toEqual({ ok: false, message: "이미지는 최대 3장까지 첨부할 수 있습니다." });
  });

  it("5MB를 넘는 파일과 허용되지 않는 형식은 파일 이름과 함께 거절", () => {
    expect(checkPicked(0, [png(5 * 1024 * 1024 + 1, "big.png")])).toEqual({ ok: false, message: "big.png: 한 장은 5MB 이하여야 합니다." });
    expect(checkPicked(0, [{ name: "x.gif", type: "image/gif", size: 10 }])).toEqual({ ok: false, message: "x.gif: PNG, JPEG, WebP만 첨부할 수 있습니다." });
  });
});

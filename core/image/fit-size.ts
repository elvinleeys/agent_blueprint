// 이미지 전송 전 축소 규칙(순수 함수). 캔버스 처리는 lib/client/resize-images.ts가 맡는다.
// 서버가 합계 4MB 초과를 413으로 거절하고(Vercel 요청 본문 한도 4.5MB), 이미지는 장당 원본 5MB·최대 3장까지 받는다.

export const MAX_IMAGES = 3;
export const MAX_ORIGINAL_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 4_000_000;
export const MAX_IMAGE_WIDTH = 1200;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

// 합계가 한도를 넘으면 품질을 먼저 낮추고(0.85 → 0.6), 그래도 넘으면 폭을 줄여 처음부터 다시 시도한다
export const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.6] as const;
export const WIDTH_SCALES = [1, 0.85, 0.7, 0.55] as const;

export type EncodeAttempt = { quality: number; widthScale: number };

/** 시도 순서: 폭 배율이 같은 동안 품질을 낮추고, 다 해도 안 되면 폭 배율을 줄인다 */
export function encodeAttempts(): EncodeAttempt[] {
  return WIDTH_SCALES.flatMap((widthScale) => QUALITY_STEPS.map((quality) => ({ quality, widthScale })));
}

/** 가로가 maxWidth를 넘으면 비율을 유지해 줄이고, 이하이면 그대로 둔다(키우지 않는다). 최소 1px */
export function fitSize(width: number, height: number, maxWidth: number = MAX_IMAGE_WIDTH): { width: number; height: number } {
  if (width <= maxWidth) return { width, height };
  const scale = maxWidth / width;
  return { width: maxWidth, height: Math.max(1, Math.round(height * scale)) };
}

/** 합계가 4,000,000바이트 이하인지(같으면 통과) */
export const isTotalWithinLimit = (sizes: readonly number[]): boolean => sizes.reduce((sum, n) => sum + n, 0) <= MAX_TOTAL_BYTES;

export type PickedFile = { name: string; type: string; size: number };

/** 이미지를 고를 때의 클라이언트 검사(불필요한 호출을 막는다). 통과하지 못하면 사용자용 메시지를 돌려준다 */
export function checkPicked(existingCount: number, picked: readonly PickedFile[]): { ok: true } | { ok: false; message: string } {
  if (existingCount + picked.length > MAX_IMAGES) return { ok: false, message: `이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.` };
  for (const f of picked) {
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(f.type)) return { ok: false, message: `${f.name}: PNG, JPEG, WebP만 첨부할 수 있습니다.` };
    if (f.size > MAX_ORIGINAL_BYTES) return { ok: false, message: `${f.name}: 한 장은 5MB 이하여야 합니다.` };
  }
  return { ok: true };
}

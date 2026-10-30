// 브라우저 전용: 전송 전에 이미지를 가로 1,200px 이하로 줄이고 JPEG로 다시 인코딩해 합계를 4MB 이하로 만든다.
// 크기·시도 순서 규칙은 core/image/fit-size.ts(순수 함수, 테스트됨). 캔버스는 테스트하지 않고 직접 확인한다.
import { encodeAttempts, fitSize, isTotalWithinLimit, MAX_IMAGE_WIDTH } from "../../core/image/fit-size";

export type ResizedImage = { file: File; originalWidth: number };
export type ResizeResult = { ok: true; images: ResizedImage[] } | { ok: false; message: string };

const FAILED = "이미지를 처리하지 못했습니다. 다른 이미지로 다시 시도해 주세요.";
const TOO_LARGE = "이미지를 줄여도 합계 4MB 이하로 만들 수 없습니다. 이미지를 줄이거나 장수를 줄여 주세요.";

type Decoded = { bitmap: ImageBitmap; name: string };

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function render(d: Decoded, widthScale: number, quality: number): Promise<Blob | null> {
  const { width, height } = fitSize(d.bitmap.width, d.bitmap.height, Math.max(1, Math.round(MAX_IMAGE_WIDTH * widthScale)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff"; // PNG 투명 영역은 JPEG 변환 때 검게 되지 않도록 흰 배경으로 채운다
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(d.bitmap, 0, 0, width, height);
  return encode(canvas, quality);
}

export async function resizeImages(files: readonly File[]): Promise<ResizeResult> {
  if (files.length === 0) return { ok: true, images: [] };

  const decoded: Decoded[] = [];
  try {
    for (const file of files) {
      // EXIF 회전을 반영해 사진이 누워 보이지 않게 한다
      decoded.push({ bitmap: await createImageBitmap(file, { imageOrientation: "from-image" }), name: file.name });
    }
  } catch {
    decoded.forEach((d) => d.bitmap.close());
    return { ok: false, message: FAILED };
  }

  try {
    for (const { quality, widthScale } of encodeAttempts()) {
      const blobs: Blob[] = [];
      for (const d of decoded) {
        const blob = await render(d, widthScale, quality);
        if (!blob) return { ok: false, message: FAILED };
        blobs.push(blob);
      }
      if (isTotalWithinLimit(blobs.map((b) => b.size))) {
        const images = blobs.map((blob, i): ResizedImage => ({
          file: new File([blob], decoded[i].name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }),
          originalWidth: decoded[i].bitmap.width,
        }));
        return { ok: true, images };
      }
    }
    return { ok: false, message: TOO_LARGE };
  } finally {
    decoded.forEach((d) => d.bitmap.close());
  }
}

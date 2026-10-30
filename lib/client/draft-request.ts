// /api/draft 요청 본문(multipart) 구성. 브라우저·테스트(Node) 모두에서 동작하는 순수 함수
import type { SpecTexts } from "../db/spec-inputs";
import { SPEC_TEXT_KEYS } from "../db/spec-inputs";

export type DraftImagePart = { file: File; originalWidth: number };

export type DraftRequestInput = {
  projectId: string;
  spec: SpecTexts;
  route: string;
  images: readonly DraftImagePart[];
};

const filled = (v: string | undefined) => (v && v.trim() !== "" ? v : undefined);

/** 스펙 7개 항목 중 공백이 아닌 것이 1개 이상이거나 이미지가 1장 이상이면 초안을 만들 수 있다 */
export function canDraft(spec: SpecTexts, imageCount: number): boolean {
  return imageCount > 0 || SPEC_TEXT_KEYS.some((k) => filled(spec[k]) !== undefined);
}

/** 이미지만 있고 7개 항목이 모두 비었는지(막지 않고 안내만 한다) */
export const isImageOnly = (spec: SpecTexts, imageCount: number): boolean => imageCount > 0 && !SPEC_TEXT_KEYS.some((k) => filled(spec[k]) !== undefined);

/** stack은 보내지 않는다(서버가 프로젝트에 저장된 값을 쓴다). 비어 있지 않은 항목과 화면 주소만 담는다 */
export function buildDraftForm(input: DraftRequestInput): FormData {
  const form = new FormData();
  form.set("projectId", input.projectId);

  const spec: SpecTexts = {};
  for (const k of SPEC_TEXT_KEYS) {
    const v = filled(input.spec[k]);
    if (v !== undefined) spec[k] = v;
  }
  form.set("spec", JSON.stringify(spec));

  const route = input.route.trim();
  if (route) form.set("route", route);

  for (const img of input.images) form.append("images", img.file);
  if (input.images.length > 0) form.set("imageMeta", JSON.stringify(input.images.map((i) => ({ originalWidth: i.originalWidth }))));
  return form;
}

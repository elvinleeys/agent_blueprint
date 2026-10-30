// 초안 생성 한 번의 흐름: 이미지 축소 → 요청 구성 → 스트림 읽기 → 설계도 검증 → 화면용 결과/오류로 변환.
// 화면(컴포넌트)은 이 결과만 보고 스토어를 갱신한다. 입력은 건드리지 않으므로 어떤 오류든 입력은 그대로 보존된다.
import { BlueprintSchema, type Blueprint } from "../../core/schema/blueprint";
import type { NormalizeChange } from "../../core/schema/normalize-blueprint";
import type { SpecTexts } from "../db/spec-inputs";
import { buildDraftForm } from "./draft-request";
import { requestDraft, type DraftOutcome, type DraftStage } from "./draft-stream";
import { resizeImages, type ResizeResult } from "./resize-images";

export type DraftErrorInfo = {
  message: string;
  status?: number; // 서버가 알려 준 HTTP 상태 값(스트림 안 오류 포함)
  code?: string;
  fields?: { path: string; message: string }[];
  retryable: boolean; // 다시 시도 버튼을 보여 줄지
  needsLogin: boolean; // 401: 로그인 안내
};

export type RunResult =
  | { kind: "done"; blueprint: Blueprint; normalized: NormalizeChange[]; saved: boolean }
  | { kind: "failed"; error: DraftErrorInfo; keptBlueprint?: Blueprint }; // 저장만 실패했다면 초안(keptBlueprint)은 보여 준다

export type RunInput = { projectId: string; spec: SpecTexts; route: string; images: readonly File[] };
export type RunHooks = {
  onResizing?: () => void;
  onRunning?: () => void;
  onStage?: (stage: DraftStage) => void;
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
  resize?: (files: readonly File[]) => Promise<ResizeResult>;
};

const fail = (message: string, extra: Partial<DraftErrorInfo> = {}): RunResult => ({
  kind: "failed",
  error: { message, retryable: true, needsLogin: false, ...extra },
});

const SAVE_WARNING = "저장되지 않았습니다. 새로고침하면 사라질 수 있습니다.";

function toFailure(outcome: Exclude<DraftOutcome, { kind: "done" }>): RunResult {
  switch (outcome.kind) {
    case "disconnected":
      return fail("연결이 끊겼습니다. 입력은 그대로 남아 있으니 다시 시도해 주세요.");
    case "timeout":
      return fail("응답이 지연되고 있습니다. 입력은 그대로 남아 있으니 다시 시도해 주세요.");
    case "network":
      return fail("네트워크에 연결할 수 없습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
    case "aborted":
      return fail("요청이 취소되었습니다.");
    case "error": {
      const e = outcome.error;
      const base: Partial<DraftErrorInfo> = {
        status: outcome.status,
        code: e.code,
        ...(e.fields ? { fields: e.fields } : {}),
        // 422(AI 결과가 규칙을 통과하지 못함)는 서버 표시와 관계없이 다시 시도할 수 있다
        retryable: e.retryable || outcome.status === 422,
        needsLogin: outcome.status === 401,
      };
      if (outcome.blueprint !== undefined) {
        // 저장 실패: 만들어진 초안은 버리지 않고 보여 준다
        const kept = BlueprintSchema.safeParse(outcome.blueprint);
        return {
          kind: "failed",
          error: { message: `${e.message} ${SAVE_WARNING}`, retryable: true, needsLogin: false, ...base },
          ...(kept.success ? { keptBlueprint: kept.data } : {}),
        };
      }
      return { kind: "failed", error: { message: e.message, retryable: true, needsLogin: false, ...base } };
    }
  }
}

export async function runDraft(input: RunInput, hooks: RunHooks = {}): Promise<RunResult> {
  let images: { file: File; originalWidth: number }[] = [];
  if (input.images.length > 0) {
    hooks.onResizing?.();
    const resized = await (hooks.resize ?? resizeImages)(input.images);
    if (!resized.ok) return fail(resized.message, { retryable: false });
    images = resized.images;
  }

  hooks.onRunning?.();
  const form = buildDraftForm({ projectId: input.projectId, spec: input.spec, route: input.route, images });
  const outcome = await requestDraft(form, { hasImages: images.length > 0, onStage: hooks.onStage, signal: hooks.signal, fetchFn: hooks.fetchFn });
  if (outcome.kind !== "done") return toFailure(outcome);

  // 서버가 검증한 설계도지만, 화면에 반영하기 전에 한 번 더 검증한다
  const parsed = BlueprintSchema.safeParse(outcome.blueprint);
  if (!parsed.success) return fail("서버가 보낸 설계도를 읽을 수 없습니다. 다시 시도해 주세요.");
  return { kind: "done", blueprint: parsed.data, normalized: outcome.meta.normalized ?? [], saved: Boolean(outcome.meta.saved) };
}

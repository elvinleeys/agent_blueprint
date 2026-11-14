import "server-only";
import type OpenAI from "openai";
import type { AiInput } from "../../core/impl-check/ai-input";
import { acceptAiResponse, AiResponseSchema, type AiSuggestions } from "../../core/impl-check/ai-schema";
import { buildImplAiInput, IMPL_AI_INSTRUCTIONS } from "../../core/prompt/impl-ai-prompt";
import { toStrictJsonSchema } from "../../core/prompt/strict-json-schema";
import {
  BUDGET_TEXT_MS,
  callWithTimeout,
  classify,
  createDefaultClient,
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  estimateCostUsd,
  MIN_RETRY_MS,
  RESPONSE_MARGIN_MS,
  type DraftClient,
  type DraftModel,
  type Usage,
} from "./draft-blueprint";

/**
 * 구현 검사 AI 제안(서버 전용). 초안 생성과 같은 클라이언트·모델·마감(텍스트 45초)·오류 분류를 쓴다.
 * 응답은 받는 즉시 Zod 스키마로 검증하고, 형식이 틀리면 남은 시간이 있을 때만 1번 다시 요청한다(CLAUDE.md 규칙).
 * 실패해도 호출한 쪽은 코드 판정 결과만 보여 주면 되므로 예외를 던지지 않고 실패 종류만 돌려준다. 코드 조각은 로그·결과에 넣지 않는다.
 */

export const IMPL_AI_MAX_OUTPUT_TOKENS = 4_000;

export type ImplAiFailure = "invalid_output" | "timeout" | "rate_limited" | "upstream";
type Shared = { attempts: number; elapsedMs: number; usage: Usage; costUsd: number; model: DraftModel };
export type ImplAiResult = ({ ok: true; suggestions: AiSuggestions } & Shared) | ({ ok: false; kind: ImplAiFailure; issues?: string[]; retrySkipped?: boolean } & Shared);

export type ImplAiOptions = { client?: DraftClient; model?: DraftModel; budgetMs?: number; startedAt?: number; maxOutputTokens?: number };

let schemaCache: ReturnType<typeof toStrictJsonSchema> | undefined;
const strictSchema = () => (schemaCache ??= toStrictJsonSchema(AiResponseSchema));

type Response = Awaited<ReturnType<DraftClient["responses"]["create"]>>;
type Evaluation = { ok: true; suggestions: AiSuggestions } | { ok: false; issues: string[]; retryable: boolean };

function evaluate(res: Response, input: AiInput): Evaluation {
  if (res.status === "incomplete") return { ok: false, retryable: false, issues: [`응답이 중간에 끝났습니다(${res.incomplete_details?.reason ?? "unknown"})`] };
  const refusal = (res.output ?? []).flatMap((o) => (o.type === "message" ? o.content : [])).some((c) => c.type === "refusal");
  if (refusal) return { ok: false, retryable: false, issues: ["모델이 응답을 거부했습니다"] };
  let json: unknown;
  try {
    json = JSON.parse(res.output_text);
  } catch {
    return { ok: false, retryable: true, issues: ["응답이 JSON이 아닙니다"] };
  }
  const accepted = acceptAiResponse(json, input);
  return accepted.ok ? { ok: true, suggestions: accepted.suggestions } : { ok: false, retryable: true, issues: accepted.issues };
}

export async function suggestImplementation(input: AiInput, options: ImplAiOptions = {}): Promise<ImplAiResult> {
  const model = options.model ?? DEFAULT_MODEL;
  const startedAt = options.startedAt ?? Date.now();
  const deadline = startedAt + (options.budgetMs ?? BUDGET_TEXT_MS);
  const remainingMs = () => deadline - Date.now() - RESPONSE_MARGIN_MS;
  const client = options.client ?? createDefaultClient();
  const usage: Usage = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  let attempts = 0;
  const shared = (): Shared => ({ attempts, elapsedMs: Date.now() - startedAt, usage: { ...usage }, costUsd: estimateCostUsd(model, usage), model });

  const firstInput: OpenAI.Responses.ResponseInput = [{ role: "user", content: buildImplAiInput(input) }];

  async function attempt(items: OpenAI.Responses.ResponseInput, timeoutMs: number) {
    attempts++;
    const t0 = Date.now();
    try {
      const res = await callWithTimeout(
        client,
        {
          model,
          instructions: IMPL_AI_INSTRUCTIONS,
          input: items,
          reasoning: { effort: DEFAULT_EFFORT },
          max_output_tokens: options.maxOutputTokens ?? IMPL_AI_MAX_OUTPUT_TOKENS,
          store: false,
          text: { format: { type: "json_schema", name: "impl_suggestions", schema: strictSchema(), strict: true } },
        },
        timeoutMs,
      );
      usage.inputTokens += res.usage?.input_tokens ?? 0;
      usage.outputTokens += res.usage?.output_tokens ?? 0;
      usage.reasoningTokens += res.usage?.output_tokens_details?.reasoning_tokens ?? 0;
      return { type: "response" as const, res, ms: Date.now() - t0 };
    } catch (e) {
      return { type: "error" as const, ...classify(e) };
    }
  }

  const first = await attempt(firstInput, remainingMs());
  if (first.type === "error") return { ok: false, kind: first.kind, ...shared() };
  const firstEval = evaluate(first.res, input);
  if (firstEval.ok) return { ok: true, suggestions: firstEval.suggestions, ...shared() };
  if (!firstEval.retryable) return { ok: false, kind: "invalid_output", issues: firstEval.issues, ...shared() };

  // 남은 시간이 첫 시도만큼(최소 15초) 없으면 다시 요청하지 않는다
  const remaining = remainingMs();
  if (remaining < Math.max(first.ms, MIN_RETRY_MS)) return { ok: false, kind: "invalid_output", issues: firstEval.issues, retrySkipped: true, ...shared() };

  const retryInput: OpenAI.Responses.ResponseInput = [
    ...firstInput,
    { role: "assistant", content: first.res.output_text },
    { role: "user", content: `앞 응답이 형식에 맞지 않았습니다: ${firstEval.issues.join(" / ")}. 같은 입력에 대해 정해진 JSON 형식으로만 다시 답하세요.` },
  ];
  const second = await attempt(retryInput, remaining);
  if (second.type === "error") return { ok: false, kind: second.kind, issues: firstEval.issues, ...shared() };
  const secondEval = evaluate(second.res, input);
  if (secondEval.ok) return { ok: true, suggestions: secondEval.suggestions, ...shared() };
  return { ok: false, kind: "invalid_output", issues: secondEval.issues, ...shared() };
}

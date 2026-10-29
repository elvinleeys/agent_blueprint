import "server-only";
import OpenAI from "openai";
import { buildDraftPrompt, hasSpecText } from "../../core/prompt/draft-prompt";
import { buildRepairPrompt, type RepairIssue } from "../../core/prompt/repair-prompt";
import { stripOptionalNulls, toStrictJsonSchema } from "../../core/prompt/strict-json-schema";
import { BlueprintSchema, type Blueprint } from "../../core/schema/blueprint";
import { normalizeBlueprint, type NormalizeChange } from "../../core/schema/normalize-blueprint";
import type { SpecInput } from "../../core/schema/spec-input";

// 가격: 1M 토큰당 USD (표준 티어, ≤272K 입력). developers.openai.com/api/docs/models/<id>, 2026-10-29 확인
export const PRICES = {
  "gpt-6.1-terra": { in: 1, out: 5 },
  "gpt-6-luna": { in: 0.1, out: 0.5 },
  "gpt-6.1-sol": { in: 2, out: 10 },
} as const;
export type DraftModel = keyof typeof PRICES;

export const DEFAULT_MODEL: DraftModel = "gpt-6.1-terra";
export const DEFAULT_EFFORT: OpenAI.ReasoningEffort = "low";
export const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;

// 재시도를 포함한 전체 마감 (CLAUDE.md 에러 처리 규칙)
export const BUDGET_TEXT_MS = 45_000;
export const BUDGET_IMAGE_MS = 60_000;
const RESPONSE_MARGIN_MS = 1_500; // 마감 직전에 끊고 응답을 만들 여유
const MIN_RETRY_MS = 15_000; // 재시도는 첫 시도와 비슷한 시간이 걸리므로 max(첫 시도 시간, 이 값) 이상 남아야 한다

export type DraftImage = {
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
  originalWidth?: number;
};

export type DraftInput = {
  spec: SpecInput;
  stack: Blueprint["stack"];
  route: string | null;
  images: DraftImage[];
};

export type Usage = { inputTokens: number; outputTokens: number; reasoningTokens: number };
export type Field = { path: string; message: string };
export type AttemptLog = { ms: number; usage: Usage; rawText: string | null; fields?: Field[]; normalized?: NormalizeChange[] };

type Shared = { attempts: number; elapsedMs: number; usage: Usage; costUsd: number; log: AttemptLog[] };
export type DraftFailureKind = "invalid_output" | "rate_limited" | "upstream" | "timeout";
export type DraftResult =
  | ({ ok: true; blueprint: Blueprint; normalized: NormalizeChange[] } & Shared)
  | ({
      ok: false;
      kind: DraftFailureKind;
      normalized: NormalizeChange[]; // 마지막으로 평가한 응답에 적용한 자동 보정(그래도 실패한 경우 포함)
      fields?: Field[];
      retrySkipped?: boolean;
      upstreamStatus?: number;
      errorName?: string;
    } & Shared);

type DraftResponse = Pick<OpenAI.Responses.Response, "status" | "incomplete_details" | "output" | "output_text" | "usage">;
export type DraftClient = {
  responses: {
    create: (body: OpenAI.Responses.ResponseCreateParamsNonStreaming, options?: { signal?: AbortSignal }) => Promise<DraftResponse>;
  };
};

export type DraftOptions = {
  model?: DraftModel;
  effort?: OpenAI.ReasoningEffort;
  maxOutputTokens?: number;
  budgetMs?: number;
  startedAt?: number;
  client?: DraftClient;
};

export const estimateCostUsd = (model: DraftModel, usage: Usage) =>
  // output_tokens가 reasoning_tokens를 이미 포함한다(공식 Reasoning guide). 추론 토큰을 더하면 이중 계산이다
  (usage.inputTokens * PRICES[model].in + usage.outputTokens * PRICES[model].out) / 1e6;

/** 출력이 상한까지 나갔을 때의 한 번 호출 비용(입력 제외). 예산 보호용 */
export const worstCaseCallCostUsd = (model: DraftModel, maxOutputTokens: number) => (maxOutputTokens * PRICES[model].out) / 1e6;

let schemaCache: ReturnType<typeof toStrictJsonSchema> | undefined;
const strictSchema = () => (schemaCache ??= toStrictJsonSchema(BlueprintSchema));

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

class TimeoutError extends Error {}

function createDefaultClient(): DraftClient {
  const client = new OpenAI({ maxRetries: 0 }); // 429·5xx 재시도는 사용자의 "다시 시도"에 맡긴다. 숨은 재시도가 마감을 먹지 않게 한다
  return { responses: { create: (body, options) => client.responses.create(body, options) } };
}

async function callWithTimeout(client: DraftClient, body: OpenAI.Responses.ResponseCreateParamsNonStreaming, ms: number) {
  if (ms <= 0) throw new TimeoutError();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError());
    }, ms);
  });
  try {
    return await Promise.race([client.responses.create(body, { signal: controller.signal }), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function classify(e: unknown): { kind: "timeout" | "rate_limited" | "upstream"; status?: number; name?: string } {
  if (e instanceof TimeoutError) return { kind: "timeout" };
  const name = e instanceof Error ? e.name : undefined;
  const raw = isObj(e) ? e.status : undefined;
  const status = typeof raw === "number" ? raw : undefined;
  if (name === "APIConnectionTimeoutError" || name === "APIUserAbortError" || name === "AbortError") return { kind: "timeout", name };
  if (status === 429) return { kind: "rate_limited", status, name };
  return { kind: "upstream", status, name };
}

const toFields = (issues: RepairIssue[]): Field[] =>
  issues.slice(0, 10).map((i) => ({ path: i.path.map(String).join(".") || "(root)", message: i.message }));

type Evaluation =
  | { ok: true; blueprint: Blueprint; normalized: NormalizeChange[] }
  | { ok: false; fields: Field[]; retryable: false; normalized: NormalizeChange[] }
  | { ok: false; fields: Field[]; retryable: true; issues: RepairIssue[]; nodeNames: string[]; normalized: NormalizeChange[] };

// 모델이 바꾸거나 틀릴 수 있는 값은 요청 값으로 덮어쓴다(검증 전에 적용)
function enforce(json: unknown, input: DraftInput): unknown {
  if (!isObj(json)) return json;
  return {
    ...json,
    version: "1.2",
    stack: input.stack,
    route: input.route,
    source: { hasSpec: hasSpecText(input.spec), imageCount: input.images.length },
    generatedBy: "ai",
  };
}

function evaluate(res: DraftResponse, input: DraftInput): Evaluation {
  const stop = (message: string): Evaluation => ({ ok: false, retryable: false, fields: [{ path: "(response)", message }], normalized: [] });
  if (res.status === "incomplete") return stop(`응답이 중간에 끝났습니다(${res.incomplete_details?.reason ?? "unknown"})`);
  const refusal = (res.output ?? []).flatMap((o) => (o.type === "message" ? o.content : [])).find((c) => c.type === "refusal");
  if (refusal) return stop("모델이 응답을 거부했습니다");

  let json: unknown;
  try {
    json = JSON.parse(res.output_text);
  } catch {
    return stop("응답이 JSON이 아닙니다");
  }
  const forced = enforce(stripOptionalNulls(BlueprintSchema, json), input);
  const parsed = BlueprintSchema.safeParse(forced);
  if (parsed.success) return { ok: true, blueprint: parsed.data, normalized: [] };

  // 기계적으로 고칠 수 있는 오류만 보정해 다시 검증한다. 그래도 실패하면 남은 오류만 재시도 지시문에 쓴다
  const { blueprint: fixed, changes } = normalizeBlueprint(forced);
  let error = parsed.error;
  if (changes.length > 0) {
    const again = BlueprintSchema.safeParse(fixed);
    if (again.success) return { ok: true, blueprint: again.data, normalized: changes };
    error = again.error;
  }

  const issues = error.issues.map((i) => ({ path: i.path, message: i.message }));
  const nodes = isObj(json) && Array.isArray(json.nodes) ? json.nodes : [];
  const nodeNames = nodes.map((n) => (isObj(n) && typeof n.name === "string" ? n.name : ""));
  return { ok: false, retryable: true, fields: toFields(issues), issues, nodeNames, normalized: changes };
}

export async function draftBlueprint(input: DraftInput, options: DraftOptions = {}): Promise<DraftResult> {
  const model = options.model ?? DEFAULT_MODEL;
  const startedAt = options.startedAt ?? Date.now();
  const budgetMs = options.budgetMs ?? (input.images.length > 0 ? BUDGET_IMAGE_MS : BUDGET_TEXT_MS);
  const deadline = startedAt + budgetMs;
  const remainingMs = () => deadline - Date.now() - RESPONSE_MARGIN_MS;
  const client = options.client ?? createDefaultClient();

  const spec = { ...input.spec, imageCount: input.images.length };
  const { instructions, userText } = buildDraftPrompt({ spec, stack: input.stack, route: input.route, images: input.images });
  const content: OpenAI.Responses.ResponseInputContent[] = [
    { type: "input_text", text: userText },
    ...input.images.map((img): OpenAI.Responses.ResponseInputContent => ({
      type: "input_image",
      image_url: `data:${img.mediaType};base64,${img.base64}`,
      detail: "auto",
    })),
  ];
  const firstInput: OpenAI.Responses.ResponseInput = [{ role: "user", content }];

  const usage: Usage = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  const log: AttemptLog[] = [];
  const summary = (): Shared => ({
    attempts: log.length,
    elapsedMs: Date.now() - startedAt,
    usage: { ...usage },
    costUsd: estimateCostUsd(model, usage),
    log,
  });

  async function attempt(items: OpenAI.Responses.ResponseInput, timeoutMs: number) {
    const t0 = Date.now();
    try {
      const res = await callWithTimeout(
        client,
        {
          model,
          instructions,
          input: items,
          reasoning: { effort: options.effort ?? DEFAULT_EFFORT },
          max_output_tokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          store: false,
          text: { format: { type: "json_schema", name: "blueprint", schema: strictSchema(), strict: true } },
        },
        timeoutMs,
      );
      const used: Usage = {
        inputTokens: res.usage?.input_tokens ?? 0,
        outputTokens: res.usage?.output_tokens ?? 0,
        reasoningTokens: res.usage?.output_tokens_details?.reasoning_tokens ?? 0,
      };
      usage.inputTokens += used.inputTokens;
      usage.outputTokens += used.outputTokens;
      usage.reasoningTokens += used.reasoningTokens;
      const entry: AttemptLog = { ms: Date.now() - t0, usage: used, rawText: res.output_text || null };
      log.push(entry);
      return { type: "response" as const, res, entry };
    } catch (e) {
      log.push({ ms: Date.now() - t0, usage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 }, rawText: null });
      return { type: "error" as const, ...classify(e) };
    }
  }

  const errorResult = (e: { kind: DraftFailureKind; status?: number; name?: string }, fields?: Field[]): DraftResult => ({
    ok: false,
    kind: e.kind,
    normalized: [],
    fields,
    upstreamStatus: e.status,
    errorName: e.name,
    ...summary(),
  });

  const first = await attempt(firstInput, remainingMs());
  if (first.type === "error") return errorResult(first);
  const firstEval = evaluate(first.res, input);
  first.entry.normalized = firstEval.normalized;
  if (firstEval.ok) return { ok: true, blueprint: firstEval.blueprint, normalized: firstEval.normalized, ...summary() };
  first.entry.fields = firstEval.fields;
  if (!firstEval.retryable) {
    return { ok: false, kind: "invalid_output", fields: firstEval.fields, normalized: firstEval.normalized, ...summary() };
  }

  // 남은 시간이 부족하면 재시도하지 않고 첫 시도의 오류로 끝낸다
  const remaining = remainingMs();
  if (remaining < Math.max(first.entry.ms, MIN_RETRY_MS)) {
    return { ok: false, kind: "invalid_output", fields: firstEval.fields, normalized: firstEval.normalized, retrySkipped: true, ...summary() };
  }

  const retryInput: OpenAI.Responses.ResponseInput = [
    ...firstInput,
    { role: "assistant", content: first.res.output_text },
    { role: "user", content: buildRepairPrompt({ issues: firstEval.issues, nodeNames: firstEval.nodeNames }) },
  ];
  const second = await attempt(retryInput, remaining);
  if (second.type === "error") return errorResult(second, firstEval.fields);
  const secondEval = evaluate(second.res, input);
  second.entry.normalized = secondEval.normalized;
  if (secondEval.ok) return { ok: true, blueprint: secondEval.blueprint, normalized: secondEval.normalized, ...summary() };
  second.entry.fields = secondEval.fields;
  return { ok: false, kind: "invalid_output", fields: secondEval.fields, normalized: secondEval.normalized, ...summary() };
}

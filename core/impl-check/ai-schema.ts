import { z } from "zod";
import { stripOptionalNulls } from "../prompt/strict-json-schema";
import type { AiInput } from "./ai-input";

/**
 * AI 제안 응답 스키마와 받은 응답 거르기(순수 함수).
 * 스키마에 맞지 않으면 전체를 버린다(호출하는 쪽이 1회 재시도 뒤 AI 없이 결과만 보인다).
 * 스키마에는 맞지만 보내지 않은 노드·코드·책임을 가리키는 항목은 그 항목만 버리고 개수를 센다. 같은 대상이 두 번 오면 처음 것만 쓴다.
 */

const Reason = z.string().min(1).max(500);

export const AiResponseSchema = z
  .object({
    pairs: z
      .array(z.object({ nodeId: z.string(), path: z.string(), name: z.string(), verdict: z.enum(["same", "different", "unsure"]), reason: Reason }).strict())
      .max(50),
    // 수행함(done)은 화면에 요약만 보이므로 근거 없이 판정만 받는다(출력 토큰 절약). missing·unsure만 근거가 필요하다
    responsibilities: z
      .array(
        z
          .object({ nodeId: z.string(), responsibility: z.string(), verdict: z.enum(["done", "missing", "unsure"]), reason: Reason.optional() })
          .strict()
          .refine((r) => r.verdict === "done" || r.reason !== undefined, { message: "missing·unsure에는 reason이 필요합니다", path: ["reason"] }),
      )
      .max(100),
  })
  .strict();
export type AiResponse = z.infer<typeof AiResponseSchema>;

export type AiPairSuggestion = AiResponse["pairs"][number] & { id: string; nodeName: string };
export type AiResponsibilitySuggestion = AiResponse["responsibilities"][number] & { id: string; nodeName: string };
export type AiSuggestions = { pairs: AiPairSuggestion[]; responsibilities: AiResponsibilitySuggestion[]; dropped: number };

/** 같은 입력이면 같은 id(화면의 "수정 요청에 포함" 체크를 다시 검사 뒤에도 이어 가려고) */
export const aiPairId = (nodeId: string, path: string, name: string) => `AI|pair|${nodeId}|${path}#${name}`;
export const aiResponsibilityId = (nodeId: string, responsibility: string) => `AI|resp|${nodeId}|${responsibility}`;

export type AiAccept = { ok: true; suggestions: AiSuggestions } | { ok: false; issues: string[] };

export function acceptAiResponse(raw: unknown, input: AiInput): AiAccept {
  // strict 출력은 없는 선택 필드를 null로 보낸다(done의 reason). 검증 전에 null을 빈 필드로 바꾼다
  const parsed = AiResponseSchema.safeParse(stripOptionalNulls(AiResponseSchema, raw));
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(전체)"}: ${i.message}`) };

  const pairTask = new Map(input.pairTasks.map((t) => [t.nodeId, t]));
  const respTask = new Map(input.responsibilityTasks.map((t) => [t.nodeId, t]));
  const seen = new Set<string>();
  const out: AiSuggestions = { pairs: [], responsibilities: [], dropped: 0 };

  for (const p of parsed.data.pairs) {
    const t = pairTask.get(p.nodeId);
    const id = aiPairId(p.nodeId, p.path, p.name);
    if (!t || !t.candidates.some((c) => c.path === p.path && c.name === p.name) || seen.has(id)) {
      out.dropped++;
      continue;
    }
    seen.add(id);
    out.pairs.push({ ...p, id, nodeName: t.nodeName });
  }
  for (const r of parsed.data.responsibilities) {
    const t = respTask.get(r.nodeId);
    const id = aiResponsibilityId(r.nodeId, r.responsibility);
    if (!t || !t.responsibilities.includes(r.responsibility) || seen.has(id)) {
      out.dropped++;
      continue;
    }
    seen.add(id);
    // done에 근거가 붙어 와도 쓰지 않는다(판정만)
    const { reason, ...rest } = r;
    out.responsibilities.push({ ...rest, ...(r.verdict !== "done" && reason !== undefined ? { reason } : {}), id, nodeName: t.nodeName });
  }
  return { ok: true, suggestions: out };
}

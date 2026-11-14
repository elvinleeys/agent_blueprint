// 구현 검사 AI 제안 확인 스크립트(실제 OpenAI 호출은 --run을 붙였을 때만). /api의 AI 제안과 같은 lib/ai/impl-suggest를 호출한다.
//   npm run test:impl-ai                     # 보낼 대상·글자 수·최대 비용만 보여 주고 호출하지 않음
//   npm run test:impl-ai -- --run            # 실제 호출(비용 발생). 시험 데이터 next/renamed
//   npm run test:impl-ai -- --case wrong-IC-03 --run
// 키는 환경변수 OPENAI_API_KEY에서만 읽는다(.env.local은 npm script의 --env-file이 로드). 키·코드 조각은 출력하지 않는다.
import { parseArgs } from "node:util";
import { readCodeModel } from "../core/code-model/facts";
import { buildAiInput, isEmptyAiInput } from "../core/impl-check/ai-input";
import { loadBlueprint, loadCode } from "../core/impl-check/load-fixture";
import { checkImplementation } from "../core/impl-check/run";
import { buildImplAiInput } from "../core/prompt/impl-ai-prompt";
import { DEFAULT_MODEL, worstCaseCallCostUsd } from "../lib/ai/draft-blueprint";
import { IMPL_AI_MAX_OUTPUT_TOKENS, suggestImplementation } from "../lib/ai/impl-suggest";

async function main() {
  const { values } = parseArgs({ options: { case: { type: "string", default: "renamed" }, run: { type: "boolean", default: false } } });
  const name = values.case!;
  const bp = loadBlueprint("next", name);
  const files = loadCode("next", name);
  const { pairing, summary } = checkImplementation(bp, readCodeModel(files));
  const input = buildAiInput(bp, pairing, files);
  const chars = buildImplAiInput(input).length;

  console.log(`시험 데이터 next/${name}: 설계 항목 ${summary.design.total}개 중 일치 ${summary.design.match}개 · 확인 필요 ${summary.design.review}개`);
  console.log(`보낼 대상: 짝 제안 ${input.pairTasks.length}건(${input.pairTasks.map((t) => t.nodeName).join(", ") || "없음"}) · 책임 제안 ${input.responsibilityTasks.length}건 · 코드 조각 ${input.units.length}개 · 입력 ${chars.toLocaleString("en-US")}자`);
  if (input.omitted.pairNodes.length + input.omitted.responsibilityNodes.length) console.log(`생략: ${[...input.omitted.pairNodes, ...input.omitted.responsibilityNodes].join(", ")}`);
  // 재시도까지 2번 호출할 수 있다(입력 비용 제외한 출력 상한 기준)
  console.log(`모델 ${DEFAULT_MODEL}, 출력 상한 ${IMPL_AI_MAX_OUTPUT_TOKENS} 토큰 → 출력 최대 비용 약 $${(2 * worstCaseCallCostUsd(DEFAULT_MODEL, IMPL_AI_MAX_OUTPUT_TOKENS)).toFixed(4)}(재시도 포함)`);

  if (isEmptyAiInput(input)) return console.log("보낼 대상이 없어 호출하지 않습니다.");
  if (!values.run) return console.log("실제 호출은 --run을 붙여 실행하세요.");
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY가 없습니다(.env.local).");
    process.exit(1);
  }

  const r = await suggestImplementation(input);
  console.log(`결과: ${r.ok ? "성공" : `실패(${r.kind}${r.retrySkipped ? ", 재시도 안 함" : ""})`} · 호출 ${r.attempts}번 · ${(r.elapsedMs / 1000).toFixed(1)}초 · 토큰 입력 ${r.usage.inputTokens}/출력 ${r.usage.outputTokens} · 비용 약 $${r.costUsd.toFixed(4)}`);
  if (!r.ok) return console.log(`문제: ${(r.issues ?? []).join(" / ") || "-"}`);
  for (const p of r.suggestions.pairs) console.log(`[짝] ${p.nodeName} ↔ ${p.name}: ${p.verdict} — ${p.reason}`);
  for (const s of r.suggestions.responsibilities) console.log(`[책임] ${s.nodeName} · ${s.responsibility}: ${s.verdict} — ${s.reason}`);
  if (r.suggestions.dropped) console.log(`버린 항목(보내지 않은 대상을 가리킴): ${r.suggestions.dropped}개`);
}

if (process.argv[1]?.endsWith("test-impl-ai.ts")) void main();

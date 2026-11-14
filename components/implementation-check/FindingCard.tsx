import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Finding } from "@/core/impl-check/result";
import { REVIEW_LABEL, SEVERITY_LABEL } from "@/core/prompt/fix-prompt";
import type { PairReview } from "@/lib/client/run-implementation-check";
import { contestedText } from "./result-view";

type Common = { finding: Finding };

const borderOf = (f: Finding) => (f.certainty === "review" ? "border-border" : f.severity === "error" ? "border-destructive" : f.severity === "warning" ? "border-warning" : undefined);

function Evidence({ list }: { list: string[] }) {
  if (!list.length) return null;
  return (
    <ul className="list-disc break-words pl-5 text-xs text-foreground-tertiary">
      {list.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}

/** 확실한 카드 또는 설계 밖 발견: 설명과 근거만 보인다 */
export function CertainCard({ finding: f }: Common) {
  return (
    <li>
      <Card className={borderOf(f)}>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 break-words text-sm">
            <Badge variant={f.severity === "info" ? "secondary" : "destructive"}>{SEVERITY_LABEL[f.severity ?? "warning"]}</Badge>
            <span>
              {f.rule} · {f.node}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 break-words text-sm text-foreground-secondary">
          <p>{f.message}</p>
          <Evidence list={f.evidence} />
        </CardContent>
      </Card>
    </li>
  );
}

/**
 * 확인 필요 카드: 설명·근거, 후보(있으면 경로와 근거, "다른 노드의 1순위이기도 함"), 행동.
 * [같은 것으로 짝짓기]는 후보 코드마다 보이고, "수정 요청에 포함" 체크는 수정 지시서에만 영향을 준다(설계 준수 집계는 그대로).
 */
export function ReviewCard({
  finding: f,
  included,
  onToggle,
  pairReview,
  onConfirm,
  busy,
}: Common & { included: boolean; onToggle: () => void; pairReview: PairReview | undefined; onConfirm: (nodeId: string, path: string, name: string) => void; busy: boolean }) {
  const checkId = `ic-include-${f.id}`;
  const candidates = f.kind === "pair" ? (pairReview?.candidates ?? []) : [];
  return (
    <li>
      <Card className={borderOf(f)}>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 break-words text-sm">
            <Badge variant="outline">{REVIEW_LABEL[f.kind ?? "pair"]}</Badge>
            <span>
              {f.rule} · {f.node}
            </span>
            {included && <Badge variant="default">수정 요청에 포함됨</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 break-words text-sm text-foreground-secondary">
          <p>{f.message}</p>
          <Evidence list={f.evidence} />
          {candidates.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label={`${f.node}의 후보 코드`}>
              {candidates.map((c) => (
                <li key={`${c.path}#${c.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-foreground">
                      {c.name} <span className="text-xs text-foreground-tertiary">({c.kind === "hook" ? "훅" : "컴포넌트"})</span>
                    </span>
                    <span className="break-all text-xs text-foreground-tertiary">{c.path}</span>
                    {contestedText(c.contestedBy) && <span className="text-xs text-warning">{contestedText(c.contestedBy)}</span>}
                    {c.evidence.map((e) => (
                      <span key={e.detail} className="break-words text-xs text-foreground-tertiary">
                        {e.detail}
                      </span>
                    ))}
                  </span>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onConfirm(f.nodeIds[0], c.path, c.name)} aria-label={`${f.node}를 ${c.name}(${c.path})와 같은 것으로 짝짓기`}>
                    같은 것으로 짝짓기
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <input id={checkId} type="checkbox" checked={included} onChange={onToggle} aria-label={`${f.rule} · ${f.node} 수정 요청에 포함`} className="size-4" />
            <label htmlFor={checkId} className="text-foreground">
              수정 요청에 포함
            </label>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

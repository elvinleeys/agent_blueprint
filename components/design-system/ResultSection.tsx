import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyzeResult } from "@/core/cleanup/analyze";
import type { CompRef, Finding } from "@/core/cleanup/compare";
import { groupFindings, RULE_TITLE } from "./result-view";

const where = (r: CompRef) => (r.path ? `${r.name} (${r.path})` : `${r.name} (공식 스펙 항목)`);

function FindingCard({ f }: { f: Finding }) {
  const warn = f.severity === "warning";
  return (
    <li>
      <Card className={warn ? "border-warning" : undefined}>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={warn ? "destructive" : "secondary"}>{warn ? "경고" : "정보"}</Badge>
            {f.rule} {RULE_TITLE[f.rule]}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-foreground-secondary">
          <p>{f.message}</p>
          {f.rule === "C-02" && (
            <>
              <ul className="list-disc pl-5">
                {f.members.map((m) => (
                  <li key={`${m.name}:${m.path}`}>
                    {m.official ? "공식 " : ""}
                    {where(m)}
                  </li>
                ))}
              </ul>
              <ul className="list-disc pl-5 text-xs text-foreground-tertiary">
                {f.evidence.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </>
          )}
          {(f.rule === "C-03" || f.rule === "C-05") && <p className="text-xs text-foreground-tertiary">{f.component.path}</p>}
        </CardContent>
      </Card>
    </li>
  );
}

/** 분석 결과: 위에서부터 요약 → 알림(문법 오류·못 읽음) → 경고 → 정보(합치기 후보) → 접힌 "공식 목록에 없음" */
export default function ResultSection({ result }: { result: AnalyzeResult }) {
  const { summary } = result;
  const g = groupFindings(result.findings);
  const partial = result.partialFiles;

  return (
    <section aria-labelledby="ds-result-title" className="flex flex-col gap-4">
      <h2 id="ds-result-title" className="text-lg font-semibold text-foreground">
        분석 결과
      </h2>
      <p className="text-sm text-foreground-secondary">
        공식 컴포넌트 {result.officialCount}개 기준 · 비교한 컴포넌트 {summary.comparedCount}개
        {summary.internalCount > 0 && ` · 파일 안에서만 쓰는 ${summary.internalCount}개 제외`}
      </p>
      {result.sameAsDesignSystemCount > 0 && (
        <p className="text-sm text-foreground-secondary">검사할 코드에 올린 파일 중 디자인 시스템 파일과 내용이 같은 {result.sameAsDesignSystemCount}개는 비교에서 뺐습니다.</p>
      )}

      {partial.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <p className="font-medium">문법 오류로 일부만 분석됨 ({partial.length}개 파일)</p>
            <ul className="mt-1 list-disc pl-5">
              {partial.map((p) => (
                <li key={p.path}>
                  {p.path} — {p.errors[0]?.line}줄: {p.errors[0]?.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {result.failedPaths.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>분석하지 못한 파일: {result.failedPaths.join(", ")}</AlertDescription>
        </Alert>
      )}
      {summary.unresolvedCount > 0 && (
        <p className="text-sm text-foreground-secondary">props를 일부만 읽은 컴포넌트가 {summary.unresolvedCount}개 있습니다(다른 파일·패키지의 타입을 읽지 못함). 이 컴포넌트의 props 비교는 부정확할 수 있습니다.</p>
      )}
      {result.inferWarnings.length > 0 && (
        <details className="text-sm text-foreground-secondary">
          <summary className="cursor-pointer">공식 스펙을 만들 때 건너뛴 값 {result.inferWarnings.length}건</summary>
          <ul className="mt-1 list-disc pl-5">
            {result.inferWarnings.map((w, i) => (
              <li key={i}>
                {w.kind === "variant-dropped" && `${w.component}: kebab-case가 아닌 variant를 뺐습니다 (${w.values.join(", ")})`}
                {w.kind === "duplicate-name" && `${w.name}: 같은 이름이 여러 파일에 있어 첫 파일만 썼습니다 (${w.paths.join(", ")})`}
                {w.kind === "invalid-component" && `${w.name}: ${w.message}`}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div>
        <h3 className="mb-2 text-base font-semibold text-foreground">경고 ({g.warnings.length})</h3>
        {g.warnings.length ? (
          <ul className="flex flex-col gap-2">
            {g.warnings.map((f, i) => (
              <FindingCard key={i} f={f} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-foreground-secondary">정리가 필요한 경고 항목이 없습니다.</p>
        )}
      </div>

      {g.infoMerge.length > 0 && (
        <div>
          <h3 className="mb-2 text-base font-semibold text-foreground">정보: 서로 비슷한 컴포넌트 ({g.infoMerge.length})</h3>
          <ul className="flex flex-col gap-2">
            {g.infoMerge.map((f, i) => (
              <FindingCard key={i} f={f} />
            ))}
          </ul>
        </div>
      )}

      {g.notOfficial.length > 0 && (
        <details className="rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-foreground">공식 목록에 없음 ({g.notOfficial.length}개)</summary>
          <p className="mt-2 text-xs text-foreground-tertiary">화면 전용 컴포넌트가 공식 목록에 없는 것은 정상입니다. 여러 곳에서 쓰이면 공식 목록에 추가할지 검토하세요.</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-foreground-secondary">
            {g.notOfficial.map((f, i) => (
              <li key={i}>{where(f.component)}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

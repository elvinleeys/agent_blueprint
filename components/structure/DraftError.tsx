"use client";

import GuardedLink from "../layout/GuardedLink";
import { usePathname } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useStructureStore } from "./StructureStoreProvider";

export default function DraftError({ onRetry }: { onRetry: () => void }) {
  const error = useStructureStore((s) => s.error);
  const status = useStructureStore((s) => s.status);
  const pathname = usePathname();
  if (status !== "error" || !error) return null;

  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>초안을 만들지 못했습니다</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>{error.message}</p>
        {(error.status || error.code) && (
          <p className="text-xs text-foreground-tertiary">
            {[error.status ? `상태 ${error.status}` : null, error.code].filter(Boolean).join(" · ")}
          </p>
        )}
        {error.fields && error.fields.length > 0 && (
          <ul className="list-disc pl-5 text-xs text-foreground-secondary">
            {error.fields.map((f, i) => (
              <li key={i}>
                <code>{f.path}</code>: {f.message}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-3">
          {error.retryable && (
            <Button type="button" size="sm" onClick={onRetry}>
              다시 시도
            </Button>
          )}
          {error.needsLogin && (
            <GuardedLink href={`/?next=${encodeURIComponent(pathname)}`} className="text-sm text-primary underline">
              로그인하기
            </GuardedLink>
          )}
          <span className="text-xs text-foreground-tertiary">입력한 내용은 그대로 남아 있습니다.</span>
        </div>
      </AlertDescription>
    </Alert>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import GuardedLink from "../layout/GuardedLink";
import { useSaveQueue } from "./SaveQueueProvider";
import { useStructureStore } from "./StructureStoreProvider";

/** 자동 저장 상태: 저장 중(대기·전송) / 저장됨 / 실패(안내 문구와 다시 시도). 항상 그려 두어 스크린 리더가 변화를 읽는다 */
export default function SaveStatus() {
  const status = useStructureStore((s) => s.saveStatus);
  const error = useStructureStore((s) => s.saveError);
  const queue = useSaveQueue();
  const pathname = usePathname();

  return (
    <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 text-xs font-normal text-foreground-tertiary">
      {(status === "pending" || status === "saving") && "저장 중…"}
      {status === "saved" && "저장됨"}
      {status === "error" && (
        <>
          <span className="text-destructive">{error?.message ?? "저장하지 못했습니다. 잠시 후 다시 시도해 주세요."}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => queue.retry()}>
            다시 시도
          </Button>
          {error?.needsLogin && (
            <GuardedLink href={`/?next=${encodeURIComponent(pathname)}`} className="text-primary underline">
              로그인하기
            </GuardedLink>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import type { DeleteMode } from "@/core/edit/delete-node";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * 자식이 있는 노드를 지울 때의 선택 창: 함께 삭제 / 자식을 상위로 옮기고 삭제 / 취소.
 * 버튼 순서는 취소가 먼저라 처음 포커스가 취소 버튼에 놓인다(되돌릴 수 없는 삭제가 기본 선택이 되지 않게).
 */
export function DeleteDialog({ open, name, childCount, descendantCount, onCancel, onDelete }: { open: boolean; name: string; childCount: number; descendantCount: number; onCancel: () => void; onDelete: (mode: DeleteMode) => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{name}에는 자식이 {childCount}개 있습니다</DialogTitle>
          <DialogDescription>
            자식도 함께 지우거나, 자식을 상위 노드로 옮기고 이 노드만 지울 수 있습니다. 되돌릴 수 없습니다(실행 취소는 아직 없습니다).
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-foreground-tertiary">옮겨진 자식은 이 노드가 있던 자리에 순서대로 들어갑니다. 새 부모가 그리드가 아니거나 열 수가 모자라면 자식의 차지 칸은 비워집니다.</p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            취소
          </Button>
          <Button type="button" variant="outline" onClick={() => onDelete("promote")}>
            자식을 상위로 옮기고 삭제
          </Button>
          <Button type="button" variant="destructive" onClick={() => onDelete("cascade")}>
            자식과 함께 삭제 (노드 {descendantCount + 1}개)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

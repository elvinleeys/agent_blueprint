"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** 되돌릴 수 없거나 값이 사라지는 변경 앞의 확인 창. Esc·바깥 클릭은 취소이고 처음 포커스는 취소 버튼에 놓인다 */
export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = "취소", onConfirm, onCancel }: { open: boolean; title: string; description: string; confirmLabel: string; cancelLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

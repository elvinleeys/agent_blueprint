"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { canConfirmDelete } from "@/lib/client/delete-project";

/** 프로젝트 삭제 확인 창: 프로젝트 이름을 다시 입력해야 삭제 버튼이 켜진다. Esc·바깥 클릭은 취소(삭제 중에는 닫히지 않음) */
export default function DeleteProjectDialog({ open, projectName, pending, error, onConfirm, onCancel }: { open: boolean; projectName: string; pending: boolean; error: string | null; onConfirm: () => void; onCancel: () => void }) {
  const [typed, setTyped] = useState("");
  const ready = canConfirmDelete(typed, projectName) && !pending;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>프로젝트를 삭제할까요?</DialogTitle>
          <DialogDescription>설계도의 모든 판, 스펙 입력, 지시서 기록이 함께 삭제되고 되돌릴 수 없습니다. 삭제하려면 프로젝트 이름 “{projectName}”을(를) 아래에 다시 입력하세요.</DialogDescription>
        </DialogHeader>
        <label htmlFor="delete-confirm" className="sr-only">
          프로젝트 이름 확인
        </label>
        <Input id="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={pending} autoComplete="off" />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            취소
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={!ready}>
            {pending ? "삭제 중…" : "삭제"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

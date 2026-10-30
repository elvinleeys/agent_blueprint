"use client";

import { useState, type ReactNode } from "react";
import { addChild } from "@/core/edit/add-child";
import { deleteNode, type DeleteMode } from "@/core/edit/delete-node";
import { moveNode, moveTargets } from "@/core/edit/move-node";
import { reorderNode } from "@/core/edit/reorder-node";
import { descendantIds, kidsOf } from "@/core/edit/structure-utils";
import type { Blueprint, ComponentNode } from "@/core/schema/blueprint";
import { Button } from "@/components/ui/button";
import { useStructureStore } from "../StructureStoreProvider";
import { SelectField } from "./controls";
import { ConfirmDialog } from "./ConfirmDialog";
import { DeleteDialog } from "./DeleteDialog";
import { FieldError, fieldId, useClearErrorOnUnmount, useEditApi } from "./Field";

// 비활성 버튼도 키보드 포커스를 잃지 않게 disabled 대신 aria-disabled를 쓴다(끝까지 눌러도 포커스가 사라지지 않는다)
const DISABLED = "aria-disabled:pointer-events-none aria-disabled:opacity-50";
const focusNameLater = () => requestAnimationFrame(() => document.getElementById(fieldId("name"))?.focus());

function Group({ fieldKey, label, hint, children }: { fieldKey: string; label: string; hint?: string; children: ReactNode }) {
  const id = fieldId(fieldKey);
  const error = useStructureStore((s) => s.editErrors[fieldKey]);
  useClearErrorOnUnmount(fieldKey);
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-foreground-secondary">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
      {hint && <p className="text-xs text-foreground-tertiary">{hint}</p>}
      {error && <FieldError id={`${id}-error`} message={error} />}
    </div>
  );
}

/** 구조 편집: 부모 변경(선택 상자), 순서 변경(위·아래), 자식 추가, 삭제. 모두 core/edit의 연산을 부르기만 한다 */
export default function StructureSection({ bp, node }: { bp: Blueprint; node: ComponentNode }) {
  const { apply, setError } = useEditApi();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isRoot = node.parentId === null;
  const isHook = node.kind === "hook";
  const siblings = kidsOf(bp.nodes, node.parentId);
  const at = siblings.findIndex((n) => n.id === node.id);
  const childCount = bp.nodes.filter((n) => n.parentId === node.id).length;
  const descendantCount = descendantIds(bp.nodes, node.id).size;
  const NBSP = " ";

  const run = (key: string, op: Parameters<typeof apply>[0]) => {
    const r = apply(op);
    setError(key, r.ok ? null : r.reason);
    return r;
  };

  function remove(mode: DeleteMode) {
    setDeleteOpen(false);
    const r = run("structure.delete", (b) => deleteNode(b, node.id, mode));
    if (r.ok) focusNameLater(); // 지운 노드의 부모가 선택된다
  }

  return (
    <>
      {isRoot ? (
        <p className="text-sm text-foreground-secondary">루트 노드는 부모를 바꾸거나 순서를 옮기거나 삭제할 수 없습니다.</p>
      ) : (
        <SelectField
          fieldKey="structure.parent"
          label="부모"
          value={node.parentId ?? ""}
          hint="자기 자신·자손·훅은 고를 수 없습니다. 옮기면 형제 중 마지막 자리에 놓이고 하위 노드는 함께 옮겨집니다."
          options={moveTargets(bp, node.id).map(({ node: n, depth }) => ({ value: n.id, label: `${NBSP.repeat(depth * 2)}${n.name}` }))}
          onChange={(parentId) => run("structure.parent", (b) => moveNode(b, node.id, parentId))}
        />
      )}

      <Group fieldKey="structure.order" label={isRoot ? "순서" : `순서 (형제 ${siblings.length}개 중 ${at + 1}번째)`}>
        <Button type="button" size="sm" variant="outline" className={DISABLED} aria-disabled={isRoot || at <= 0} onClick={() => !isRoot && at > 0 && run("structure.order", (b) => reorderNode(b, node.id, "up"))}>
          위로
        </Button>
        <Button type="button" size="sm" variant="outline" className={DISABLED} aria-disabled={isRoot || at < 0 || at >= siblings.length - 1} onClick={() => !isRoot && at < siblings.length - 1 && run("structure.order", (b) => reorderNode(b, node.id, "down"))}>
          아래로
        </Button>
      </Group>

      <Group fieldKey="structure.add" label="자식 추가" hint={isHook ? "훅에는 자식을 추가할 수 없습니다." : "이름이 겹치지 않는 기본 이름으로 만들고 바로 선택합니다."}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={DISABLED}
          aria-disabled={isHook}
          onClick={() => {
            if (isHook) return;
            const r = run("structure.add", (b) => addChild(b, node.id));
            if (r.ok) focusNameLater(); // 새 노드가 선택되고 패널이 그 노드로 바뀐다
          }}
        >
          자식 노드 추가
        </Button>
      </Group>

      <Group fieldKey="structure.delete" label="삭제" hint={isRoot ? "루트는 삭제할 수 없습니다." : "되돌릴 수 없습니다(실행 취소는 아직 없습니다)."}>
        <Button type="button" size="sm" variant="destructive" className={DISABLED} aria-disabled={isRoot} onClick={() => !isRoot && setDeleteOpen(true)}>
          노드 삭제
        </Button>
      </Group>

      {childCount === 0 ? (
        <ConfirmDialog open={deleteOpen} title={`${node.name} 노드를 삭제할까요?`} description="되돌릴 수 없습니다(실행 취소는 아직 없습니다)." confirmLabel="삭제" onCancel={() => setDeleteOpen(false)} onConfirm={() => remove("cascade")} />
      ) : (
        <DeleteDialog open={deleteOpen} name={node.name} childCount={childCount} descendantCount={descendantCount} onCancel={() => setDeleteOpen(false)} onDelete={remove} />
      )}
    </>
  );
}

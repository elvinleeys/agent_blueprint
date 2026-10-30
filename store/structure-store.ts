import { createStore } from "zustand/vanilla";
import { describeEditNotices } from "../core/edit/notice";
import { reject, type EditResult } from "../core/edit/result";
import type { Blueprint } from "../core/schema/blueprint";
import type { SaveStatus } from "../lib/client/save-queue";
import type { NormalizeChange } from "../core/schema/normalize-blueprint";
import type { Viewport } from "../core/preview/preview";
import type { DraftStage } from "../lib/client/draft-stream";
import type { DraftErrorInfo } from "../lib/client/run-draft";
import type { SpecTexts, StoredSpecInput } from "../lib/db/spec-inputs";

export type StructureView = "preview" | "tree";
export type SaveFailure = { message: string; needsLogin: boolean };
/** idle 대기 / resizing 이미지 줄이는 중(브라우저) / running 서버 처리 중 / done 완료 / error 실패 */
export type DraftStatus = "idle" | "resizing" | "running" | "done" | "error";

export type StructureInit = {
  blueprint: Blueprint | null;
  /** 저장된 스펙 입력. 입력칸의 초기값이다(이미지는 저장하지 않아 개수만 있다) */
  savedInput: StoredSpecInput | null;
};

export type StructureState = StructureInit & {
  // 입력(탭을 오가도 유지된다)
  spec: SpecTexts;
  route: string;
  images: File[]; // 고른 원본(5MB 이하 검사를 통과한 것). 전송 때 축소한다
  // 초안 생성 진행
  status: DraftStatus;
  stages: DraftStage[];
  startedAt: number | null;
  error: DraftErrorInfo | null;
  unsaved: boolean; // 초안은 보이지만 저장에 실패한 상태
  /** 이번에 새로 만든 초안의 자동 보정 내역. 저장된 판을 불러온 경우는 DB에 없어 비어 있다 */
  normalized: NormalizeChange[];
  // 편집
  editRevision: number; // 설계도에 편집이 반영될 때마다 1씩 늘어난다. 자동 저장이 이 값의 변화를 보고 저장을 예약한다
  saveStatus: SaveStatus; // 자동 저장 큐의 상태(큐가 알려 준다)
  saveError: SaveFailure | null; // 마지막 저장 실패의 안내 문구. 저장에 성공하면 지워진다
  editNotices: string[]; // 마지막 편집이 자동으로 바꾼 값의 안내 문구. 다음 편집이나 닫기로 사라진다
  /** 설계도에 반영하지 못한 입력칸의 이유(칸 키 → 문구). 비어 있지 않으면 화면에만 있는 틀린 값이 있다는 뜻이다 */
  editErrors: Record<string, string>;
  /** 틀린 값이 있는 채로 다른 노드를 고르려 할 때 확인을 기다리는 노드 id */
  selectRequest: string | null;
  // 보기
  selectedNodeId: string | null;
  viewport: Viewport;
  view: StructureView;

  /** 편집 연산을 현재 설계도에 적용한다. 성공해 설계도가 바뀌면 반영하고, 실패하거나 초안 생성 중이면 설계도를 그대로 두고 이유를 돌려준다 */
  applyEdit: (op: (blueprint: Blueprint) => EditResult) => EditResult;
  setSaveStatus: (status: SaveStatus) => void;
  setSaveError: (error: SaveFailure | null) => void;
  dismissNotices: () => void;
  setEditError: (key: string, message: string | null) => void;
  /** key 자신과 key.로 시작하는 칸의 오류를 지운다. key가 없으면 모두 지운다 */
  clearEditErrors: (key?: string) => void;
  /** 사용자의 노드 선택. 틀린 값이 남아 있으면 바로 바꾸지 않고 확인을 기다린다(selectRequest) */
  requestSelect: (id: string) => void;
  confirmSelect: () => void;
  cancelSelect: () => void;
  select: (id: string | null) => void;
  setViewport: (viewport: Viewport) => void;
  setView: (view: StructureView) => void;
  setBlueprint: (blueprint: Blueprint | null, normalized?: NormalizeChange[]) => void;

  setSpecField: (key: keyof SpecTexts, value: string) => void;
  setRoute: (route: string) => void;
  addImages: (files: File[]) => void;
  removeImage: (index: number) => void;

  startDraft: (now: number, resizing: boolean) => void;
  setRunning: () => void;
  addStage: (stage: DraftStage) => void;
  finishDraft: (blueprint: Blueprint, normalized: NormalizeChange[]) => void;
  failDraft: (error: DraftErrorInfo, keptBlueprint?: Blueprint) => void;
};

/** 작업공간(프로젝트)마다 따로 만든다. 탭을 오가도 입력·선택·보기 상태가 유지된다 */
export function createStructureStore(init: StructureInit) {
  const nextSelection = (blueprint: Blueprint | null, current: string | null) =>
    blueprint?.nodes.some((n) => n.id === current) ? current : null; // 설계도가 바뀌어 사라진 노드를 가리키는 선택은 해제한다

  return createStore<StructureState>()((set, get) => ({
    ...init,
    spec: { ...(init.savedInput?.spec ?? {}) },
    route: init.savedInput?.route ?? "",
    images: [],
    status: "idle",
    stages: [],
    startedAt: null,
    error: null,
    unsaved: false,
    normalized: [],
    editRevision: 0,
    saveStatus: "idle",
    saveError: null,
    editNotices: [],
    editErrors: {},
    selectRequest: null,
    selectedNodeId: null,
    viewport: "desktop",
    view: "preview",

    applyEdit: (op) => {
      const s = get();
      if (!s.blueprint) return reject("편집할 설계도가 없습니다.");
      if (s.status === "resizing" || s.status === "running") return reject("초안을 만드는 중에는 편집할 수 없습니다.");
      const r = op(s.blueprint);
      if (!r.ok || r.blueprint === s.blueprint) return r; // 실패이거나 바뀐 것이 없으면 저장할 것도 없다
      set((cur) => ({
        blueprint: r.blueprint,
        editRevision: cur.editRevision + 1,
        selectedNodeId: r.selectId ?? nextSelection(r.blueprint, cur.selectedNodeId),
        editNotices: describeEditNotices(r),
      }));
      return r;
    },
    setSaveStatus: (saveStatus) => set({ saveStatus }),
    setSaveError: (saveError) => set({ saveError }),
    dismissNotices: () => set({ editNotices: [] }),
    setEditError: (key, message) =>
      set((s) => {
        if ((s.editErrors[key] ?? null) === message) return s; // 같은 값이면 다시 그리지 않는다
        const rest = { ...s.editErrors };
        delete rest[key];
        return { editErrors: message === null ? rest : { ...rest, [key]: message } };
      }),
    clearEditErrors: (key) =>
      set((s) => {
        const keep = key === undefined ? [] : Object.entries(s.editErrors).filter(([k]) => k !== key && !k.startsWith(`${key}.`));
        return keep.length === Object.keys(s.editErrors).length ? s : { editErrors: Object.fromEntries(keep) };
      }),
    requestSelect: (id) => {
      const s = get();
      if (id === s.selectedNodeId) return;
      if (Object.keys(s.editErrors).length > 0) set({ selectRequest: id });
      else s.select(id);
    },
    confirmSelect: () => {
      const id = get().selectRequest;
      if (id !== null) get().select(id);
    },
    cancelSelect: () => set({ selectRequest: null }),
    select: (id) => set({ selectedNodeId: id, editErrors: {}, selectRequest: null }), // 패널은 노드가 바뀌면 입력을 새로 시작한다
    setViewport: (viewport) => set({ viewport }),
    setView: (view) => set({ view }),
    setBlueprint: (blueprint, normalized = []) =>
      set((s) => ({ blueprint, normalized, selectedNodeId: nextSelection(blueprint, s.selectedNodeId) })),

    setSpecField: (key, value) => set((s) => ({ spec: { ...s.spec, [key]: value } })),
    setRoute: (route) => set({ route }),
    addImages: (files) => set((s) => ({ images: [...s.images, ...files] })),
    removeImage: (index) => set((s) => ({ images: s.images.filter((_, i) => i !== index) })),

    // 이미 진행 중이면 무시한다(중복 호출 방지)
    startDraft: (now, resizing) =>
      set((s) =>
        s.status === "resizing" || s.status === "running"
          ? s
          : { status: resizing ? "resizing" : "running", stages: [], startedAt: now, error: null, unsaved: false, editErrors: {}, selectRequest: null },
      ),
    setRunning: () => set((s) => (s.status === "resizing" ? { status: "running" } : s)),
    addStage: (stage) => set((s) => ({ stages: [...s.stages, stage] })),
    finishDraft: (blueprint, normalized) =>
      set((s) => ({
        status: "done",
        error: null,
        unsaved: false,
        saveStatus: "idle", // 새 초안은 서버가 판으로 저장했다. 이전 편집의 저장 상태는 이어지지 않는다
        editNotices: [],
        blueprint,
        normalized,
        selectedNodeId: nextSelection(blueprint, s.selectedNodeId),
        // 방금 보낸 입력이 저장된 입력이 된다(이미지는 개수만)
        savedInput: { spec: { ...s.spec }, route: s.route.trim() || null, imageCount: s.images.length },
      })),
    failDraft: (error, keptBlueprint) =>
      set((s) => ({
        status: "error",
        error,
        ...(keptBlueprint
          ? { blueprint: keptBlueprint, normalized: [], unsaved: true, saveStatus: "idle" as const, editNotices: [], selectedNodeId: nextSelection(keptBlueprint, get().selectedNodeId) }
          : {}),
        startedAt: s.startedAt,
      })),
  }));
}

export type StructureStore = ReturnType<typeof createStructureStore>;

/**
 * 저장되지 않은 수정이 있는가: 저장 대기·전송 중·저장 실패, 그리고 초안 저장 실패(unsaved).
 * "초안 다시 생성" 확인과 떠나기 전 경고가 이 값을 쓴다.
 */
export const selectHasUnsaved = (s: Pick<StructureState, "unsaved" | "saveStatus">): boolean =>
  s.unsaved || s.saveStatus === "pending" || s.saveStatus === "saving" || s.saveStatus === "error";

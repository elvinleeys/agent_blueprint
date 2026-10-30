// 미리보기 상자의 배치 값은 인라인 스타일·임의값을 쓸 수 없어서, 가능한 값마다 정적 클래스를 미리 적어 둔다
// (Tailwind가 소스에서 클래스 이름을 찾으므로 아래 문자열은 조각내지 않고 그대로 써야 한다)

export const GRID_COLS: Record<number, string> = {
  1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5", 6: "grid-cols-6",
  7: "grid-cols-7", 8: "grid-cols-8", 9: "grid-cols-9", 10: "grid-cols-10", 11: "grid-cols-11", 12: "grid-cols-12",
};

export const COL_SPAN: Record<number, string> = {
  1: "col-span-1", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4", 5: "col-span-5", 6: "col-span-6",
  7: "col-span-7", 8: "col-span-8", 9: "col-span-9", 10: "col-span-10", 11: "col-span-11", 12: "col-span-12",
};
export const COL_SPAN_FULL = "col-span-full";

export const GAP: Record<number, string> = {
  0: "gap-0", 1: "gap-1", 2: "gap-2", 3: "gap-3", 4: "gap-4", 5: "gap-5", 6: "gap-6",
  7: "gap-7", 8: "gap-8", 9: "gap-9", 10: "gap-10", 11: "gap-11", 12: "gap-12",
};

export const ALIGN_ITEMS = { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch" } as const;
export const JUSTIFY = { start: "justify-start", center: "justify-center", end: "justify-end", between: "justify-between" } as const;

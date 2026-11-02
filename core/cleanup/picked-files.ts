/** 업로드 칸에 모이는 파일. 선택할 때마다 목록에 추가된다 */
export type PickedMeta = {
  /** 분석에 쓰는 경로. 폴더 선택이면 상대 경로, 파일 여러 개 선택이면 파일 이름(겹치면 구분용 접두사가 붙는다) */
  path: string;
  name: string;
  size: number;
  lastModified: number;
  /** 폴더 선택으로 올라와 경로를 알고 있는가 */
  hasPath: boolean;
  /** 경로가 없는 파일 중 같은 이름의 몇 번째 다른 파일인가(1부터) */
  ordinal: number;
};

const pathOf = (name: string, ordinal: number) => (ordinal === 1 ? name : `(파일 선택 ${ordinal})/${name}`);

/**
 * 새로 고른 파일을 목록에 합친다(순수 함수).
 * - 경로가 있는 파일: 같은 경로는 하나로 합친다(나중에 고른 것이 앞의 것을 대신한다).
 * - 경로가 없는 파일(파일 여러 개 선택): 이름·크기·수정 시각이 같으면 같은 파일로 보고 합치고,
 *   이름만 같고 다른 파일이면 별개로 두되 경로를 구분한다(`(파일 선택 2)/Button.tsx`).
 */
export function addPicked<T extends PickedMeta>(list: T[], incoming: T[]): T[] {
  const result = [...list];
  for (const item of incoming) {
    if (item.hasPath) {
      const i = result.findIndex((r) => r.hasPath && r.path === item.path);
      if (i >= 0) result[i] = item;
      else result.push(item);
      continue;
    }
    const sameName = result.filter((r) => !r.hasPath && r.name === item.name);
    const dup = sameName.findIndex((r) => r.size === item.size && r.lastModified === item.lastModified);
    if (dup >= 0) {
      result[result.indexOf(sameName[dup])] = { ...item, ordinal: sameName[dup].ordinal, path: sameName[dup].path };
      continue;
    }
    const used = new Set(sameName.map((r) => r.ordinal));
    let ordinal = 1;
    while (used.has(ordinal)) ordinal++;
    result.push({ ...item, ordinal, path: pathOf(item.name, ordinal) });
  }
  return result;
}

export const removePicked = <T extends PickedMeta>(list: T[], path: string): T[] => list.filter((r) => r.path !== path);

/** 목록에 보이는 이름: 경로가 없는 파일은 그 사실과, 같은 이름이 겹칠 때는 몇 번째인지 함께 보인다 */
export function pickedLabel(p: PickedMeta): string {
  if (p.hasPath) return p.path;
  return p.ordinal === 1 ? `${p.name} (경로 없음)` : `${p.name} (경로 없음, 같은 이름의 다른 파일 #${p.ordinal})`;
}

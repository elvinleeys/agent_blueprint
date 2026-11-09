import type { CodeModel } from "../code-model/facts";
import { CONFIG_FILE } from "../code-model/filter-files";
import type { SourceFile } from "../code-model/types";

/** 올린 설정 파일 중 읽은 수와, 끝까지 따라가지 못한 설정(읽지 못함·extends·지원하지 않는 패턴) 수. 서버 응답과 채점 스크립트가 함께 쓴다 */
export function configSummary(files: SourceFile[], model: CodeModel): { read: number; unsupported: number } {
  const uploaded = files.filter((f) => CONFIG_FILE.test(f.path)).length;
  const unread = new Set(model.configNotes.filter((n) => n.reason === "invalid-json").map((n) => n.path)).size;
  return { read: uploaded - unread, unsupported: model.configNotes.length };
}

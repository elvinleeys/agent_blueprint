// 클립보드 복사(브라우저 전용). 순서: 클립보드 API → 대체 방식(선택 후 복사 명령) → 실패면 직접 선택 안내

export type CopyResult = "copied" | "copied-fallback" | "failed";
export type CopyDeps = {
  writeText?: (text: string) => Promise<void>;
  legacyCopy?: (text: string) => boolean;
};

/** 보이지 않는 입력칸에 넣고 선택한 뒤 복사 명령을 쓴다. 클립보드 API가 없거나 권한이 막힌 환경용 */
function legacyCopy(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.className = "fixed top-0 left-0 size-px opacity-0";
  document.body.appendChild(area);
  try {
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

export async function copyText(text: string, deps: CopyDeps = {}): Promise<CopyResult> {
  const write = deps.writeText ?? (typeof navigator !== "undefined" && navigator.clipboard ? (t: string) => navigator.clipboard.writeText(t) : undefined);
  if (write) {
    try {
      await write(text);
      return "copied";
    } catch {
      // 권한 거부·비보안 연결 등: 대체 방식으로 넘어간다
    }
  }
  try {
    return (deps.legacyCopy ?? legacyCopy)(text) ? "copied-fallback" : "failed";
  } catch {
    return "failed";
  }
}

export const COPY_MESSAGE: Record<CopyResult, string> = {
  copied: "복사했습니다.",
  "copied-fallback": "복사했습니다.",
  failed: "복사하지 못했습니다. 위 내용을 직접 선택(Ctrl+A)해 복사해 주세요.",
};

/** .md 내려받기: Blob 주소를 만들어 링크를 눌러 저장한다 */
export function downloadMarkdown(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

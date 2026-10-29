import { handleDraftRequest } from "@/lib/ai/draft-handler";

// 앱 내부 마감(45·60초)이 플랫폼 타임아웃보다 먼저 와서 우리 형식의 504를 반환하게 한다
export const maxDuration = 70;

export const POST = handleDraftRequest;

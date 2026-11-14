import { handleImplementationCheckPost } from "@/lib/api/implementation-check-handler";

// GitHub 저장소 검사(4f): 받기 최대 20초 + 분석. 런타임은 기본값(Node.js)을 쓴다(cacheComponents와 함께 runtime 설정을 쓸 수 없다)
export const maxDuration = 60;

export const POST = handleImplementationCheckPost;

import type { DraftProgress } from "./draft-blueprint";
import type { ErrorBody, HttpError } from "./draft-http";

// 단계 알림이 없는 동안에도 연결이 유지되게 보내는 하트비트 간격(HTTP/1.1 구간·중간 장치가 유휴 연결을 닫을 수 있다)
export const HEARTBEAT_MS = 10_000;

export type DraftStage = DraftProgress | { stage: "accepted" } | { stage: "saving" };

/** NDJSON 한 줄에 담기는 알림. done·error가 마지막 줄이다 */
export type DraftStreamMessage =
  | ({ type: "stage" } & DraftStage)
  | { type: "ping" }
  | { type: "done"; blueprint: unknown; meta: Record<string, unknown> }
  | ({ type: "error"; status: HttpError["status"]; blueprint?: unknown } & ErrorBody);

export type Send = (message: DraftStreamMessage) => void;

/**
 * run이 보내는 알림을 줄 단위 JSON(NDJSON) 응답으로 내보낸다. run이 끝나면(또는 던지면) 스트림을 닫고 하트비트 타이머를 정리한다.
 * 클라이언트가 연결을 끊으면 이후 알림은 버리고 타이머만 정리한다(run은 끝까지 실행되어 저장은 마친다)
 */
export function ndjsonResponse(run: (send: Send) => Promise<void>, onUnexpected: () => HttpError): Response {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const stop = () => {
    closed = true;
    clearInterval(timer);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send: Send = (message) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
        } catch {
          stop(); // 이미 닫힌 스트림
        }
      };
      timer = setInterval(() => send({ type: "ping" }), HEARTBEAT_MS);
      run(send)
        .catch(() => {
          const e = onUnexpected();
          send({ type: "error", status: e.status, ...e.body });
        })
        .finally(() => {
          if (closed) return;
          stop();
          controller.close();
        });
    },
    cancel: stop,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // 압축·변환이 줄을 묶어 한꺼번에 보내지 않게 한다
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

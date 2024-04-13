import WorkerUrl from "./worker?worker&url";
import type { MessageFromWorker, MessageToWorker } from "./worker";
import { KoreanToken } from "oktjs";

const worker = new Worker(WorkerUrl, { type: "module" });
let id = 0;
const nextId = () => ++id % 1e9;

export function tokenize(text: string): Promise<KoreanToken[]> {
  const requestId = nextId();

  return new Promise<KoreanToken[]>((resolve, reject) => {
    const handler = (e: MessageEvent<MessageFromWorker>) => {
      const message = e.data;

      if (message.requestId !== requestId) {
        return;
      }

      worker.removeEventListener("message", handler);

      switch (message.type) {
        case "error":
          reject(message.error);
          break;
        case "tokenize":
          resolve(message.tokens);
          break;
        default:
          reject(Object.assign(new Error("unknown response"), { message }));
          break;
      }
    };

    worker.postMessage(
      {
        type: "tokenize",
        requestId,
        text,
      } satisfies MessageToWorker,
    );

    worker.addEventListener("message", handler);
  });
}

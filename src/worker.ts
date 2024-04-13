import { KoreanToken, tokenize } from "oktjs";

export type MessageToWorker = {
  type: "tokenize";
  text: string;
  requestId: number;
};

export type MessageFromWorker =
  & {
    requestId: number;
  }
  & ({
    type: "error";
    error: unknown;
  } | {
    type: "tokenize";
    tokens: KoreanToken[];
  });

self.addEventListener("message", (e) => {
  const message = e.data as MessageToWorker;

  try {
    switch (message.type) {
      case "tokenize":
        postMessage(
          {
            type: "tokenize",
            requestId: message.requestId,
            tokens: tokenize(message.text),
          } satisfies MessageFromWorker,
        );
        break;
    }
  } catch (e) {
    postMessage(
      {
        type: "error",
        requestId: message.requestId,
        error: e,
      } satisfies MessageFromWorker,
    );
  }
});

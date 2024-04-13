import OpenAI from "openai";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";
import { Db } from "../db";
import type { KoreanPos, KoreanToken } from "oktjs";
import { createLocalStorageSignal, WhenDefined } from "../helpers";
import styles from "./ChatView.module.scss";
import { AssistantStream } from "openai/lib/AssistantStream.mjs";
import { tokenize } from "../worker-helpers";

import ArrowBottomRightIcon from "@qinetik/mdi/ArrowBottomRightIcon";
import ArrowUpIcon from "@qinetik/mdi/ArrowUpIcon";
import BookSearchIcon from "@qinetik/mdi/BookSearchIcon";
import DiversifyIcon from "@qinetik/mdi/DiversifyIcon";
import FormatListBulletedTypeIcon from "@qinetik/mdi/FormatListBulletedTypeIcon";
import TranslateIcon from "@qinetik/mdi/TranslateIcon";
import { Dynamic } from "solid-js/web";

interface ChatMessage {
  request: {
    text: string;
    action: Action;
  };
  response: {
    text: string;
  };
}

const actions = {
  submit: {
    text: "Submit",
    icon: ArrowUpIcon,
    color: "#ffffff",
    prompt: (s: string) => s,
  },
  translateToKorean: {
    text: "Translate",
    icon: TranslateIcon,
    color: "#0074D9",
    prompt: (s: string) => `Translate to Korean: ${s}`,
  },
  translateFromKorean: {
    text: "Translate",
    icon: TranslateIcon,
    color: "#0074D9",
    prompt: (s: string) => `Translate to English: ${s}`,
  },
  define: {
    text: "Define",
    icon: BookSearchIcon,
    color: "#FF4136",
    prompt: (s: string) => `Define: ${s}`,
  },
  breakDown: {
    text: "Break down",
    icon: DiversifyIcon,
    color: "#FF851B",
    prompt: (s: string) => `Break down: ${s}`,
  },
  provideExamples: {
    text: "Examples",
    icon: FormatListBulletedTypeIcon,
    color: "#2ECC40",
    prompt: (s: string) => `Provide examples using: ${s}`,
  },
};

type Action = keyof typeof actions;

export function ChatView(props: Readonly<{ db: Db; openai: OpenAI }>) {
  const [assistant] = createResource(() =>
    props.openai.beta.assistants.create({
      name: "Vocabulary helper",
      instructions:
        "You help English speakers learn Korean. Do not use romanization.",
      model: "gpt-3.5-turbo",
    })
  );

  const [selection, setSelection] = createSignal(document.getSelection());
  const selectionChangeHandler = () => setSelection(document.getSelection());

  document.addEventListener("selectionchange", selectionChangeHandler);
  onCleanup(() =>
    document.removeEventListener("selectionchange", selectionChangeHandler)
  );

  const [threadId, setThreadId] = createLocalStorageSignal(
    "chat-thread-id",
    () => "",
  );
  const [thread] = createResource(
    threadId,
    (threadId) =>
      threadId.length > 0 ? undefined : props.openai.beta.threads.create(),
  );

  createEffect(() => {
    if (thread() !== undefined) {
      setThreadId(thread()!.id);
    }
  });

  const [activeRunPromise, setActiveRunPromise] = createSignal<
    Promise<AssistantStream>
  >();
  const [activeRun] = createResource(activeRunPromise, (r) => r);

  const [messages, setMessages] = createLocalStorageSignal<
    readonly ChatMessage[]
  >("chat-messages", () => []);
  const [pendingMessage, setPendingMessage] = createSignal<
    ChatMessage | undefined
  >(undefined);

  const [buttons, setButtons] = createSignal<Action[]>([]);

  const [textInput, setTextInput] = createLocalStorageSignal(
    "chat-input",
    () => "",
  );
  const canSubmit = createMemo(() =>
    assistant() !== undefined && threadId() !== undefined &&
    activeRun() === undefined &&
    textInput().trim().length > 0
  );

  createEffect(() => {
    const text = textInput();

    if (/^[\s\p{Script=Hangul}]+$/u.test(text)) {
      setButtons([
        "translateFromKorean",
        "define",
        "breakDown",
        "provideExamples",
      ]);
    } else if (/^\P{Script=Hangul}+$/u.test(text)) {
      setButtons(["translateToKorean"]);
    } else {
      setButtons([]);
    }
  });

  const onSubmit = (action: Action, text: string = textInput()) => {
    const prompt = actions[action].prompt(text);

    setActiveRunPromise(async function () {
      await props.openai.beta.threads.messages.create(
        threadId()!,
        {
          role: "user",
          content: prompt,
        },
      );

      setTextInput("");
      setPendingMessage(
        {
          request: {
            text,
            action,
          },
          response: {
            text: "",
          },
        } satisfies ChatMessage as ChatMessage,
      );

      return props.openai.beta.threads.runs.createAndStream(threadId()!, {
        assistant_id: assistant()!.id,
      }).on(
        "textDelta",
        (textDelta) => {
          setPendingMessage((message) => ({
            request: message!.request,
            response: {
              text: message!.response.text + textDelta.value!,
            },
          }));
        },
      ).on("textDone", () => {
        setMessages([...messages(), pendingMessage()!]);
        setPendingMessage();
      });
    }());
  };

  return (
    <div class={styles.chatView}>
      <div
        class={styles.chatMessages}
        ref={(e) => requestAnimationFrame(() => e.scrollTop = e.scrollHeight)}
      >
        <For each={messages()}>
          {(message) => (
            <ChatMessage
              message={message}
              onAction={onSubmit}
            />
          )}
        </For>

        <WhenDefined value={pendingMessage()}>
          {(pendingMessage) => (
            <ChatMessage
              message={pendingMessage}
              isPending
              onAction={() => {}}
            />
          )}
        </WhenDefined>
      </div>

      <div class={styles.chatInput}>
        <textarea
          autofocus
          value={textInput()}
          onInput={(e) => setTextInput(e.target.value)}
          style={{ overflow: "auto" }}
        />

        <div class={styles.buttons}>
          <div class={styles.dynamic}>
            <For each={buttons()}>
              {(action) => (
                <Button action={action} text={textInput()} onClick={onSubmit} />
              )}
            </For>
          </div>

          <div class="static">
            <Button
              action="submit"
              disabled={!canSubmit()}
              text={textInput()}
              onClick={onSubmit}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatMessage(
  props: Readonly<
    {
      isPending?: boolean;
      message: ChatMessage;
      onAction(action: Action, text: string): void;
    }
  >,
) {
  const request = createMemo(() => props.message.request);
  const action = () => actions[props.message.request.action];
  const response = createMemo(() => props.message.response);
  const [selectedToken, setSelectedToken] = createSignal<KoreanToken>();

  return (
    <div
      class={styles.chatMessage}
      ref={(e) =>
        requestAnimationFrame(() => {
          const chatMessages = e.closest(`.${styles.chatMessages}`);

          if (chatMessages !== null) {
            maybeScrollIntoView(chatMessages, e);
          }
        })}
    >
      <div class={styles.request} style={{ color: action().color }}>
        <span>
          <Dynamic component={action().icon} /> {request().text}
        </span>
      </div>

      <div
        class={styles.response}
        classList={{ [styles.pending]: props.isPending }}
      >
        <div class={styles.prefix}>
          <span>
            <ArrowBottomRightIcon />
          </span>
        </div>

        <div class={styles.content}>
          <Show
            when={!props.isPending}
            fallback={<span>{response().text}</span>}
          >
            <SelectableTokens
              text={response().text}
              selectedToken={selectedToken()}
              onTokenSelected={setSelectedToken}
            />
          </Show>
        </div>
      </div>

      <WhenDefined value={selectedToken()}>
        {(selectedToken) => {
          const text = selectedToken.stem ?? selectedToken.text;

          return (
            <div
              class={styles.tokenViewer}
              ref={(e) =>
                requestAnimationFrame(() =>
                  maybeScrollIntoView(e.closest(`.${styles.chatMessages}`)!, e)
                )}
            >
              {text}

              <div class={styles.buttons}>
                {(["translateFromKorean", "define"] satisfies Action[]).map((
                  action,
                ) => (
                  <Button
                    action={action}
                    text={text}
                    onClick={(action) => props.onAction(action, text)}
                  />
                ))}
              </div>
            </div>
          );
        }}
      </WhenDefined>
    </div>
  );
}

function SelectableTokens(
  props: Readonly<
    {
      text: string;
      selectedToken: KoreanToken | undefined;
      onTokenSelected(token: KoreanToken | undefined): void;
    }
  >,
) {
  const [tokens] = createResource(() => props.text, tokenize);

  return (
    <div class={styles.tokens}>
      <For each={tokens()} fallback={<span>{props.text}</span>}>
        {(token) => {
          const selected = createMemo(() =>
            props.selectedToken !== undefined &&
            (token.stem !== undefined
              ? (token.stem === props.selectedToken.stem)
              : (token.text === props.selectedToken.text))
          );

          return (
            <span
              classList={{
                [styles.selected]: selected(),
              }}
              onClick={canSelectPos(token.pos)
                ? () => props.onTokenSelected(selected() ? undefined : token)
                : undefined}
            >
              {token.text}
            </span>
          );
        }}
      </For>
    </div>
  );
}

function Button(
  props: Readonly<
    {
      action: Action;
      disabled?: boolean;
      text: string;
      onClick(action: Action): void;
    }
  >,
) {
  const data = () => actions[props.action];

  return (
    <button
      disabled={props.disabled}
      onClick={() => props.onClick(props.action)}
      style={{ color: data().color, "--bg-color": `${data().color}24` }}
    >
      <Dynamic component={data().icon} size={18} />
      {data().text}
    </button>
  );
}

/**
 * Scrolls `scrollableContainer` so that `element` is in view if `element` is not completely
 * visible **and** below the last pixel of the scrollable container visible vertically.
 *
 * That is, it will scroll only if the `element` is below the "bottom" of the screen.
 */
function maybeScrollIntoView(
  scrollableContainer: Element,
  element: HTMLElement,
) {
  const lastVisiblePxY = scrollableContainer.scrollTop +
    scrollableContainer.clientHeight;
  const desiredVisiblePxY = element.offsetTop + element.clientHeight;

  if (lastVisiblePxY < desiredVisiblePxY) {
    element.scrollIntoView({ behavior: "smooth", block: "end" });
  }
}

function canSelectPos(pos: KoreanPos) {
  switch (pos) {
    case "Noun":
    case "Verb":
    case "Adjective":
    case "Adverb":
    case "Determiner":
    case "Exclamation":
    case "Josa":
    case "Eomi":
    case "PreEomi":
    case "Conjunction":
    case "Modifier":
    case "VerbPrefix":
    case "Suffix":
    case "Korean":
    case "KoreanParticle":
      return true;

    case "Unknown":
    case "Foreign":
    case "Number":
    case "Alpha":
    case "Punctuation":
    case "Hashtag":
    case "ScreenName":
    case "Email":
    case "URL":
    case "CashTag":
    case "Space":
    case "Others":
      return false;
  }
}

import { OpenAI } from "openai";
import { createResource, createSignal, Show } from "solid-js";

import styles from "./App.module.scss";
import { StudyView } from "./StudyView";
import { VocabularyManager } from "./VocabularyManager";
import { Db } from "../db";
import { createLocalStorageSignal } from "../helpers";
import { ChatView } from "./ChatView";

const tabs = {
  study: {
    title: "Study",
    component: StudyView,
  },
  vocab: {
    title: "Vocabulary",
    component: VocabularyManager,
  },
};

export function App() {
  const [db] = createResource(Db.load);
  const [openai, setOpenAi] = createSignal<OpenAI | undefined>(undefined);

  return (
    <main>
      <Show
        when={db() !== undefined && openai() !== undefined}
        fallback={<ApiKeyForm onOpenAi={setOpenAi} />}
      >
        <ChatView db={db()!} openai={openai()!} />
      </Show>
    </main>
  );
}

function ApiKeyForm(props: { onOpenAi: (openai: OpenAI | undefined) => void }) {
  const [apiKey, setApiKey] = createLocalStorageSignal("api-key", () => "");
  const [pendingApiKey, setPendingApiKey] = createSignal(apiKey());
  const [inputType, setInputType] = createSignal<"password" | "text">(
    "password",
  );

  const enabled = () =>
    /^[a-z]+-\w+$/.test(pendingApiKey()) && pendingApiKey() !== apiKey();
  const updateOpenAi = (apiKey: string) =>
    props.onOpenAi(
      apiKey === "" ? undefined : new OpenAI({
        apiKey,
        dangerouslyAllowBrowser: true,
        maxRetries: 1,
        timeout: 10_000,
      }),
    );

  const onSubmit = (e: Event) => {
    e.preventDefault();

    if (!enabled()) {
      return false;
    }

    setApiKey(pendingApiKey());
    updateOpenAi(pendingApiKey());

    return false;
  };

  updateOpenAi(apiKey());

  return (
    <form title="Open API Key" class={styles.apiKey} onSubmit={onSubmit}>
      <input
        placeholder="OpenAI API Key"
        required
        value={pendingApiKey()}
        type={inputType()}
        onInput={(e) => setPendingApiKey(e.currentTarget.value)}
        onFocusIn={() => setInputType("text")}
        onFocusOut={() => setInputType("password")}
      />

      <button
        type="submit"
        disabled={!enabled()}
      >
        Update
      </button>
    </form>
  );
}

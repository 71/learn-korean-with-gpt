import { OpenAI } from "openai";
import styles from "./VocabularyManager.module.scss";
import { Db } from "../db";
import { createMemo, createResource, createSignal, For, Show } from "solid-js";

async function parseVocabularyRequest(openai: OpenAI, db: Db, text: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo-1106",
    messages: [
      {
        role: "system",
        content: `
          You help the user study ${db.learnLanguage}.
          The user speaks ${db.userLanguage}.\n
          If the user provides what appears to be structured data, parse it as a list of key-value pairs from
          vocabulary word to its definition.\n
          Otherwise, consider the input to be a freeform text and parse it as a request to provide one
          or more words in ${db.learnLanguage} as well as short definitions.\n
        `.replace(/ +/g, " "),
      },
      {
        role: "user",
        content: text,
      },
    ],
    response_format: { type: "json_object" },
  });
}

export function VocabularyManager(props: Readonly<{ db: Db; openai: OpenAI }>) {
  const [addInput, setAddInput] = createSignal("");
  const [gptSubmittedInput, setGptSubmittedInput] = createSignal("");
  const [gptSuggestedWords] = createResource(
    gptSubmittedInput,
    async (input) =>
      input !== ""
        ? await parseVocabularyRequest(props.openai, props.db, addInput())
        : undefined,
  );
  const [pendingWordsToAdd, setPendingWordsToAdd] = createSignal<
    [string, string][]
  >([]);

  const [dbChange, notifyDbChange] = createSignal(undefined, { equals: false });

  const onAdd = (e: Event) => {
    e.preventDefault();

    if (pendingWordsToAdd().length === 0) {
      return false;
    }

    for (const [text, notes] of pendingWordsToAdd()) {
      props.db.addWord({ text, notes });
    }

    props.db.save();
    notifyDbChange();

    return false;
  };

  const recentlyReviewedWords = createMemo(() => {
    dbChange();

    return props.db.recentlyReviewedWords(100);
  });

  return (
    <div class={styles.vocabularyManager}>
      <form onSubmit={onAdd}>
        <div class={styles.add}>
          <h2>Add</h2>
          <textarea onInput={(e) => setAddInput(e.currentTarget.value)} />

          <button disabled={/^\s*$/.test(addInput())}>Convert</button>
        </div>

        <Show when={pendingWordsToAdd().length > 0}>
          <h3>Words</h3>

          <ul>
            <For each={pendingWordsToAdd()}>
              {([word, translation]) => (
                <li>
                  <b>{word}</b>: {translation}
                </li>
              )}
            </For>
          </ul>

          <button type="submit">Add</button>
        </Show>
      </form>

      <div class={styles.vocabulary}>
        <h2>Vocabulary</h2>

        <ul>
          <For each={recentlyReviewedWords()} fallback={<p>No words yet</p>}>
            {(word) => (
              <li>
                <b>{word.text}</b>: {word.notes ?? <em>no notes</em>}
              </li>
            )}
          </For>
        </ul>
      </div>
    </div>
  );
}

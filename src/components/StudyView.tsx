import { OpenAI } from "openai";
import styles from "./StudyView.module.scss";
import { Db } from "../db";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Match,
  Switch,
} from "solid-js";
import { tokenize } from "oktjs";

type StudyResponse = {
  sentence: string;
  tr: string;
  blank: string;
  expr_def: string;
  expr_tr: string;
};

async function makeSentences(db: Db, openai: OpenAI) {
  const wordsToLearn = Object.entries({
    // "자제하다": "to refrain, to control oneself",
    "어감": "nuance",
    "원격으로": "remotely",
    // "다양하다": "to be diverse, to be varied",
  });

  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [
      {
        role: "system",
        content: `You help the user study ${db.learnLanguage}.
            The user speaks ${db.userLanguage}.
            Provide a JSON array **sentences** of ${wordsToLearn.length} sentences which use the following words: **${
          wordsToLearn.map(([word, _]) => word).join(", ")
        }**.
            For each sentence, provide as a JSON object:\n
            - **sentence**: the sentence in ${db.learnLanguage}.\n
            - **tr**: a concise translation of the sentence in ${db.userLanguage}.\n
            - **blank**: the expression that should be guessed by the user.\n
            - **expr_def**: a concise and simple definition of the expression ${db.learnLanguage}.\n
            - **expr_tr**: a concise translation of the expression in ${db.userLanguage}.\n
            `.replace(/ +/g, " "),
      },
    ],
    response_format: { type: "json_object" },
  });

  const data = JSON.parse(response.choices[0].message.content ?? "{}")
    .sentences as StudyResponse[];

  console.debug("study completion response received", { data, response });

  return data;
}

async function gradeResponse(
  db: Db,
  openai: OpenAI,
  question: StudyResponse,
  userResponse: string,
): Promise<string | true> {
  if (userResponse.replace(/ /g, "") === question.blank.replace(/ /g, "")) {
    return true;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo-1106",
    messages: [
      {
        role: "system",
        content: `You help the user study ${db.learnLanguage}.
            The user speaks ${db.userLanguage}.\n
            The user was supposed to guess the word "${question.blank}" in "${question.sentence}".\n
            The user responded with "${userResponse.replace(/"/g, "'")}".\n
            Concisely explain the mistake the user made, if any. Speak directly to the user.\n
            `.replace(/ +/g, " "),
      },
    ],
  });

  console.debug("study grade response received", { response });

  return response.choices[0].message.content ?? "Wrong.";
}

export function StudyView(props: Readonly<{ db: Db; openai: OpenAI }>) {
  const [sentences] = createResource(
    () => makeSentences(props.db, props.openai),
  );
  const [currentSentenceIndex, setCurrentSentenceIndex] = createSignal(0);

  const advance = () => {
    setCurrentSentenceIndex(currentSentenceIndex() + 1);
  };

  createEffect(() => {
    sentences();
    setCurrentSentenceIndex(0);
  });

  return (
    <div class={styles.studyView}>
      <Switch fallback={<p>Loading...</p>}>
        <Match when={sentences.error}>Error: {sentences.error}</Match>
        <Match when={currentSentenceIndex() < (sentences()?.length ?? 0)}>
          <SentenceStudyView
            db={props.db}
            openai={props.openai}
            sentence={sentences()![currentSentenceIndex()]}
            onAdvance={advance}
          />
        </Match>
        <Match when={!sentences.loading}>
          <p>Done!</p>
        </Match>
      </Switch>
    </div>
  );
}

function SentenceStudyView(
  props: {
    db: Db;
    openai: OpenAI;
    sentence: StudyResponse;
    onAdvance: () => void;
  },
) {
  const [showAnswer, setShowAnswer] = createSignal(false);
  const [userResponse, setUserResponse] = createSignal("");
  const [submittedUserResponse, setSubmittedUserResponse] = createSignal<
    string
  >("");

  createEffect(() => {
    props.sentence;

    setShowAnswer(false);
    setUserResponse("");
    setSubmittedUserResponse("");
  });

  const [grading] = createResource(
    submittedUserResponse,
    async (userResponse) =>
      userResponse !== ""
        ? await gradeResponse(
          props.db,
          props.openai,
          props.sentence,
          userResponse,
        )
        : undefined,
  );

  const tokens = createMemo(() => {
    const blankPlaceholder = "#__#";
    const { blank, sentence } = props.sentence;
    const tokens: { text: string; stem?: string; isBlank: boolean }[] = [];

    for (
      const token of tokenize(sentence.replaceAll(blank, blankPlaceholder))
    ) {
      if (token.text === "#__#") {
        tokens.push({ text: blank, isBlank: true });
      } else {
        tokens.push({ text: token.text, stem: token.stem, isBlank: false });
      }
    }

    return tokens;
  });

  const onSubmit = (e: Event) => {
    e.preventDefault();
    if (!/^\s*$/.test(userResponse())) {
      setSubmittedUserResponse(userResponse());
    }
    setShowAnswer(true);
    return false;
  };

  return (
    <>
      <form style={{ display: "inline-block" }} onSubmit={onSubmit}>
        <For each={tokens()}>
          {(token) =>
            token.isBlank
              ? (
                <input
                  placeholder={showAnswer()
                    ? props.sentence.blank
                    : `${props.db.learnLanguage} sentence`}
                  value={userResponse()}
                  onInput={(e) => setUserResponse(e.currentTarget.value)}
                  disabled={grading.loading || grading() === true}
                />
              )
              : <span title={token.stem}>{token.text}</span>}
        </For>

        <button type="submit">
          {userResponse() === "" ? "Learn" : "Check"}
        </button>
      </form>

      <ul>
        <li>
          <b>Translation</b>: {props.sentence.tr}
        </li>
        <li>
          <b>Word definition:</b>{" "}
          <span>
            <For each={tokenize(props.sentence.expr_def)}>
              {(token) => <span title={token.stem}>{token.text}</span>}
            </For>
          </span>
        </li>
        <li>
          <b>Word translation:</b> {props.sentence.expr_tr}
        </li>
      </ul>

      <Switch>
        <Match when={grading.loading}>Grading...</Match>
        <Match when={grading.error}>Could not grade: {grading.error}</Match>
        <Match when={grading() === true}>
          Correct! <button onClick={() => props.onAdvance()}>Next</button>
        </Match>
        <Match when={grading() !== undefined}>
          {grading()}
        </Match>
      </Switch>
    </>
  );
}

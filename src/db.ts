import { Card, FSRS, Rating } from "fsrs.js";
import { Heap } from "heap-js";

const serializationVersion = 1;

type SerializedCard = [
  version: typeof serializationVersion,

  due: string,
  stability: number,
  difficulty: number,
  elapsed_days: number,
  scheduled_days: number,
  reps: number,
  lapses: number,
  state: number,
  last_review: string,
];

function serializeCard(card: Card): SerializedCard {
  return [
    serializationVersion,

    card.due.toISOString(),
    card.stability,
    card.difficulty,
    card.elapsed_days,
    card.scheduled_days,
    card.reps,
    card.lapses,
    card.state,
    card.last_review.toISOString(),
  ];
}

function deserializeCardTo(
  card: Card,
  serializedCard: SerializedCard,
): Card {
  if (serializedCard[0] !== serializationVersion) {
    throw new Error(`unknown card serialization version: ${serializedCard[0]}`);
  }

  card.due = new Date(serializedCard[1]);
  card.stability = serializedCard[2];
  card.difficulty = serializedCard[3];
  card.elapsed_days = serializedCard[4];
  card.scheduled_days = serializedCard[5];
  card.reps = serializedCard[6];
  card.lapses = serializedCard[7];
  card.state = serializedCard[8];
  card.last_review = new Date(serializedCard[9]);

  return card as Card;
}

function deserializeCard(serializedCard: SerializedCard): Card {
  return deserializeCardTo(new Card(), serializedCard);
}

export interface Vocab {
  text: string;
  notes: string;
  card: Card;
}

interface SerializedVocab {
  text: string;
  notes: string;
  card: SerializedCard;
}

function serializeVocab(vocab: Vocab): SerializedVocab {
  return {
    text: vocab.text,
    notes: vocab.notes,
    card: serializeCard(vocab.card),
  };
}

function deserializeVocab(serializedVocab: SerializedVocab): Vocab {
  return {
    text: serializedVocab.text,
    notes: serializedVocab.notes,
    card: deserializeCard(serializedVocab.card),
  };
}

export class Db {
  private readonly _fsrs = new FSRS();

  private readonly _soonDueWords = new Heap<Vocab>((
    a,
    b,
  ) => a.card.due.valueOf() - b.card.due.valueOf());
  private readonly _recentlyReviewedWords = new Heap<Vocab>((a, b) =>
    a.card.last_review.valueOf() - b.card.last_review.valueOf()
  );

  public readonly userLanguage = "English";
  public readonly learnLanguage = "Korean";

  private constructor(
    private readonly _vocab: Record<string, Vocab>,
  ) {
    this._soonDueWords.addAll(Object.values(this._vocab));
    this._recentlyReviewedWords.addAll(Object.values(this._vocab));
  }

  public nextVocabToLearn(limit: number): readonly Vocab[] {
    return this._soonDueWords.top(limit);
  }

  public recentlyReviewedWords(limit: number): readonly Vocab[] {
    return this._recentlyReviewedWords.top(limit);
  }

  public addWord(props: { text: string; notes: string }): void {
    if (this._vocab[props.text] !== undefined) {
      throw new Error(`word already exists: ${props.text}`);
    }

    const vocab = this._vocab[props.text] = {
      ...props,
      card: new Card(),
    };

    this._soonDueWords.push(vocab);
    this._recentlyReviewedWords.push(vocab);
  }

  public async updateProgress(vocab: Vocab, rating: Rating): Promise<void> {
    vocab.card = this._fsrs.repeat(vocab.card, new Date())[rating]
      .card;

    this._soonDueWords.remove(vocab);
    this._soonDueWords.push(vocab);
    this._recentlyReviewedWords.remove(vocab);
    this._recentlyReviewedWords.push(vocab);

    await this.save();
  }

  public vocabByText(text: string): Vocab | undefined {
    return this._vocab[text];
  }

  public static async load(): Promise<Db> {
    const serializedVocab: Record<string, SerializedVocab> = JSON.parse(
      localStorage.getItem("vocab") ?? "{}",
    );
    const vocab: Record<string, Vocab> = {};

    for (const key in serializedVocab) {
      vocab[key] = deserializeVocab(serializedVocab[key]);
    }

    return new Db(vocab);
  }

  public async save(): Promise<void> {
    const serializedVocab: Record<string, SerializedVocab> = {};

    for (const key in this._vocab) {
      serializedVocab[key] = serializeVocab(this._vocab[key]);
    }

    localStorage.setItem("vocab", JSON.stringify(serializedVocab));
  }
}

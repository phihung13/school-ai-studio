import { fsrs, createEmptyCard, type Card as FsrsCard, type Grade } from "ts-fsrs";
import { CardState, DB, nowIso } from "./store";

const scheduler = fsrs();

export function cardStateId(userId: string, atomId: string, idx: number): string { return `${userId}::${atomId}::${idx}`; }

export function findCardState(db: DB, userId: string, atomId: string, idx: number): CardState | undefined {
  return db.cardStates.find((c) => c.id === cardStateId(userId, atomId, idx));
}

function toFsrsCard(cs: CardState): FsrsCard {
  return {
    due: new Date(cs.due), stability: cs.stability, difficulty: cs.difficulty,
    elapsed_days: 0, scheduled_days: cs.scheduled_days, learning_steps: cs.learning_steps,
    reps: cs.reps, lapses: cs.lapses, state: cs.state, last_review: cs.last_review ? new Date(cs.last_review) : undefined,
  };
}

// due mặc định = "hôm nay" cho thẻ mới → luôn xuất hiện trong hàng đợi ôn tập lần đầu
export function dueOf(db: DB, userId: string, atomId: string, idx: number): string {
  return findCardState(db, userId, atomId, idx)?.due || nowIso();
}

export function gradeCard(db: DB, userId: string, atomId: string, idx: number, grade: Grade): CardState {
  let cs = findCardState(db, userId, atomId, idx);
  const now = new Date();
  const input = cs ? toFsrsCard(cs) : createEmptyCard(now);
  const { card } = scheduler.next(input, now, grade);
  if (!cs) { cs = { id: cardStateId(userId, atomId, idx), userId, atomId, idx } as CardState; db.cardStates.push(cs); }
  cs.due = card.due.toISOString(); cs.stability = card.stability; cs.difficulty = card.difficulty;
  cs.scheduled_days = card.scheduled_days; cs.learning_steps = card.learning_steps;
  cs.reps = card.reps; cs.lapses = card.lapses; cs.state = card.state;
  cs.last_review = card.last_review ? card.last_review.toISOString() : nowIso();
  return cs;
}

// How a giveaway determines its winners.
//
//   RANDOM      — a draw at the end. Every entry goes into one pot, bonus
//                 entries raise the chance, the draw is Fisher-Yates.
//   FIRST_CLICK — whoever clicks first wins. The first `winnersCount` valid
//                 entries are the winners, and the giveaway ends right there.
//
// This sits next to `prizeMode`, not inside it: one says WHO wins, the other
// WHAT the winners get. The two combine freely — INDIVIDUAL plus FIRST_CLICK
// reads as "the fastest gets prize 1, the second fastest prize 2".
//
// Two things follow from FIRST_CLICK that are not obvious:
//
//  1. **Bonus entries do nothing.** They raise a weight, and a weight only
//     exists in a draw. The embed therefore hides them in this mode instead of
//     promising an advantage that is never applied.
//  2. **An entry is final.** A second click no longer withdraws it — somebody
//     who has already won the prize must not be able to hand it back with a
//     stray click.
//
// `endAt` stays set in FIRST_CLICK too, where it is the deadline: if nobody
// clicks (or fewer than `winnersCount` do), the scheduler ends the giveaway as
// usual and whoever did click wins.

export const WINNER_MODES = ['RANDOM', 'FIRST_CLICK'];

/** Unknown or empty values fall back to RANDOM (the previous behaviour). */
export function normalizeWinnerMode(mode) {
  const value = String(mode ?? '').trim().toUpperCase();
  return WINNER_MODES.includes(value) ? value : 'RANDOM';
}

/** True when this giveaway (or template) runs in first-click mode. */
export function isFirstClick(row) {
  return normalizeWinnerMode(row?.winnerMode) === 'FIRST_CLICK';
}

export default normalizeWinnerMode;

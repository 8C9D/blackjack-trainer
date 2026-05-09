// S17 Hi-Lo deviations (dealer stands on soft 17).
//
// Source: Blackjack Apprenticeship "Hi-Lo Deviations Chart — S17" PDF.
//   https://www.blackjackapprenticeship.com/wp-content/uploads/2019/07/BJA_S17.pdf
//
// Every rule below is transcribed from that PDF, including indices, threshold
// directions, and chart sections. Each rule's `source` field cites the chart
// section the cell came from. Notes:
//
//   - The BJA chart legend says "0+" = "any positive running count" and
//     "0-" = "any negative running count". We treat them inclusively here
//     (TC >= 0 and TC <= 0 respectively) to align with the canonical
//     Illustrious 18 framing (e.g., 16 v 10 standing at TC = 0). For integer
//     true counts this only affects the boundary at TC = 0.
//   - `basicAction` is the chart's pre-deviation play and is informational
//     only — the engine recomputes the live basic action from
//     BasicStrategyEngineService so EngineOptions are honored. For soft
//     "Ds" cells we use 'D' here because our Action type collapses Ds to D
//     for two-card initial hands.
//   - Insurance is rule-set-independent but is duplicated into each chart so
//     the H17 and S17 lookups are self-contained.
//   - The BJA S17 chart deliberately omits some entries from Schlesinger's
//     wider Illustrious 18 / Fab 4 (e.g., 12 v 5 hit @ -2, 12 v 6 hit @ -1,
//     13 v 3 hit @ -2, 14 v 10 surrender @ +3). They are not encoded here
//     because the BJA PDF is the source of truth for this trainer.
//   - The BJA S17 LS chart shows 16 v 9, 16 v 10, and 16 v A as basic
//     "SUR" cells (no index). All three are encoded as SUR_H in
//     s17-basic-strategy.ts, so no deviation entry is needed for them.
//   - A few SUR deviation rules below (e.g., 16 v 9 SUR @ -1-, 15 v 10
//     SUR @ 0-) are encoded for chart faithfulness even though our basic
//     strategy already returns SUR (via SUR_H) for the same hand when LS is
//     enabled. In that case the engine's basic-strategy decision already
//     covers the play; the deviation entry is a no-op but documents the
//     chart cell.

import type { DeviationRule } from '../core/models/deviation.model';

const SRC = 'BJA S17 Deviations chart';

export const S17_DEVIATIONS: readonly DeviationRule[] = [
  // ─── Insurance ─────────────────────────────────────────────────────────
  {
    ruleSet: 'S17',
    category: 'insurance',
    playerHand: 'insurance',
    playerHandLabel: 'Insurance',
    dealerUpcard: 'A',
    index: 3,
    direction: 'at-or-above',
    basicAction: 'H', // placeholder — basic strategy declines insurance
    deviationAction: 'INS',
    source: `${SRC} — Insurance or Even Money: take at 3+`,
  },

  // ─── Pair Splitting deviations ─────────────────────────────────────────
  {
    ruleSet: 'S17',
    category: 'pair',
    playerHand: '10',
    playerHandLabel: 'Pair of 10s',
    dealerUpcard: '4',
    index: 6,
    direction: 'at-or-above',
    basicAction: 'S',
    deviationAction: 'P',
    source: `${SRC} — T,T v 4 split @ +6`,
  },
  {
    ruleSet: 'S17',
    category: 'pair',
    playerHand: '10',
    playerHandLabel: 'Pair of 10s',
    dealerUpcard: '5',
    index: 5,
    direction: 'at-or-above',
    basicAction: 'S',
    deviationAction: 'P',
    source: `${SRC} — T,T v 5 split @ +5`,
  },
  {
    ruleSet: 'S17',
    category: 'pair',
    playerHand: '10',
    playerHandLabel: 'Pair of 10s',
    dealerUpcard: '6',
    index: 4,
    direction: 'at-or-above',
    basicAction: 'S',
    deviationAction: 'P',
    source: `${SRC} — T,T v 6 split @ +4`,
  },

  // ─── Soft Total deviations ─────────────────────────────────────────────
  // A,8 v 4/5/6: chart shows "Ds" cells (double if allowed, else stand).
  // We encode the deviationAction as 'D' because the Action type collapses
  // Ds → D for two-card initial hands (per strategy.model.ts).
  {
    ruleSet: 'S17',
    category: 'soft',
    playerHand: '19',
    playerHandLabel: 'Soft 19 (A,8)',
    dealerUpcard: '4',
    index: 3,
    direction: 'at-or-above',
    basicAction: 'S',
    deviationAction: 'D',
    source: `${SRC} — A,8 v 4 double @ +3 (chart cell "3+", Ds)`,
  },
  {
    ruleSet: 'S17',
    category: 'soft',
    playerHand: '19',
    playerHandLabel: 'Soft 19 (A,8)',
    dealerUpcard: '5',
    index: 1,
    direction: 'at-or-above',
    basicAction: 'S',
    deviationAction: 'D',
    source: `${SRC} — A,8 v 5 double @ +1 (chart cell "1+", Ds)`,
  },
  {
    ruleSet: 'S17',
    category: 'soft',
    playerHand: '19',
    playerHandLabel: 'Soft 19 (A,8)',
    dealerUpcard: '6',
    index: 1,
    direction: 'at-or-above',
    basicAction: 'S',
    deviationAction: 'D',
    source: `${SRC} — A,8 v 6 double @ +1 (chart cell "1+", Ds)`,
  },
  {
    ruleSet: 'S17',
    category: 'soft',
    playerHand: '17',
    playerHandLabel: 'Soft 17 (A,6)',
    dealerUpcard: '2',
    index: 1,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'D',
    source: `${SRC} — A,6 v 2 double @ +1`,
  },

  // ─── Hard Total deviations (Illustrious 18 + BJA extras) ───────────────
  {
    ruleSet: 'S17',
    category: 'hard',
    playerHand: '16',
    playerHandLabel: 'Hard 16',
    dealerUpcard: '9',
    index: 4,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'S',
    source: `${SRC} — 16 v 9 stand @ +4`,
  },
  {
    ruleSet: 'S17',
    category: 'hard',
    playerHand: '16',
    playerHandLabel: 'Hard 16',
    dealerUpcard: '10',
    index: 0,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'S',
    source: `${SRC} — 16 v 10 stand @ 0+`,
  },
  {
    ruleSet: 'S17',
    category: 'hard',
    playerHand: '15',
    playerHandLabel: 'Hard 15',
    dealerUpcard: '10',
    index: 4,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'S',
    source: `${SRC} — 15 v 10 stand @ +4`,
  },
  {
    ruleSet: 'S17',
    category: 'hard',
    playerHand: '13',
    playerHandLabel: 'Hard 13',
    dealerUpcard: '2',
    index: -1,
    direction: 'at-or-below',
    basicAction: 'S',
    deviationAction: 'H',
    source: `${SRC} — 13 v 2 hit @ -1 and below`,
  },
  {
    ruleSet: 'S17',
    category: 'hard',
    playerHand: '12',
    playerHandLabel: 'Hard 12',
    dealerUpcard: '2',
    index: 3,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'S',
    source: `${SRC} — 12 v 2 stand @ +3`,
  },
  {
    ruleSet: 'S17',
    category: 'hard',
    playerHand: '12',
    playerHandLabel: 'Hard 12',
    dealerUpcard: '3',
    index: 2,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'S',
    source: `${SRC} — 12 v 3 stand @ +2`,
  },
  {
    ruleSet: 'S17',
    category: 'hard',
    playerHand: '12',
    playerHandLabel: 'Hard 12',
    dealerUpcard: '4',
    index: 0,
    direction: 'at-or-below',
    basicAction: 'S',
    deviationAction: 'H',
    source: `${SRC} — 12 v 4 hit @ 0-`,
  },
  // 11 v A: S17 basic strategy hits — deviate to double at TC >= +1.
  // No equivalent in H17 because H17 basic strategy already doubles 11 v A.
  {
    ruleSet: 'S17',
    category: 'hard',
    playerHand: '11',
    playerHandLabel: 'Hard 11',
    dealerUpcard: 'A',
    index: 1,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'D',
    source: `${SRC} — 11 v A double @ +1 (S17 only)`,
  },
  {
    ruleSet: 'S17',
    category: 'hard',
    playerHand: '10',
    playerHandLabel: 'Hard 10',
    dealerUpcard: '10',
    index: 4,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'D',
    source: `${SRC} — 10 v 10 double @ +4`,
  },
  {
    ruleSet: 'S17',
    category: 'hard',
    playerHand: '10',
    playerHandLabel: 'Hard 10',
    dealerUpcard: 'A',
    index: 4,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'D',
    source: `${SRC} — 10 v A double @ +4 (H17 chart lists +3)`,
  },
  {
    ruleSet: 'S17',
    category: 'hard',
    playerHand: '9',
    playerHandLabel: 'Hard 9',
    dealerUpcard: '2',
    index: 1,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'D',
    source: `${SRC} — 9 v 2 double @ +1`,
  },
  {
    ruleSet: 'S17',
    category: 'hard',
    playerHand: '9',
    playerHandLabel: 'Hard 9',
    dealerUpcard: '7',
    index: 3,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'D',
    source: `${SRC} — 9 v 7 double @ +3`,
  },
  {
    ruleSet: 'S17',
    category: 'hard',
    playerHand: '8',
    playerHandLabel: 'Hard 8',
    dealerUpcard: '6',
    index: 2,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'D',
    source: `${SRC} — 8 v 6 double @ +2`,
  },

  // ─── Late Surrender deviations ─────────────────────────────────────────
  // The BJA S17 LS table shows 16 v 10 and 16 v A as plain "SUR" cells
  // (basic LS), which our basic strategy already covers via SUR_H. No
  // deviation entry is needed for those cells. The entries below are the
  // remaining LS cells that show explicit index values.
  {
    ruleSet: 'S17',
    category: 'surrender',
    playerHand: '16',
    playerHandLabel: 'Hard 16',
    dealerUpcard: '8',
    index: 4,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'SUR',
    source: `${SRC} — 16 v 8 surrender @ +4`,
  },
  // 16 v 9: BJA shows "-1-". Our basic strategy already returns SUR for
  // 16 v 9 when LS is enabled (SUR_H), so this entry has no functional
  // impact at runtime — it preserves the chart cell for the trainer UI.
  {
    ruleSet: 'S17',
    category: 'surrender',
    playerHand: '16',
    playerHandLabel: 'Hard 16',
    dealerUpcard: '9',
    index: -1,
    direction: 'at-or-below',
    basicAction: 'H',
    deviationAction: 'SUR',
    source: `${SRC} — 16 v 9 surrender @ -1 and below`,
  },
  {
    ruleSet: 'S17',
    category: 'surrender',
    playerHand: '15',
    playerHandLabel: 'Hard 15',
    dealerUpcard: '9',
    index: 2,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'SUR',
    source: `${SRC} — 15 v 9 surrender @ +2`,
  },
  // 15 v 10: BJA shows "0-". Basic strategy already returns SUR (SUR_H)
  // when LS is enabled, so this entry is documentary; see comments above.
  {
    ruleSet: 'S17',
    category: 'surrender',
    playerHand: '15',
    playerHandLabel: 'Hard 15',
    dealerUpcard: '10',
    index: 0,
    direction: 'at-or-below',
    basicAction: 'H',
    deviationAction: 'SUR',
    source: `${SRC} — 15 v 10 surrender @ 0-`,
  },
  {
    ruleSet: 'S17',
    category: 'surrender',
    playerHand: '15',
    playerHandLabel: 'Hard 15',
    dealerUpcard: 'A',
    index: 2,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'SUR',
    source: `${SRC} — 15 v A surrender @ +2`,
  },
];

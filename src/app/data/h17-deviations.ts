// H17 Hi-Lo deviations (dealer hits soft 17).
//
// Source: Blackjack Apprenticeship "Hi-Lo Deviations Chart — H17" PDF.
//   https://www.blackjackapprenticeship.com/wp-content/uploads/2019/07/BJA_H17.pdf
//
// Every rule below is transcribed from that PDF, including indices, threshold
// directions, and chart sections. Each rule's `source` field cites the chart
// section the cell came from.
//
// Notes (mirror the S17 file — H17-specific differences are called out below):
//
//   - The BJA chart legend says "0+" = "any positive running count" and
//     "0-" = "any negative running count". We treat them inclusively here
//     (TC >= 0 and TC <= 0 respectively) to align with the canonical
//     Illustrious 18 framing. For integer true counts this only affects
//     the boundary at TC = 0.
//   - `basicAction` is the chart's pre-deviation play (informational only).
//     For "Ds" cells we encode as 'D' because the Action type collapses
//     Ds → D for two-card initial hands.
//   - The BJA H17 chart omits 12 v 5 @ -2, 12 v 6 @ -1, 13 v 3 @ -2, and
//     14 v 10 surrender @ +3 from the wider Illustrious 18 / Fab 4. They
//     are not encoded here.
//   - H17-only entries vs S17:
//       * Hard 16 v A stand @ +3 (S17 chart shows H, no deviation).
//       * Hard 15 v A stand @ +5 (S17 chart shows H, no deviation).
//       * Hard 10 v A double @ +3 (S17 chart shows +4).
//       * Soft A,8 v 6 reverts Ds → S at TC <= 0 (S17 chart shows +1, an
//         upgrade from S → D). Basic strategy already differs: H17 basic
//         is Ds at this cell, S17 basic is S.
//       * Late Surrender 15 v A applies at TC >= -1 (S17 chart shows +2).
//       * 17 v A: basic LS surrender (no index in chart). Already covered
//         by SUR_S in our basic strategy file; no deviation entry needed.
//   - H17 omits the S17 11 v A double @ +1 rule because H17 basic strategy
//     already doubles 11 v A.
//   - The BJA H17 LS chart shows 16 v 10 and 16 v A as plain "SUR" basic
//     cells (covered by SUR_H in basic strategy). 17 v A is also plain
//     "SUR" (covered by SUR_S). No deviation entries needed for those.
//   - A few SUR deviation rules below (e.g., 16 v 9 SUR @ -1-, 15 v 10
//     SUR @ 0-, 15 v A SUR @ -1+) are encoded for chart faithfulness even
//     though our basic strategy already returns SUR (via SUR_H) for the
//     same hand when LS is enabled. The deviation entry is a no-op at
//     runtime but documents the chart cell.

import type { DeviationRule } from '../core/models/deviation.model';

const SRC = 'BJA H17 Deviations chart';

export const H17_DEVIATIONS: readonly DeviationRule[] = [
  // ─── Insurance ─────────────────────────────────────────────────────────
  {
    ruleSet: 'H17',
    category: 'insurance',
    playerHand: 'insurance',
    playerHandLabel: 'Insurance',
    dealerUpcard: 'A',
    index: 3,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'INS',
    source: `${SRC} — Insurance or Even Money: take at 3+`,
  },

  // ─── Pair Splitting deviations ─────────────────────────────────────────
  {
    ruleSet: 'H17',
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
    ruleSet: 'H17',
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
    ruleSet: 'H17',
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
  {
    ruleSet: 'H17',
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
    ruleSet: 'H17',
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
  // H17 A,8 v 6: basic strategy is Ds (D for two-card hands). The chart
  // index "0-" downgrades the play to S at TC <= 0 — fewer 10s remaining
  // makes doubling less attractive on soft 19. basicAction is 'D' to mirror
  // the engine's two-card Ds → D collapse.
  {
    ruleSet: 'H17',
    category: 'soft',
    playerHand: '19',
    playerHandLabel: 'Soft 19 (A,8)',
    dealerUpcard: '6',
    index: 0,
    direction: 'at-or-below',
    basicAction: 'D',
    deviationAction: 'S',
    source: `${SRC} — A,8 v 6 stand @ 0- (downgrade Ds → S; H17 only)`,
  },
  {
    ruleSet: 'H17',
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

  // ─── Hard Total deviations ─────────────────────────────────────────────
  {
    ruleSet: 'H17',
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
    ruleSet: 'H17',
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
  // H17-only: 16 v A stand @ +3 (S17 chart has no deviation here).
  {
    ruleSet: 'H17',
    category: 'hard',
    playerHand: '16',
    playerHandLabel: 'Hard 16',
    dealerUpcard: 'A',
    index: 3,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'S',
    source: `${SRC} — 16 v A stand @ +3 (H17 only)`,
  },
  {
    ruleSet: 'H17',
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
  // H17-only: 15 v A stand @ +5 (S17 chart has no deviation here).
  {
    ruleSet: 'H17',
    category: 'hard',
    playerHand: '15',
    playerHandLabel: 'Hard 15',
    dealerUpcard: 'A',
    index: 5,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'S',
    source: `${SRC} — 15 v A stand @ +5 (H17 only)`,
  },
  {
    ruleSet: 'H17',
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
    ruleSet: 'H17',
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
    ruleSet: 'H17',
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
    ruleSet: 'H17',
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
  // No 11 v A entry in H17 — basic strategy already doubles.
  {
    ruleSet: 'H17',
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
  // H17 10 v A: +3 (S17 chart uses +4). The dealer hitting soft 17 makes
  // an Ace upcard slightly weaker, so doubling becomes profitable sooner.
  {
    ruleSet: 'H17',
    category: 'hard',
    playerHand: '10',
    playerHandLabel: 'Hard 10',
    dealerUpcard: 'A',
    index: 3,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'D',
    source: `${SRC} — 10 v A double @ +3 (S17 chart lists +4)`,
  },
  {
    ruleSet: 'H17',
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
    ruleSet: 'H17',
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
    ruleSet: 'H17',
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
  {
    ruleSet: 'H17',
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
  // See file-level note: basic strategy already returns SUR for 16 v 9
  // when LS is enabled, so this rule is documentary.
  {
    ruleSet: 'H17',
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
    ruleSet: 'H17',
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
  // 15 v 10: documentary; basic strategy already returns SUR (SUR_H).
  {
    ruleSet: 'H17',
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
  // 15 v A: chart cell "-1+" means TC >= -1. Documentary because basic
  // strategy already returns SUR for 15 v A in H17 with LS enabled.
  {
    ruleSet: 'H17',
    category: 'surrender',
    playerHand: '15',
    playerHandLabel: 'Hard 15',
    dealerUpcard: 'A',
    index: -1,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'SUR',
    source: `${SRC} — 15 v A surrender @ -1 and above (H17 only)`,
  },
];

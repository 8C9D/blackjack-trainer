import type { CountingSystem } from '../core/models/counting-system.model';

// Hi-Lo card counting system.
//
// Source: Blackjack Apprenticeship, "Hi-Lo Card Counting System"
//   https://www.blackjackapprenticeship.com/how-to-count-cards/
//
// Card values:
//   2, 3, 4, 5, 6 → +1
//   7, 8, 9       →  0
//   10, J, Q, K, A → -1
//
// Hi-Lo is balanced: a full 52-card deck sums to 0 (twenty +1 cards,
// twelve 0 cards, twenty -1 cards across all four suits).
export const HI_LO: CountingSystem = {
  id: 'hi-lo',
  name: 'Hi-Lo',
  description:
    'Balanced level-1 system. Low cards (2–6) count as +1, neutrals (7–9) as 0, tens and aces as −1.',
  balanced: true,
  values: {
    '2': 1,
    '3': 1,
    '4': 1,
    '5': 1,
    '6': 1,
    '7': 0,
    '8': 0,
    '9': 0,
    '10': -1,
    J: -1,
    Q: -1,
    K: -1,
    A: -1,
  },
};

// KO (Knock-Out) card counting system.
//
// Source: Olaf Vancura & Ken Fuchs, "Knock-Out Blackjack"; summarized at
// Blackjack Apprenticeship, "Unbalanced Card Counting Systems".
//
// Card values:
//   2, 3, 4, 5, 6, 7 → +1
//   8, 9             →  0
//   10, J, Q, K, A   → -1
//
// KO differs from Hi-Lo only by counting the 7 as +1 instead of 0. That makes
// it *unbalanced* (`balanced: false`): a full 52-card deck sums to +4, not 0
// (twenty-four +1 cards, eight 0 cards, twenty -1 cards). Unbalanced systems
// are trained and played as a running count rather than converted to a true
// count the Hi-Lo way, so the trainer restricts KO to running-count mode.
export const KO: CountingSystem = {
  id: 'ko',
  name: 'KO',
  description:
    'Unbalanced level-1 system (Knock-Out). Low cards (2–7) count as +1, neutrals (8–9) as 0, tens and aces as −1. Trained as a running count.',
  balanced: false,
  values: {
    '2': 1,
    '3': 1,
    '4': 1,
    '5': 1,
    '6': 1,
    '7': 1,
    '8': 0,
    '9': 0,
    '10': -1,
    J: -1,
    Q: -1,
    K: -1,
    A: -1,
  },
};

// Omega II card counting system.
//
// Source: Bryce Carlson, "Blackjack for Blood"; summarized at Blackjack
// Apprenticeship, "Advanced Card Counting Systems".
//
// Card values:
//   2, 3, 7        → +1
//   4, 5, 6        → +2
//   8, A           →  0
//   9              → -1
//   10, J, Q, K    → -2
//
// Omega II is a *balanced* level-2 system (`balanced: true`): a full 52-card
// deck sums to 0 (per suit: three +1, three +2, two 0, one -1, four -2 →
// 3 + 6 + 0 - 1 - 8 = 0). Being balanced, it converts to a true count the
// Hi-Lo way. Its ±2 values are what required widening `CountValue` beyond the
// level-1 range used by Hi-Lo and KO.
export const OMEGA_II: CountingSystem = {
  id: 'omega-ii',
  name: 'Omega II',
  description:
    'Balanced level-2 system. 2/3/7 count as +1, 4/5/6 as +2, 8 and aces as 0, 9 as −1, tens and faces as −2.',
  balanced: true,
  values: {
    '2': 1,
    '3': 1,
    '4': 2,
    '5': 2,
    '6': 2,
    '7': 1,
    '8': 0,
    '9': -1,
    '10': -2,
    J: -2,
    Q: -2,
    K: -2,
    A: 0,
  },
};

// Registry of available systems. Add new systems here when adding additional
// counting modes — the UI will discover them via this list.
export const COUNTING_SYSTEMS: readonly CountingSystem[] = [HI_LO, KO, OMEGA_II] as const;

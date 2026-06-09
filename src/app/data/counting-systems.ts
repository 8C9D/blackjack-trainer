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

// Registry of available systems. Add new systems here (KO, Omega II, etc.)
// when adding additional counting modes — UI will discover them via this list.
export const COUNTING_SYSTEMS: readonly CountingSystem[] = [HI_LO] as const;

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

// Wong Halves card counting system.
//
// Source: Stanford Wong, "Professional Blackjack"; summarized at Blackjack
// Apprenticeship, "Advanced Card Counting Systems".
//
// Card values:
//   2, 7           → +0.5
//   3, 4, 6        → +1
//   5              → +1.5
//   8              →  0
//   9              → -0.5
//   10, J, Q, K, A → -1
//
// Wong Halves is a *balanced* level-3 system (`balanced: true`): a full 52-card
// deck sums to 0 (per suit: 0.5 + 1 + 1 + 1.5 + 1 + 0.5 + 0 - 0.5 - 1 - 1 - 1 -
// 1 - 1 = 0). Being balanced, it converts to a true count the Hi-Lo way. Its
// half-point values (±0.5, ±1.5) are fractional, which is what required widening
// `CountValue` from an integer union to a plain number. The trainer represents
// the count with true fractional values: running counts land on halves (e.g.
// 2.5, -0.5), so the running-count answer accepts fractional input. (Some
// players instead "double" the values ×2 to keep arithmetic integer-only; this
// app uses the natural fractional representation.)
export const WONG_HALVES: CountingSystem = {
  id: 'wong-halves',
  name: 'Wong Halves',
  description:
    'Balanced level-3 system. 2 and 7 count as +0.5, 3/4/6 as +1, 5 as +1.5, 8 as 0, 9 as −0.5, tens and aces as −1. The running count uses fractional (half-point) values.',
  balanced: true,
  values: {
    '2': 0.5,
    '3': 1,
    '4': 1,
    '5': 1.5,
    '6': 1,
    '7': 0.5,
    '8': 0,
    '9': -0.5,
    '10': -1,
    J: -1,
    Q: -1,
    K: -1,
    A: -1,
  },
};

// --- Standard systems (Blackjack Review comparison; canonical tags in
// .claude/skills/add-counting-systems/reference-systems.md, verified against the
// deck-sum invariant by counting-systems.spec.ts). These are rank-keyed; the
// engine and UI discover them via COUNTING_SYSTEMS below. Each comment lists the
// per-rank tags, balance, and source so a reader can sanity-check without the
// reference file. Ace side counts (Hi-Opt I/II, Uston APC) are not modeled. ---
const STANDARD_SYSTEMS: readonly CountingSystem[] = [
  {
    id: 'ace-mt',
    name: 'AceMT',
    // A,tens = -1; 2-9 = 0. Unbalanced (deck sum -20).
    description:
      'Unbalanced ace/ten count (AceMT). Aces and tens count as −1; 2–9 are neutral. Trained as a running count.',
    balanced: false,
    values: {
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
      '6': 0,
      '7': 0,
      '8': 0,
      '9': 0,
      '10': -1,
      J: -1,
      Q: -1,
      K: -1,
      A: -1,
    },
  },
  {
    id: 'awk',
    name: 'AWK',
    // 2/3/4/6 = +1, 5 = +2, tens = -1, A = -2. Balanced (deck sum 0).
    description:
      'Balanced level-2 system (AWK). 2/3/4/6 = +1, 5 = +2, tens = −1, aces = −2; 7/8/9 neutral.',
    balanced: true,
    values: {
      '2': 1,
      '3': 1,
      '4': 1,
      '5': 2,
      '6': 1,
      '7': 0,
      '8': 0,
      '9': 0,
      '10': -1,
      J: -1,
      Q: -1,
      K: -1,
      A: -2,
    },
  },
  {
    id: 'ambition',
    name: 'Ambition',
    // 2-6 = +1, 7 = +0.5, 9 = -0.5, tens/A = -1. Balanced (deck sum 0). Fractional.
    description:
      'Balanced fractional system (Ambition, Courter/Tibbetts). 2–6 = +1, 7 = +0.5, 9 = −0.5, tens and aces = −1; 8 neutral. Fractional running count.',
    balanced: true,
    values: {
      '2': 1,
      '3': 1,
      '4': 1,
      '5': 1,
      '6': 1,
      '7': 0.5,
      '8': 0,
      '9': -0.5,
      '10': -1,
      J: -1,
      Q: -1,
      K: -1,
      A: -1,
    },
  },
  {
    id: 'ambition-u',
    name: 'Ambition-U',
    // 2-6 = +1, tens = -1, A = -0.5. Unbalanced (deck sum 2). Fractional.
    description:
      'Unbalanced fractional system (Ambition-U). 2–6 = +1, tens = −1, aces = −0.5; 7/8/9 neutral. Running count only.',
    balanced: false,
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
      A: -0.5,
    },
  },
  {
    id: 'andersen',
    name: 'Andersen',
    // 2/3/4/6/7 = +1, 5 = +2, 9/tens = -1, A = -2. Balanced (deck sum 0).
    description:
      'Balanced level-2 system (Andersen / Reppert). 2/3/4/6/7 = +1, 5 = +2, 9 and tens = −1, aces = −2; 8 neutral.',
    balanced: true,
    values: {
      '2': 1,
      '3': 1,
      '4': 1,
      '5': 2,
      '6': 1,
      '7': 1,
      '8': 0,
      '9': -1,
      '10': -1,
      J: -1,
      Q: -1,
      K: -1,
      A: -2,
    },
  },
  {
    id: 'archer',
    name: 'Archer',
    // Every non-ten (incl. A) = +1, tens = -2. Unbalanced (deck sum 4).
    description:
      'Unbalanced ten count (Archer). Every non-ten card including aces = +1, tens = −2. Running count only.',
    balanced: false,
    values: {
      '2': 1,
      '3': 1,
      '4': 1,
      '5': 1,
      '6': 1,
      '7': 1,
      '8': 1,
      '9': 1,
      '10': -2,
      J: -2,
      Q: -2,
      K: -2,
      A: 1,
    },
  },
  {
    id: 'brh-0',
    name: 'BRH-0',
    // 2-6 = +2, 7 = +1, tens/A = -2. Unbalanced (deck sum 4).
    description:
      'Unbalanced level-2 system (BRH-0). 2–6 = +2, 7 = +1, tens and aces = −2; 8/9 neutral. Running count only.',
    balanced: false,
    values: {
      '2': 2,
      '3': 2,
      '4': 2,
      '5': 2,
      '6': 2,
      '7': 1,
      '8': 0,
      '9': 0,
      '10': -2,
      J: -2,
      Q: -2,
      K: -2,
      A: -2,
    },
  },
  {
    id: 'brh-i',
    name: 'BRH-I',
    // 3/4/6 = +2, 5 = +3, 2/7 = +1, tens/A = -2. Unbalanced (deck sum 4).
    description:
      'Unbalanced level-3 system (BRH-I). 3/4/6 = +2, 5 = +3, 2/7 = +1, tens and aces = −2; 8/9 neutral. Running count only.',
    balanced: false,
    values: {
      '2': 1,
      '3': 2,
      '4': 2,
      '5': 3,
      '6': 2,
      '7': 1,
      '8': 0,
      '9': 0,
      '10': -2,
      J: -2,
      Q: -2,
      K: -2,
      A: -2,
    },
  },
  {
    id: 'brh-ii',
    name: 'BRH-II',
    // 4/5/6 = +2, 2/3/7 = +1, tens = -2. Unbalanced (deck sum 4).
    description:
      'Unbalanced level-2 system (BRH-II). 4/5/6 = +2, 2/3/7 = +1, tens = −2; 8/9 and aces neutral. Running count only.',
    balanced: false,
    values: {
      '2': 1,
      '3': 1,
      '4': 2,
      '5': 2,
      '6': 2,
      '7': 1,
      '8': 0,
      '9': 0,
      '10': -2,
      J: -2,
      Q: -2,
      K: -2,
      A: 0,
    },
  },
  {
    id: 'bushido',
    name: 'Bushido',
    // 2-6 = +2, 7 = +1, tens = -2, A = -1. Unbalanced (deck sum 8).
    description:
      'Unbalanced level-2 system (Bushido). 2–6 = +2, 7 = +1, tens = −2, aces = −1; 8/9 neutral. Running count only.',
    balanced: false,
    values: {
      '2': 2,
      '3': 2,
      '4': 2,
      '5': 2,
      '6': 2,
      '7': 1,
      '8': 0,
      '9': 0,
      '10': -2,
      J: -2,
      Q: -2,
      K: -2,
      A: -1,
    },
  },
  {
    id: 'canfield-expert',
    name: 'Canfield Expert',
    // 3-7 = +1, 9/tens = -1. Balanced (deck sum 0).
    description:
      'Balanced level-1 system (Canfield Expert). 3–7 = +1, 9 and tens = −1; 2/8 and aces neutral.',
    balanced: true,
    values: {
      '2': 0,
      '3': 1,
      '4': 1,
      '5': 1,
      '6': 1,
      '7': 1,
      '8': 0,
      '9': -1,
      '10': -1,
      J: -1,
      Q: -1,
      K: -1,
      A: 0,
    },
  },
  {
    id: 'ck-precision',
    name: 'C-K (Precision)',
    // 3-6 = +2, 2/7 = +1, 9 = -1, tens = -2, A = -1. Balanced (deck sum 0).
    description:
      'Balanced level-2 system (C-K / Precision Count, Cant/Keen). 3–6 = +2, 2/7 = +1, 9 = −1, tens = −2, aces = −1; 8 neutral.',
    balanced: true,
    values: {
      '2': 1,
      '3': 2,
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
      A: -1,
    },
  },
  {
    id: 'c-r',
    name: 'C-R',
    // 3-6 = +1, 2/7 = +0.5, tens/A = -1. Balanced (deck sum 0). Fractional.
    description:
      'Balanced fractional system (C-R, Chambliss/Roginski). 3–6 = +1, 2/7 = +0.5, tens and aces = −1; 8/9 neutral. Fractional running count.',
    balanced: true,
    values: {
      '2': 0.5,
      '3': 1,
      '4': 1,
      '5': 1,
      '6': 1,
      '7': 0.5,
      '8': 0,
      '9': 0,
      '10': -1,
      J: -1,
      Q: -1,
      K: -1,
      A: -1,
    },
  },
  {
    id: 'dhm',
    name: 'DHM',
    // 2-5 = +1, tens = -1. Balanced (deck sum 0).
    description:
      'Balanced level-1 system (DHM, Gordon). 2–5 = +1, tens = −1; 6–9 and aces neutral.',
    balanced: true,
    values: {
      '2': 1,
      '3': 1,
      '4': 1,
      '5': 1,
      '6': 0,
      '7': 0,
      '8': 0,
      '9': 0,
      '10': -1,
      J: -1,
      Q: -1,
      K: -1,
      A: 0,
    },
  },
  {
    id: 'dmpro',
    name: 'DMPro',
    // 3/4/6 = +2, 5 = +3, 2/7 = +1, 9 = -1, tens/A = -2. Balanced (deck sum 0).
    description:
      'Balanced level-3 system (DMPro, Sharp — Wong Halves ×2). 3/4/6 = +2, 5 = +3, 2/7 = +1, 9 = −1, tens and aces = −2; 8 neutral.',
    balanced: true,
    values: {
      '2': 1,
      '3': 2,
      '4': 2,
      '5': 3,
      '6': 2,
      '7': 1,
      '8': 0,
      '9': -1,
      '10': -2,
      J: -2,
      Q: -2,
      K: -2,
      A: -2,
    },
  },
  {
    id: 'ebj-ii',
    name: 'EBJ II',
    // 2-6 = +2, 7 = +1, 9 = -1, tens/A = -2. Balanced (deck sum 0).
    description:
      'Balanced level-2 system (EBJ II). 2–6 = +2, 7 = +1, 9 = −1, tens and aces = −2; 8 neutral.',
    balanced: true,
    values: {
      '2': 2,
      '3': 2,
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
      A: -2,
    },
  },
  {
    id: 'ebj-ii-u',
    name: 'EBJ II-U',
    // 2-6 = +2, 7 = +1, tens/A = -2. Unbalanced (deck sum 4).
    description:
      'Unbalanced level-2 system (EBJ II-U). 2–6 = +2, 7 = +1, tens and aces = −2; 8/9 neutral. Running count only.',
    balanced: false,
    values: {
      '2': 2,
      '3': 2,
      '4': 2,
      '5': 2,
      '6': 2,
      '7': 1,
      '8': 0,
      '9': 0,
      '10': -2,
      J: -2,
      Q: -2,
      K: -2,
      A: -2,
    },
  },
  {
    id: 'ebj-iii',
    name: 'EBJ III',
    // 3/4/6 = +2, 5 = +3, 2/7 = +1, 9 = -1, tens/A = -2. Balanced (deck sum 0).
    description:
      'Balanced level-3 system (EBJ III). 3/4/6 = +2, 5 = +3, 2/7 = +1, 9 = −1, tens and aces = −2; 8 neutral.',
    balanced: true,
    values: {
      '2': 1,
      '3': 2,
      '4': 2,
      '5': 3,
      '6': 2,
      '7': 1,
      '8': 0,
      '9': -1,
      '10': -2,
      J: -2,
      Q: -2,
      K: -2,
      A: -2,
    },
  },
  {
    id: 'ebj-iii-u',
    name: 'EBJ III-U',
    // 2/3/4/6 = +2, 5 = +3, 7 = +1, 9 = -1, tens/A = -2. Unbalanced (deck sum 4).
    description:
      'Unbalanced level-3 system (EBJ III-U). 2/3/4/6 = +2, 5 = +3, 7 = +1, 9 = −1, tens and aces = −2; 8 neutral. Running count only.',
    balanced: false,
    values: {
      '2': 2,
      '3': 2,
      '4': 2,
      '5': 3,
      '6': 2,
      '7': 1,
      '8': 0,
      '9': -1,
      '10': -2,
      J: -2,
      Q: -2,
      K: -2,
      A: -2,
    },
  },
  {
    id: 'graham-2',
    name: 'Graham 2',
    // 2-7 = +1, tens = -1, A = -2. Balanced (deck sum 0).
    description: 'Balanced level-2 system (Graham 2). 2–7 = +1, tens = −1, aces = −2; 8/9 neutral.',
    balanced: true,
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
      A: -2,
    },
  },
  {
    id: 'griffin',
    name: 'Griffin',
    // 4-7 = +1, tens = -1. Balanced (deck sum 0).
    description:
      'Balanced level-1 system (Griffin). 4–7 = +1, tens = −1; 2/3/8/9 and aces neutral.',
    balanced: true,
    values: {
      '2': 0,
      '3': 0,
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
      A: 0,
    },
  },
  {
    id: 'griffin-3',
    name: 'Griffin 3',
    // 3/4/6/7 = +2, 5 = +3, 2/8 = +1, 9 = -1, tens = -3. Balanced (deck sum 0).
    description:
      'Balanced level-3 system (Griffin 3). 3/4/6/7 = +2, 5 = +3, 2/8 = +1, 9 = −1, tens = −3; aces neutral.',
    balanced: true,
    values: {
      '2': 1,
      '3': 2,
      '4': 2,
      '5': 3,
      '6': 2,
      '7': 2,
      '8': 1,
      '9': -1,
      '10': -3,
      J: -3,
      Q: -3,
      K: -3,
      A: 0,
    },
  },
  {
    id: 'griffin-4',
    name: 'Griffin 4',
    // 5 = +4, 4/6/7 = +3, 3 = +2, 2/8 = +1, 9 = -1, tens = -4. Balanced (deck sum 0).
    description:
      'Balanced level-4 system (Griffin 4). 5 = +4, 4/6/7 = +3, 3 = +2, 2/8 = +1, 9 = −1, tens = −4; aces neutral.',
    balanced: true,
    values: {
      '2': 1,
      '3': 2,
      '4': 3,
      '5': 4,
      '6': 3,
      '7': 3,
      '8': 1,
      '9': -1,
      '10': -4,
      J: -4,
      Q: -4,
      K: -4,
      A: 0,
    },
  },
  {
    id: 'griffin-5',
    name: 'Griffin 5',
    // 5 = +5, 4/6 = +4, 7 = +3, 2/3 = +2, 8 = +1, 9 = -1, tens = -5. Balanced (deck sum 0).
    description:
      'Balanced level-5 system (Griffin 5). 5 = +5, 4/6 = +4, 7 = +3, 2/3 = +2, 8 = +1, 9 = −1, tens = −5; aces neutral.',
    balanced: true,
    values: {
      '2': 2,
      '3': 2,
      '4': 4,
      '5': 5,
      '6': 4,
      '7': 3,
      '8': 1,
      '9': -1,
      '10': -5,
      J: -5,
      Q: -5,
      K: -5,
      A: 0,
    },
  },
  {
    id: 'hi-opt-i',
    name: 'Hi-Opt I',
    // 3-6 = +1, tens = -1. Balanced (deck sum 0). Ace side count not modeled.
    description:
      'Balanced level-1 system (Hi-Opt I). 3–6 = +1, tens = −1; 2/7/8/9 and aces neutral. Full play adds an ace side count, not drilled here.',
    balanced: true,
    values: {
      '2': 0,
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
      A: 0,
    },
  },
  {
    id: 'hi-opt-ii',
    name: 'Hi-Opt II',
    // 4/5 = +2, 2/3/6/7 = +1, tens = -2. Balanced (deck sum 0). Ace side count not modeled.
    description:
      'Balanced level-2 system (Hi-Opt II). 4/5 = +2, 2/3/6/7 = +1, tens = −2; 8/9 and aces neutral. Full play adds an ace side count, not drilled here.',
    balanced: true,
    values: {
      '2': 1,
      '3': 1,
      '4': 2,
      '5': 2,
      '6': 1,
      '7': 1,
      '8': 0,
      '9': 0,
      '10': -2,
      J: -2,
      Q: -2,
      K: -2,
      A: 0,
    },
  },
  {
    id: 'hnf',
    name: 'HNF',
    // 4/5 = +2, 2/3/6/7 = +1, A = +1, tens = -2. Unbalanced (deck sum 4).
    description:
      'Unbalanced level-2 system (HNF). 4/5 = +2, 2/3/6/7 and aces = +1, tens = −2; 8/9 neutral. Running count only.',
    balanced: false,
    values: {
      '2': 1,
      '3': 1,
      '4': 2,
      '5': 2,
      '6': 1,
      '7': 1,
      '8': 0,
      '9': 0,
      '10': -2,
      J: -2,
      Q: -2,
      K: -2,
      A: 1,
    },
  },
  {
    id: 'j-noir',
    name: 'J. Noir',
    // 2-9 = +1, tens/A = -2. Unbalanced (deck sum -8).
    description:
      'Unbalanced ten count (J. Noir). 2–9 = +1, tens and aces = −2. Running count only.',
    balanced: false,
    values: {
      '2': 1,
      '3': 1,
      '4': 1,
      '5': 1,
      '6': 1,
      '7': 1,
      '8': 1,
      '9': 1,
      '10': -2,
      J: -2,
      Q: -2,
      K: -2,
      A: -2,
    },
  },
  {
    id: 'lima',
    name: 'Lima',
    // 3-7 = +1, A = -1. Unbalanced (deck sum 16).
    description:
      'Unbalanced system (Lima). 3–7 = +1, aces = −1; 2/8/9 and tens neutral. Running count only.',
    balanced: false,
    values: {
      '2': 0,
      '3': 1,
      '4': 1,
      '5': 1,
      '6': 1,
      '7': 1,
      '8': 0,
      '9': 0,
      '10': 0,
      J: 0,
      Q: 0,
      K: 0,
      A: -1,
    },
  },
  {
    id: 'mentor',
    name: 'Mentor',
    // 3-6 = +2, 2/7 = +1, 9 = -1, tens = -2, A = -1. Balanced (deck sum 0).
    description:
      'Balanced level-2 system (Mentor, Renzey). 3–6 = +2, 2/7 = +1, 9 = −1, tens = −2, aces = −1; 8 neutral.',
    balanced: true,
    values: {
      '2': 1,
      '3': 2,
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
      A: -1,
    },
  },
  {
    id: 'olsen-trucount',
    name: 'Olsen TruCount',
    // 5 = +2, 2/3/4/6 = +1, 7/9 = +0.5, tens/A = -1. Unbalanced (deck sum 8). Fractional.
    description:
      'Unbalanced fractional system (Olsen TruCount). 5 = +2, 2/3/4/6 = +1, 7/9 = +0.5, tens and aces = −1; 8 neutral. Running count only.',
    balanced: false,
    values: {
      '2': 1,
      '3': 1,
      '4': 1,
      '5': 2,
      '6': 1,
      '7': 0.5,
      '8': 0,
      '9': 0.5,
      '10': -1,
      J: -1,
      Q: -1,
      K: -1,
      A: -1,
    },
  },
  {
    id: 'revere-five-count',
    name: 'Revere Five-Count',
    // 5 = +1, everything else 0. Unbalanced (deck sum 4).
    description:
      'Unbalanced single-card count (Revere Five-Count). Only the 5 counts, as +1; every other card is neutral. Running count only.',
    balanced: false,
    values: {
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 1,
      '6': 0,
      '7': 0,
      '8': 0,
      '9': 0,
      '10': 0,
      J: 0,
      Q: 0,
      K: 0,
      A: 0,
    },
  },
  {
    id: 'revere-plus-minus',
    name: 'Revere Plus-Minus',
    // 2-6 = +1, 9/tens = -1. Balanced (deck sum 0).
    description:
      'Balanced level-1 system (Revere Plus-Minus). 2–6 = +1, 9 and tens = −1; 7/8 and aces neutral.',
    balanced: true,
    values: {
      '2': 1,
      '3': 1,
      '4': 1,
      '5': 1,
      '6': 1,
      '7': 0,
      '8': 0,
      '9': -1,
      '10': -1,
      J: -1,
      Q: -1,
      K: -1,
      A: 0,
    },
  },
  {
    id: 'revere-point-count',
    name: 'Revere Point Count',
    // 3-6 = +2, 2/7 = +1, tens/A = -2. Balanced (deck sum 0).
    description:
      'Balanced level-2 system (Revere Point Count). 3–6 = +2, 2/7 = +1, tens and aces = −2; 8/9 neutral.',
    balanced: true,
    values: {
      '2': 1,
      '3': 2,
      '4': 2,
      '5': 2,
      '6': 2,
      '7': 1,
      '8': 0,
      '9': 0,
      '10': -2,
      J: -2,
      Q: -2,
      K: -2,
      A: -2,
    },
  },
  {
    id: 'silver-fox',
    name: 'Silver Fox',
    // 2-7 = +1, 9/tens/A = -1. Balanced (deck sum 0).
    description:
      'Balanced level-1 system (Silver Fox). 2–7 = +1, 9, tens and aces = −1; 8 neutral.',
    balanced: true,
    values: {
      '2': 1,
      '3': 1,
      '4': 1,
      '5': 1,
      '6': 1,
      '7': 1,
      '8': 0,
      '9': -1,
      '10': -1,
      J: -1,
      Q: -1,
      K: -1,
      A: -1,
    },
  },
  {
    id: 't-hop-1',
    name: 'T-Hop 1',
    // 3-7 = +1, tens = -1. Unbalanced (deck sum 4).
    description:
      'Unbalanced level-1 system (T-Hop 1, Hopper). 3–7 = +1, tens = −1; 2/8/9 and aces neutral. Running count only.',
    balanced: false,
    values: {
      '2': 0,
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
      A: 0,
    },
  },
  {
    id: 't-hop-2',
    name: 'T-Hop 2',
    // 4/5/6 = +2, 2/3/7 = +1, tens = -2. Unbalanced (deck sum 4).
    description:
      'Unbalanced level-2 system (T-Hop 2, Hopper). 4/5/6 = +2, 2/3/7 = +1, tens = −2; 8/9 and aces neutral. Running count only.',
    balanced: false,
    values: {
      '2': 1,
      '3': 1,
      '4': 2,
      '5': 2,
      '6': 2,
      '7': 1,
      '8': 0,
      '9': 0,
      '10': -2,
      J: -2,
      Q: -2,
      K: -2,
      A: 0,
    },
  },
  {
    id: 'tri-level',
    name: 'Tri-Level',
    // 2/3/4/6/7 = +1, 5 = +2, 9/tens = -1, A = -2. Balanced (deck sum 0).
    description:
      'Balanced level-2 system (Tri-Level). 2/3/4/6/7 = +1, 5 = +2, 9 and tens = −1, aces = −2; 8 neutral.',
    balanced: true,
    values: {
      '2': 1,
      '3': 1,
      '4': 1,
      '5': 2,
      '6': 1,
      '7': 1,
      '8': 0,
      '9': -1,
      '10': -1,
      J: -1,
      Q: -1,
      K: -1,
      A: -2,
    },
  },
  {
    id: 'ubz-ii',
    name: 'UBZ II',
    // 3-6 = +2, 2/7 = +1, tens = -2, A = -1. Unbalanced (deck sum 4).
    description:
      'Unbalanced level-2 system (UBZ II, George C). 3–6 = +2, 2/7 = +1, tens = −2, aces = −1; 8/9 neutral. Running count only.',
    balanced: false,
    values: {
      '2': 1,
      '3': 2,
      '4': 2,
      '5': 2,
      '6': 2,
      '7': 1,
      '8': 0,
      '9': 0,
      '10': -2,
      J: -2,
      Q: -2,
      K: -2,
      A: -1,
    },
  },
  {
    id: 'uston-ace-five',
    name: 'Uston Ace-Five',
    // 5 = +1, A = -1. Balanced (deck sum 0).
    description:
      'Balanced two-card count (Uston Ace-Five). 5 = +1, aces = −1; everything else neutral. A simple bet-sizing count.',
    balanced: true,
    values: {
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 1,
      '6': 0,
      '7': 0,
      '8': 0,
      '9': 0,
      '10': 0,
      J: 0,
      Q: 0,
      K: 0,
      A: -1,
    },
  },
  {
    id: 'uston-adv-plus-minus',
    name: 'Uston Adv Plus-Minus',
    // 3-7 = +1, tens/A = -1. Balanced (deck sum 0).
    description:
      'Balanced level-1 system (Uston Advanced Plus-Minus). 3–7 = +1, tens and aces = −1; 2/8/9 neutral.',
    balanced: true,
    values: {
      '2': 0,
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
  },
  {
    id: 'uston-apc',
    name: 'Uston APC',
    // 5 = +3, 3/4/6/7 = +2, 2/8 = +1, 9 = -1, tens = -3. Balanced (deck sum 0). Ace side count not modeled.
    description:
      'Balanced level-3 system (Uston APC, Advanced Point Count). 5 = +3, 3/4/6/7 = +2, 2/8 = +1, 9 = −1, tens = −3; aces neutral. Full play adds an ace side count, not drilled here.',
    balanced: true,
    values: {
      '2': 1,
      '3': 2,
      '4': 2,
      '5': 3,
      '6': 2,
      '7': 2,
      '8': 1,
      '9': -1,
      '10': -3,
      J: -3,
      Q: -3,
      K: -3,
      A: 0,
    },
  },
  {
    id: 'uston-ss',
    name: 'Uston SS',
    // 5 = +3, 2/3/4/6 = +2, 7 = +1, 9 = -1, tens/A = -2. Unbalanced (deck sum 4).
    description:
      'Unbalanced level-3 system (Uston SS). 5 = +3, 2/3/4/6 = +2, 7 = +1, 9 = −1, tens and aces = −2; 8 neutral. Running count only.',
    balanced: false,
    values: {
      '2': 2,
      '3': 2,
      '4': 2,
      '5': 3,
      '6': 2,
      '7': 1,
      '8': 0,
      '9': -1,
      '10': -2,
      J: -2,
      Q: -2,
      K: -2,
      A: -2,
    },
  },
  {
    id: 'victor-apc',
    name: 'Victor Adv Point',
    // 5 = +3, 2/3/4/6/7 = +2, 9 = -1, tens = -3. Balanced (deck sum 0).
    description:
      'Balanced level-3 system (Victor Advanced Point Count). 5 = +3, 2/3/4/6/7 = +2, 9 = −1, tens = −3; 8 and aces neutral.',
    balanced: true,
    values: {
      '2': 2,
      '3': 2,
      '4': 2,
      '5': 3,
      '6': 2,
      '7': 2,
      '8': 0,
      '9': -1,
      '10': -3,
      J: -3,
      Q: -3,
      K: -3,
      A: 0,
    },
  },
  {
    id: 'zen',
    name: 'Zen Count',
    // 4/5/6 = +2, 2/3/7 = +1, tens = -2, A = -1. Balanced (deck sum 0).
    description:
      'Balanced level-2 system (Zen Count). 4/5/6 = +2, 2/3/7 = +1, tens = −2, aces = −1; 8/9 neutral.',
    balanced: true,
    values: {
      '2': 1,
      '3': 1,
      '4': 2,
      '5': 2,
      '6': 2,
      '7': 1,
      '8': 0,
      '9': 0,
      '10': -2,
      J: -2,
      Q: -2,
      K: -2,
      A: -1,
    },
  },
];

// --- Color-dependent systems (Blackjack Review comparison; tags in
// reference-systems.md). These tag a rank by the card's color, so each carries a
// colorValues override; the scalar values[rank] is the (red+black)/2 average the
// reference table shows, kept so the deck-sum balance gate stays correct. Phase 0
// (cardCountValue / colorValues) makes the engine honor the override. All three
// are unbalanced (deck sum +2) → running-count training only. KISS 1 is omitted:
// its reference "tens = -0.75" implies a per-ten-rank rule we could not reconcile.
const COLOR_SYSTEMS: readonly CountingSystem[] = [
  {
    id: 'red-seven',
    name: 'Red Seven',
    // 2-6 = +1, red 7 = +1 / black 7 = 0 (avg +0.5), tens/A = -1. Unbalanced (deck sum 2).
    description:
      'Unbalanced color-dependent system (Red Seven, Snyder). 2–6 = +1, red 7 = +1 and black 7 = 0, tens and aces = −1; 8/9 neutral. Running count only.',
    balanced: false,
    values: {
      '2': 1,
      '3': 1,
      '4': 1,
      '5': 1,
      '6': 1,
      '7': 0.5,
      '8': 0,
      '9': 0,
      '10': -1,
      J: -1,
      Q: -1,
      K: -1,
      A: -1,
    },
    colorValues: { '7': { red: 1, black: 0 } },
  },
  {
    id: 'kiss-2',
    name: 'KISS 2',
    // black 2 = +1 / red 2 = 0 (avg +0.5), 3-6 = +1, tens = -1. Unbalanced (deck sum 2).
    description:
      'Unbalanced color-dependent system (KISS 2, Renzey). Black 2 = +1 and red 2 = 0, 3–6 = +1, tens = −1; 7/8/9 and aces neutral. Running count only.',
    balanced: false,
    values: {
      '2': 0.5,
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
      A: 0,
    },
    colorValues: { '2': { red: 0, black: 1 } },
  },
  {
    id: 'kiss-3',
    name: 'KISS 3',
    // black 2 = +1 / red 2 = 0 (avg +0.5), 3-7 = +1, tens/A = -1. Unbalanced (deck sum 2).
    description:
      'Unbalanced color-dependent system (KISS 3, Renzey). Black 2 = +1 and red 2 = 0, 3–7 = +1, tens and aces = −1; 8/9 neutral. Running count only.',
    balanced: false,
    values: {
      '2': 0.5,
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
    colorValues: { '2': { red: 0, black: 1 } },
  },
];

// --- Novelty / computer-only systems (Blackjack Review comparison; tags in
// reference-systems.md). Two kinds, both balanced (deck sum 0): computer-only
// counts with extreme or impractically high weights (Griffin Ultimate, Thorp
// Ultimate, Graham 7, Griffin 7) and inverted "opposite of traditional" counts
// (Tek's, Wilson APC) whose running count runs opposite in sign to a normal
// system. Representable and engine-compatible, but unsuitable for real training;
// each description says why. Added under --include-novelty. ---
const NOVELTY_SYSTEMS: readonly CountingSystem[] = [
  {
    id: 'griffin-ultimate',
    name: 'Griffin Ultimate',
    // A=-60, 2=37, 3=45, 4=52, 5=70, 6=46, 7=27, 8=0, 9=-17, tens=-50. Balanced (deck sum 0). Computer-only.
    description:
      'Balanced computer-only system (Griffin Ultimate). Extreme per-rank weights (aces −60 up to fives +70, tens −50) optimized by computer — far too complex to play by hand, included only for completeness.',
    balanced: true,
    values: {
      '2': 37,
      '3': 45,
      '4': 52,
      '5': 70,
      '6': 46,
      '7': 27,
      '8': 0,
      '9': -17,
      '10': -50,
      J: -50,
      Q: -50,
      K: -50,
      A: -60,
    },
  },
  {
    id: 'thorp-ultimate',
    name: 'Thorp Ultimate',
    // A=-9, 2=5, 3=6, 4=8, 5=11, 6=6, 7=4, 8=0, 9=-3, tens=-7. Balanced (deck sum 0). Computer-only.
    description:
      'Balanced computer-only system (Thorp Ultimate). High-resolution weights (5 = +11, 4 = +8, aces = −9, tens = −7, …; 8 neutral) optimized by computer — impractical for human play, included only for completeness.',
    balanced: true,
    values: {
      '2': 5,
      '3': 6,
      '4': 8,
      '5': 11,
      '6': 6,
      '7': 4,
      '8': 0,
      '9': -3,
      '10': -7,
      J: -7,
      Q: -7,
      K: -7,
      A: -9,
    },
  },
  {
    id: 'graham-7',
    name: 'Graham 7',
    // A=-6, 2=4, 3=4, 4=5, 5=7, 6=4, 7=3, 8=0, 9=-1, tens=-5. Balanced (deck sum 0). Impractically high level.
    description:
      'Balanced level-7 system (Graham 7). 2/3/6 = +4, 4 = +5, 5 = +7, 7 = +3, 9 = −1, tens = −5, aces = −6; 8 neutral. An impractically high level for human play, included for completeness.',
    balanced: true,
    values: {
      '2': 4,
      '3': 4,
      '4': 5,
      '5': 7,
      '6': 4,
      '7': 3,
      '8': 0,
      '9': -1,
      '10': -5,
      J: -5,
      Q: -5,
      K: -5,
      A: -6,
    },
  },
  {
    id: 'griffin-7',
    name: 'Griffin 7',
    // A=-6, 2=4, 3=4, 4=5, 5=7, 6=5, 7=3, 8=0, 9=-2, tens=-5. Balanced (deck sum 0). Impractically high level.
    description:
      'Balanced level-7 system (Griffin 7). 2/3 = +4, 4 = +5, 5 = +7, 6 = +5, 7 = +3, 9 = −2, tens = −5, aces = −6; 8 neutral. An impractically high level for human play, included for completeness.',
    balanced: true,
    values: {
      '2': 4,
      '3': 4,
      '4': 5,
      '5': 7,
      '6': 5,
      '7': 3,
      '8': 0,
      '9': -2,
      '10': -5,
      J: -5,
      Q: -5,
      K: -5,
      A: -6,
    },
  },
  {
    id: 'teks',
    name: "Tek's",
    // A=1, 2-7=-1, 8=0, 9=1, tens=1. Balanced (deck sum 0). Inverted ("opposite of traditional").
    description:
      "Balanced inverted level-1 system (Tek's). The mirror image of a normal count: low cards 2–7 = −1, while 9, tens and aces = +1 and 8 is neutral, so the running count runs opposite in sign to Hi-Lo. A curiosity, not a practical advantage system.",
    balanced: true,
    values: {
      '2': -1,
      '3': -1,
      '4': -1,
      '5': -1,
      '6': -1,
      '7': -1,
      '8': 0,
      '9': 1,
      '10': 1,
      J: 1,
      Q: 1,
      K: 1,
      A: 1,
    },
  },
  {
    id: 'wilson-apc',
    name: 'Wilson APC',
    // A=4, 2-9=-1, tens=1. Balanced (deck sum 0). Inverted ("opposite of traditional").
    description:
      'Balanced inverted system (Wilson APC). Another mirror-image count: 2–9 = −1, tens = +1, aces = +4, running opposite in sign to a normal system. A curiosity, not recommended for play.',
    balanced: true,
    values: {
      '2': -1,
      '3': -1,
      '4': -1,
      '5': -1,
      '6': -1,
      '7': -1,
      '8': -1,
      '9': -1,
      '10': 1,
      J: 1,
      Q: 1,
      K: 1,
      A: 4,
    },
  },
];

// Registry of available systems. The original four keep their exported consts
// (the card-counting page imports HI_LO as the default); additional systems are
// discovered purely via this array and verified by id in counting-systems.spec.ts.
export const COUNTING_SYSTEMS: readonly CountingSystem[] = [
  HI_LO,
  KO,
  OMEGA_II,
  WONG_HALVES,
  ...STANDARD_SYSTEMS,
  ...COLOR_SYSTEMS,
  ...NOVELTY_SYSTEMS,
] as const;

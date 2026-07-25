import { Injectable, computed, signal, type Signal } from '@angular/core';

import { DEFAULT_BANKROLL } from '../models/bankroll.model';
import { coerceNumericRecord, readJson, writeJson } from './storage';

export const BANKROLL_KEY = 'blackjack-showdown-bankroll';

// The showdown's chip position. `wagered` is the total put at risk and `net` the
// running result, so a session can be read as "risked 320, up 45" — the numbers a
// bet-sizing drill is actually judged on. `bankroll` is the two combined, kept
// explicitly so a reset is one write.
export interface BankrollState {
  readonly bankroll: number;
  readonly wagered: number;
  readonly net: number;
}

const EMPTY_BANKROLL: BankrollState = {
  bankroll: DEFAULT_BANKROLL,
  wagered: 0,
  net: 0,
};

// Persists the showdown bankroll under its own localStorage key, alongside (not
// inside) ShowdownStatsService: the hand tally is meaningful with betting off, so
// the two stay separable.
@Injectable({ providedIn: 'root' })
export class BankrollService {
  private readonly _state = signal<BankrollState>(this.load());
  readonly state: Signal<BankrollState> = this._state.asReadonly();

  readonly bankroll = computed(() => this._state().bankroll);
  // Out of chips: the caller offers a reset instead of another round.
  readonly bustedOut = computed(() => this._state().bankroll < 1);

  // Settle one hand: `stake` is what it risked and `payout` the net chips it
  // returned (negative on a loss). Recorded together so `wagered` counts the
  // doubled second bet too.
  record(stake: number, payout: number): void {
    const prev = this._state();
    const next: BankrollState = {
      bankroll: prev.bankroll + payout,
      wagered: prev.wagered + stake,
      net: prev.net + payout,
    };
    this._state.set(next);
    this.persist(next);
  }

  reset(): void {
    this._state.set(EMPTY_BANKROLL);
    this.persist(EMPTY_BANKROLL);
  }

  private load(): BankrollState {
    return readJson(BANKROLL_KEY, EMPTY_BANKROLL, (raw) =>
      coerceNumericRecord(raw, EMPTY_BANKROLL),
    );
  }

  private persist(state: BankrollState): void {
    writeJson(BANKROLL_KEY, state);
  }
}

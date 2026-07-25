import { TestBed } from '@angular/core/testing';

import { DEFAULT_BANKROLL } from '../models/bankroll.model';
import { BANKROLL_KEY, BankrollService } from './bankroll.service';

describe('BankrollService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  function service(): BankrollService {
    return TestBed.inject(BankrollService);
  }

  it('starts from the default bankroll with nothing wagered', () => {
    expect(service().state()).toEqual({ bankroll: DEFAULT_BANKROLL, wagered: 0, net: 0 });
  });

  it('adds a winning payout to the bankroll and counts the stake as wagered', () => {
    const s = service();
    s.record(10, 10);
    expect(s.state()).toEqual({ bankroll: DEFAULT_BANKROLL + 10, wagered: 10, net: 10 });
  });

  it('subtracts a loss', () => {
    const s = service();
    s.record(10, -10);
    expect(s.state()).toEqual({ bankroll: DEFAULT_BANKROLL - 10, wagered: 10, net: -10 });
  });

  it('counts a doubled stake as wagered even on a push', () => {
    const s = service();
    s.record(20, 0);
    expect(s.state()).toEqual({ bankroll: DEFAULT_BANKROLL, wagered: 20, net: 0 });
  });

  it('accumulates across hands', () => {
    const s = service();
    s.record(10, 15); // natural
    s.record(5, -5);
    s.record(5, 0);
    expect(s.state()).toEqual({ bankroll: DEFAULT_BANKROLL + 10, wagered: 20, net: 10 });
  });

  it('flags a bust-out once the chips are gone', () => {
    const s = service();
    expect(s.bustedOut()).toBe(false);
    s.record(DEFAULT_BANKROLL, -DEFAULT_BANKROLL);
    expect(s.bankroll()).toBe(0);
    expect(s.bustedOut()).toBe(true);
  });

  it('persists across instances and resets back to the default', () => {
    service().record(25, -25);
    TestBed.resetTestingModule();
    const reloaded = service();
    expect(reloaded.bankroll()).toBe(DEFAULT_BANKROLL - 25);

    reloaded.reset();
    expect(reloaded.state()).toEqual({ bankroll: DEFAULT_BANKROLL, wagered: 0, net: 0 });
    TestBed.resetTestingModule();
    expect(service().bankroll()).toBe(DEFAULT_BANKROLL);
  });

  it('ignores a malformed payload rather than loading a partial bankroll', () => {
    localStorage.setItem(BANKROLL_KEY, JSON.stringify({ bankroll: 100 }));
    expect(service().state()).toEqual({ bankroll: DEFAULT_BANKROLL, wagered: 0, net: 0 });
  });
});

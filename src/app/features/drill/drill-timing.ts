import { InjectionToken } from '@angular/core';

// How long a correct answer's green flash stays before auto-advancing to the
// next hand (~the Doherty threshold). Injectable so specs can shrink it and
// drive the timer deterministically.
export const FLOW_ADVANCE_DELAY_MS = new InjectionToken<number>('FLOW_ADVANCE_DELAY_MS', {
  factory: () => 500,
});

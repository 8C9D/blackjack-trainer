import { TestBed } from '@angular/core/testing';

import { FLOW_ADVANCE_DELAY_MS } from './drill-timing';

describe('FLOW_ADVANCE_DELAY_MS', () => {
  it('defaults to a half-second feedback flash outside tests', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(FLOW_ADVANCE_DELAY_MS)).toBe(500);
  });
});

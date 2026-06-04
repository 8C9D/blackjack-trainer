import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { Card, Rank, Suit } from '../../core/models/card.model';
import { BlackjackTableComponent } from './blackjack-table.component';

const card = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit });

function createTable(
  player: readonly [Card, Card],
  dealerUpcard: Card,
): ComponentFixture<BlackjackTableComponent> {
  const fixture = TestBed.createComponent(BlackjackTableComponent);
  fixture.componentRef.setInput('player', player);
  fixture.componentRef.setInput('dealerUpcard', dealerUpcard);
  fixture.detectChanges();
  return fixture;
}

// Card images render as <img> with an `alt`. Reading the alt confirms which
// card landed in each slot; we assert on the rank (and the stable "Face-down
// card" label) rather than the full alt string so we are not re-testing the
// card-image src/alt mapping covered in card-image.component.spec.ts.
function altsIn(root: Element): string[] {
  return Array.from(root.querySelectorAll('img.card-image')).map(
    (img) => (img as HTMLImageElement).getAttribute('alt') ?? '',
  );
}

function section(
  fixture: ComponentFixture<BlackjackTableComponent>,
  label: string,
): HTMLElement {
  return fixture.nativeElement.querySelector(`[aria-label="${label}"]`) as HTMLElement;
}

describe('BlackjackTableComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BlackjackTableComponent],
    });
  });

  it('creates and renders labelled dealer and player rows (smoke)', () => {
    const fixture = createTable([card('A'), card('K')], card('7'));
    expect(fixture.componentInstance).toBeTruthy();
    expect(section(fixture, 'Dealer hand')).not.toBeNull();
    expect(section(fixture, 'Player hand')).not.toBeNull();
  });

  it('lays out two card images in each of the dealer and player rows', () => {
    const fixture = createTable([card('A'), card('K')], card('7'));
    expect(altsIn(section(fixture, 'Dealer hand')).length).toBe(2);
    expect(altsIn(section(fixture, 'Player hand')).length).toBe(2);
  });

  it('shows the dealer up-card face-up next to a single face-down hole card', () => {
    const fixture = createTable([card('A'), card('K')], card('7', 'diamonds'));
    const [upcard, hole] = altsIn(section(fixture, 'Dealer hand'));
    expect(upcard).toContain('7');
    expect(upcard).not.toBe('Face-down card');
    expect(hole).toBe('Face-down card');
  });

  it('renders both player cards from the player input in order', () => {
    const fixture = createTable([card('A'), card('8', 'hearts')], card('7'));
    const [first, second] = altsIn(section(fixture, 'Player hand'));
    expect(first).toContain('A');
    expect(second).toContain('8');
  });

  it('updates the rendered cards when the inputs change', () => {
    const fixture = createTable([card('2'), card('3')], card('4'));
    expect(altsIn(section(fixture, 'Player hand'))[0]).toContain('2');

    fixture.componentRef.setInput('player', [card('K'), card('Q')]);
    fixture.componentRef.setInput('dealerUpcard', card('9'));
    fixture.detectChanges();

    expect(altsIn(section(fixture, 'Player hand'))[0]).toContain('K');
    expect(altsIn(section(fixture, 'Dealer hand'))[0]).toContain('9');
  });

  it('always keeps exactly one face-down hole card regardless of the deal', () => {
    const fixture = createTable([card('5'), card('5')], card('10'));
    const allAlts = altsIn(fixture.nativeElement);
    expect(allAlts.filter((a) => a === 'Face-down card').length).toBe(1);
  });
});

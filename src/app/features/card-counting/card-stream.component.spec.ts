import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { Card, Rank, Suit } from '../../core/models/card.model';
import { CardStreamComponent } from './card-stream.component';

const card = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit });

function createStream(
  overrides: Partial<{
    currentCard: Card | null;
    currentIndex: number;
    totalCards: number;
    showProgress: boolean;
  }> = {},
): ComponentFixture<CardStreamComponent> {
  const fixture = TestBed.createComponent(CardStreamComponent);
  const ref = fixture.componentRef;
  if (overrides.currentCard !== undefined) ref.setInput('currentCard', overrides.currentCard);
  if (overrides.currentIndex !== undefined) ref.setInput('currentIndex', overrides.currentIndex);
  if (overrides.totalCards !== undefined) ref.setInput('totalCards', overrides.totalCards);
  if (overrides.showProgress !== undefined) ref.setInput('showProgress', overrides.showProgress);
  fixture.detectChanges();
  return fixture;
}

// The card renders as an <img> with an `alt`. Reading the alt confirms which
// card is shown; we assert on the rank (and the stable "Face-down card" label)
// rather than the full alt/src string so we are not re-testing the mapping
// covered in card-image.component.spec.ts.
function cardAlt(fixture: ComponentFixture<CardStreamComponent>): string {
  const img = fixture.nativeElement.querySelector('img.card-image') as HTMLImageElement | null;
  return img?.getAttribute('alt') ?? '';
}

function progress(fixture: ComponentFixture<CardStreamComponent>): HTMLElement | null {
  return fixture.nativeElement.querySelector('.stream__progress');
}

describe('CardStreamComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CardStreamComponent],
    });
  });

  it('creates and renders the labelled card-stream region (smoke)', () => {
    const fixture = createStream();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[aria-label="Card stream"]')).not.toBeNull();
  });

  it('renders the current card face-up from the currentCard input', () => {
    const fixture = createStream({ currentCard: card('A') });
    expect(cardAlt(fixture)).toContain('A');
    expect(cardAlt(fixture)).not.toBe('Face-down card');
  });

  it('shows a face-down placeholder when there is no current card (empty stream)', () => {
    const fixture = createStream({ currentCard: null });
    expect(cardAlt(fixture)).toBe('Face-down card');
    // Still renders the region cleanly rather than collapsing to nothing.
    expect(fixture.nativeElement.querySelector('[aria-label="Card stream"]')).not.toBeNull();
  });

  it('updates the rendered card as the stream advances to a new currentCard', () => {
    const fixture = createStream({ currentCard: card('2') });
    expect(cardAlt(fixture)).toContain('2');

    fixture.componentRef.setInput('currentCard', card('K', 'hearts'));
    fixture.detectChanges();
    expect(cardAlt(fixture)).toContain('K');
  });

  it('renders a 1-based "Card X of Y" position from currentIndex/totalCards', () => {
    const fixture = createStream({ currentCard: card('5'), currentIndex: 2, totalCards: 5 });
    expect(progress(fixture)?.textContent).toContain('Card 3 of 5');
  });

  it('clamps the displayed position so it never exceeds the total', () => {
    const fixture = createStream({ currentCard: card('5'), currentIndex: 99, totalCards: 5 });
    expect(progress(fixture)?.textContent).toContain('Card 5 of 5');
  });

  it('hides the progress label when showProgress is false', () => {
    const fixture = createStream({
      currentCard: card('5'),
      currentIndex: 0,
      totalCards: 5,
      showProgress: false,
    });
    expect(progress(fixture)).toBeNull();
  });

  it('marks the progress label as a polite live region for screen readers', () => {
    const fixture = createStream({ currentCard: card('5'), totalCards: 3 });
    expect(progress(fixture)?.getAttribute('aria-live')).toBe('polite');
  });
});

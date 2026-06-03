import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { Card } from '../core/models/card.model';
import { CardImageComponent } from './card-image.component';

const BACK_SRC = 'cards/BLUE_BACK.svg';

function createCardImage(
  overrides: Partial<{ card: Card | null; faceDown: boolean }> = {},
): ComponentFixture<CardImageComponent> {
  const fixture = TestBed.createComponent(CardImageComponent);
  const ref = fixture.componentRef;
  if (overrides.card !== undefined) ref.setInput('card', overrides.card);
  if (overrides.faceDown !== undefined) ref.setInput('faceDown', overrides.faceDown);
  fixture.detectChanges();
  return fixture;
}

function img(fixture: ComponentFixture<CardImageComponent>): HTMLImageElement {
  return fixture.nativeElement.querySelector('img.card-image') as HTMLImageElement;
}

// getAttribute keeps the raw relative path; img.src would be resolved to an
// absolute URL by jsdom.
function srcOf(fixture: ComponentFixture<CardImageComponent>): string {
  return img(fixture).getAttribute('src') ?? '';
}

describe('CardImageComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CardImageComponent],
    });
  });

  it('renders an img for a face-up card with the cardsJS filename and a descriptive alt (smoke)', () => {
    const fixture = createCardImage({ card: { rank: 'A', suit: 'spades' } });
    expect(img(fixture)).not.toBeNull();
    expect(srcOf(fixture)).toBe('cards/AS.svg');
    expect(img(fixture).getAttribute('alt')).toBe('A♠ (A of spades)');
  });

  it('maps each suit to its cardsJS filename code', () => {
    const cases: ReadonlyArray<[Card, string]> = [
      [{ rank: 'A', suit: 'spades' }, 'cards/AS.svg'],
      [{ rank: 'K', suit: 'hearts' }, 'cards/KH.svg'],
      [{ rank: '7', suit: 'diamonds' }, 'cards/7D.svg'],
      [{ rank: '10', suit: 'clubs' }, 'cards/10C.svg'],
    ];
    for (const [card, expected] of cases) {
      expect(srcOf(createCardImage({ card }))).toBe(expected);
    }
  });

  it('does not apply face-down styling to a normal face-up card', () => {
    const fixture = createCardImage({ card: { rank: '5', suit: 'hearts' } });
    expect(img(fixture).classList.contains('card-image--face-down')).toBe(false);
  });

  it('falls back to the blue back with a "No card" alt when no card is provided', () => {
    const fixture = createCardImage();
    expect(srcOf(fixture)).toBe(BACK_SRC);
    expect(img(fixture).getAttribute('alt')).toBe('No card');
  });

  it('renders the blue back, face-down styling and alt when faceDown is true', () => {
    const fixture = createCardImage({ card: { rank: 'A', suit: 'spades' }, faceDown: true });
    expect(srcOf(fixture)).toBe(BACK_SRC);
    expect(img(fixture).getAttribute('alt')).toBe('Face-down card');
    expect(img(fixture).classList.contains('card-image--face-down')).toBe(true);
  });

  it('marks the image non-draggable to avoid drag ghosts', () => {
    const fixture = createCardImage({ card: { rank: 'A', suit: 'spades' } });
    expect(img(fixture).getAttribute('draggable')).toBe('false');
  });
});

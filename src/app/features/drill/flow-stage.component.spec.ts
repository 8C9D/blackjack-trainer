import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { Card } from '../../core/models/card.model';
import { FlowStageComponent } from './flow-stage.component';

const card = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

@Component({
  imports: [FlowStageComponent],
  template: `
    <app-flow-stage [player]="player()" [dealer]="dealer()">
      <p class="question">What is the play?</p>
    </app-flow-stage>
  `,
})
class HostComponent {
  readonly player = signal<readonly Card[]>([card('8', 'spades'), card('8', 'hearts')]);
  readonly dealer = signal(card('6', 'clubs'));
}

function create(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('FlowStageComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  it('groups and labels the dealer upcard for assistive technology', () => {
    const { fixture } = create();
    const dealer = fixture.nativeElement.querySelector('.stage__dealer') as HTMLElement;
    expect(dealer.getAttribute('role')).toBe('group');
    expect(dealer.getAttribute('aria-label')).toBe('Dealer upcard');
    expect(dealer.querySelector('img')?.alt).toContain('6 of clubs');
  });

  it('groups and labels the player hand for assistive technology', () => {
    const { fixture } = create();
    const hand = fixture.nativeElement.querySelector('.stage__hand') as HTMLElement;
    expect(hand.getAttribute('role')).toBe('group');
    expect(hand.getAttribute('aria-label')).toBe('Your hand');
    expect(hand.querySelectorAll('img')).toHaveLength(2);
  });

  it('renders duplicate cards independently because drills deal with replacement', () => {
    const { fixture, host } = create();
    host.player.set([card('A', 'spades'), card('A', 'spades')]);
    fixture.detectChanges();
    const images = fixture.nativeElement.querySelectorAll('.stage__hand img');
    expect(images).toHaveLength(2);
    expect(images[0].getAttribute('src')).toBe('cards/AS.svg');
    expect(images[1].getAttribute('src')).toBe('cards/AS.svg');
  });

  it('marks a played-out hand as deep only after the opening two cards', () => {
    const { fixture, host } = create();
    const hand = () => fixture.nativeElement.querySelector('.stage__hand') as HTMLElement;
    expect(hand().classList.contains('stage__hand--deep')).toBe(false);
    host.player.set([...host.player(), card('2', 'diamonds')]);
    fixture.detectChanges();
    expect(hand().classList.contains('stage__hand--deep')).toBe(true);
  });

  it('projects the trainer-specific question or feedback beneath the hand', () => {
    const { fixture } = create();
    expect(fixture.nativeElement.querySelector('.question')?.textContent).toBe('What is the play?');
  });
});

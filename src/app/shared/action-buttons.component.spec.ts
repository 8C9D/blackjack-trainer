import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { Action } from '../core/models/strategy.model';
import { ActionButtonsComponent } from './action-buttons.component';

// The order the component renders its buttons in. Declared here as the
// expected contract so a click on button N can be mapped back to the Action
// it must emit without reaching into the component's protected `order`.
const ORDER: readonly Action[] = ['H', 'S', 'D', 'P', 'SUR', 'INS'];

function createButtons(disabled?: boolean): ComponentFixture<ActionButtonsComponent> {
  const fixture = TestBed.createComponent(ActionButtonsComponent);
  if (disabled !== undefined) fixture.componentRef.setInput('disabled', disabled);
  fixture.detectChanges();
  return fixture;
}

function buttons(fixture: ComponentFixture<ActionButtonsComponent>): HTMLButtonElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll('.actions__button'));
}

describe('ActionButtonsComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ActionButtonsComponent],
    });
  });

  it('creates and renders one button per action in a labelled actions region (smoke)', () => {
    const fixture = createButtons();
    expect(fixture.componentInstance).toBeTruthy();
    const region = fixture.nativeElement.querySelector('.actions') as HTMLElement;
    expect(region.getAttribute('aria-label')).toBe('Player actions');
    expect(buttons(fixture).length).toBe(ORDER.length);
  });

  it('renders the human-readable action labels in order', () => {
    const rendered = buttons(createButtons());
    const expected = ['Hit', 'Stand', 'Double', 'Split', 'Surrender', 'Insurance'];
    expected.forEach((label, i) => {
      expect(rendered[i].textContent).toContain(label);
    });
  });

  it('renders the uppercase hotkey hint alongside each label', () => {
    const rendered = buttons(createButtons());
    const hints = ['[H]', '[S]', '[D]', '[P]', '[R]', '[I]'];
    hints.forEach((hint, i) => {
      expect(rendered[i].textContent).toContain(hint);
    });
  });

  it('renders type="button" so the controls never submit a surrounding form', () => {
    for (const button of buttons(createButtons())) {
      expect(button.getAttribute('type')).toBe('button');
    }
  });

  it('leaves every button enabled by default', () => {
    expect(buttons(createButtons()).every((b) => !b.disabled)).toBe(true);
  });

  it('disables every button when [disabled] is true', () => {
    expect(buttons(createButtons(true)).every((b) => b.disabled)).toBe(true);
  });

  it('re-enables the buttons when [disabled] flips back to false', () => {
    const fixture = createButtons(true);
    fixture.componentRef.setInput('disabled', false);
    fixture.detectChanges();
    expect(buttons(fixture).every((b) => !b.disabled)).toBe(true);
  });

  it('emits the matching Action when each button is clicked', () => {
    const fixture = createButtons();
    const emitted: Action[] = [];
    fixture.componentInstance.action.subscribe((a) => emitted.push(a));
    for (const button of buttons(fixture)) button.click();
    expect(emitted).toEqual([...ORDER]);
  });

  it('does not emit while disabled (a disabled button swallows the click)', () => {
    const fixture = createButtons(true);
    let emitted = 0;
    fixture.componentInstance.action.subscribe(() => (emitted += 1));
    buttons(fixture)[0].click();
    expect(emitted).toBe(0);
  });
});

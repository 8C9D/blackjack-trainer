import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { AdvantageFormComponent } from './advantage-form.component';

function createForm(): ComponentFixture<AdvantageFormComponent> {
  const fixture = TestBed.createComponent(AdvantageFormComponent);
  fixture.detectChanges();
  return fixture;
}

describe('AdvantageFormComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AdvantageFormComponent] });
  });

  it('renders the question and both call buttons', () => {
    const fixture = createForm();
    expect(fixture.nativeElement.textContent).toContain('Do you have the advantage?');
    const buttons = fixture.nativeElement.querySelectorAll('.advantage__button');
    expect(buttons.length).toBe(2);
  });

  it('does not reveal the key count itself — recalling it is the drill', () => {
    const fixture = createForm();
    expect(fixture.nativeElement.textContent).not.toMatch(/[+-]\d/);
  });

  it('emits true for Yes and false for No on click', () => {
    const fixture = createForm();
    const calls: boolean[] = [];
    fixture.componentInstance.answer.subscribe((v) => calls.push(v));
    const [yes, no] = Array.from(
      fixture.nativeElement.querySelectorAll('.advantage__button'),
    ) as HTMLButtonElement[];
    yes.click();
    no.click();
    expect(calls).toEqual([true, false]);
  });

  it('answers with the Y and N keys', () => {
    const fixture = createForm();
    const calls: boolean[] = [];
    fixture.componentInstance.answer.subscribe((v) => calls.push(v));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'N' }));
    expect(calls).toEqual([true, false]);
  });

  it('ignores other keys and modified chords', () => {
    const fixture = createForm();
    const calls: boolean[] = [];
    fixture.componentInstance.answer.subscribe((v) => calls.push(v));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', metaKey: true }));
    expect(calls).toEqual([]);
  });
});

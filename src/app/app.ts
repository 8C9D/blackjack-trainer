import { Component } from '@angular/core';

import { BasicStrategyPageComponent } from './features/basic-strategy/basic-strategy-page.component';

@Component({
  selector: 'app-root',
  imports: [BasicStrategyPageComponent],
  template: `<app-basic-strategy-page />`,
})
export class App {}

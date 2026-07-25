import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ThemeService } from './core/services/theme.service';

// The Flow shell is deliberately bare: no navigation chrome anywhere — the
// home screen's primary action is the app's entire information architecture.
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styleUrl: './app.scss',
})
export class App {
  // The shell is the only thing guaranteed to exist for the whole session, so
  // it owns the theme service's lifetime; nothing else needs to inject it.
  protected readonly theme = inject(ThemeService);
}

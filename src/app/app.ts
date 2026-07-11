import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

// The Flow shell is deliberately bare: no navigation chrome anywhere — the
// home screen's primary action is the app's entire information architecture.
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styleUrl: './app.scss',
})
export class App {}

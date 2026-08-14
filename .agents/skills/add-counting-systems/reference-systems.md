# Card Counting Systems — Authoritative Reference

Source: Blackjack Review, "Card Counting System Comparisons"  
<https://www.blackjackreview.com/wp/encyclopedia/card-counting-system-comparisons/>  
Captured from a local copy of that page on 2026-06-07 (the live page could not be fetched).

Card order is **A 2 3 4 5 6 7 8 9 10** (10 = 10/J/Q/K). `Deck Sum` is the page's
`SUM = (A+2+…+9)×4 + (T×16)` — **identical to this app's `fullDeckSum`** — so
`Deck Sum = 0` ⟺ `balanced: true`. BC = betting correlation, PE = playing
efficiency, IC = insurance correlation. Never copy a tag from this file into code
without re-checking the deck sum.

| System | A | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | BC | PE | IC | Deck Sum | Balanced | Note |
|--------|--:|--:|--:|--:|--:|--:|--:|--:|--:|---:|---|---|---|--:|:--:|------|
| AceMT | -1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | -1 | .89 | .49 | .84 | -20 | no | Unbalanced |
| AWK | -2 | 1 | 1 | 1 | 2 | 1 | 0 | 0 | 0 | -1 | .96 | .4 | .60 | 0 | yes |  |
| Ambition (Courter/Tibbetts) | -1 | 1 | 1 | 1 | 1 | 1 | .5 | 0 | -.5 | -1 | .99 | .55 | .74 | 0 | yes |  |
| Ambition-U | -.5 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | -1 | .95 | .57 | .82 | 2 | no | Unbalanced |
| Andersen (Reppert) | -2 | 1 | 1 | 1 | 2 | 1 | 1 | 0 | -1 | -1 | .97 | .45 | .57 | 0 | yes |  |
| Archer (Goldberg, Hecher, One-Two / J.Noir) | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | -2 | .72 | .61 | 1.0 | 4 | no | Unbalanced Ten Count |
| BRH-0 | -2 | 2 | 2 | 2 | 2 | 2 | 1 | 0 | 0 | -2 | .98 | .54 | .78 | 4 | no | Unbalanced |
| BRH-I | -2 | 1 | 2 | 2 | 3 | 2 | 1 | 0 | 0 | -2 | .99 | .56 | .76 | 4 | no | Unbalanced |
| BRH-II | 0 | 1 | 1 | 2 | 2 | 2 | 1 | 0 | 0 | -2 | .91 | .67 | .90 | 4 | no | Unbalanced |
| Bushido | -1 | 2 | 2 | 2 | 2 | 2 | 1 | 0 | 0 | -2 | .97 | .6 | .84 | 8 | no | Unbalanced |
| CAC2 | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | — |  |
| Canfield Expert | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 0 | -1 | -1 | .87 | .63 | .76 | 0 | yes |  |
| C-K or Precision Count (Cant / Keen) | -1 | 1 | 2 | 2 | 2 | 2 | 1 | 0 | -1 | -2 | .97 | .62 | .80 | 0 | yes |  |
| C-R (Chambliss, Roginski) | -1 | .5 | 1 | 1 | 1 | 1 | .5 | 0 | 0 | -1 | .98 | .56 | .78 | 0 | yes |  |
| DHM (Gordon) | 0 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | -1 | .86 | .56 | .85 | 0 | yes |  |
| DMPro (Sharp) | -2 | 1 | 2 | 2 | 3 | 2 | 1 | 0 | -1 | -2 | .99 | .57 | .72 | 0 | yes | Wong Halves x 2 |
| EBJ II | -2 | 2 | 2 | 2 | 2 | 2 | 1 | 0 | -1 | -2 | .99 | .55 | .74 | 0 | yes |  |
| EBJ II-U | -2 | 2 | 2 | 2 | 2 | 2 | 1 | 0 | 0 | -2 | .98 | .54 | .78 | 4 | no | Unbalanced |
| EBJ III | -2 | 1 | 2 | 2 | 3 | 2 | 1 | 0 | -1 | -2 | .99 | .56 | .72 | 0 | yes |  |
| EBJ III-U | -2 | 2 | 2 | 2 | 3 | 2 | 1 | 0 | -1 | -2 | .99 | .55 | .73 | 4 | no | Unbalanced |
| Graham 2 | -2 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | -1 | .96 | .42 | .64 | 0 | yes |  |
| Graham 7 | -6 | 4 | 4 | 5 | 7 | 4 | 3 | 0 | -1 | -5 | 1.0 | .54 | .73 | 0 | yes |  |
| Griffin | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 0 | 0 | -1 | .84 | .64 | .85 | 0 | yes |  |
| Griffin 3 | 0 | 1 | 2 | 2 | 3 | 2 | 2 | 1 | -1 | -3 | .90 | .69 | .90 | 0 | yes |  |
| Griffin 4 | 0 | 1 | 2 | 3 | 4 | 3 | 3 | 1 | -1 | -4 | .90 | .69 | .90 | 0 | yes |  |
| Griffin 5 | 0 | 2 | 2 | 4 | 5 | 4 | 3 | 1 | -1 | -5 | .91 | .69 | .91 | 0 | yes |  |
| Griffin 7 | -6 | 4 | 4 | 5 | 7 | 5 | 3 | 0 | -2 | -5 | 1.0 | .54 | .72 | 0 | yes |  |
| Griffin Ultimate | -60 | 37 | 45 | 52 | 70 | 46 | 27 | 0 | -17 | -50 | 1.0 | .54 | .72 | 0 | yes | Only a computer could play this :-) |
| Hi-Lo (Dubner, Revere Plus-Minus, Braun, Wong, Thorp, Extreme) | -1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | -1 | .97 | .51 | .76 | 0 | yes |  |
| Hi-Opt I (Austin, Einstein, Humble) | 0 | 0 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | -1 | .88 | .61 | .85 | 0 | yes |  |
| Hi-Opt II, Accu-Count, Humble | 0 | 1 | 1 | 2 | 2 | 1 | 1 | 0 | 0 | -2 | .91 | .67 | .91 | 0 | yes |  |
| HNF | 1 | 1 | 1 | 2 | 2 | 1 | 1 | 0 | 0 | -2 | .83 | .67 | .93 | 4 | no | Unbalanced |
| J. Noir Count | -2 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | -2 | .89 | .49 | .84 | -8 | no | Unbalanced |
| KISS 1 | 0 | .5 | 0 | 1 | 1 | 1 | 0 | 0 | 0 | -.75 | .87 | .58 | .81 | 2 | no | Unbalanced |
| KISS 2 | 0 | .5 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | -1 | .90 | .62 | .87 | 2 | no | Unbalanced |
| KISS 3 | -1 | .5 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | -1 | .97 | .56 | .78 | 2 | no | Unbalanced |
| KO (T-Hop Basic, ESP-U) | -1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | -1 | .98 | .55 | .78 | 4 | no | Unbalanced |
| Lima | -1 | 0 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | .82 | .27 | .34 | 16 | no | Unbalanced |
| Mentor (Renzey) | -1 | 1 | 2 | 2 | 2 | 2 | 1 | 0 | -1 | -2 | .97 | .62 | .80 | 0 | yes |  |
| Olsen TruCount | -1 | 1 | 1 | 1 | 2 | 1 | .5 | 0 | .5 | -1 | .96 | .52 | .76 | 8 | no | Unbalanced |
| Omega II, Canfield Master, Griffin 2 | 0 | 1 | 1 | 2 | 2 | 2 | 1 | 0 | -1 | -2 | .92 | .67 | .85 | 0 | yes |  |
| Red Seven (Snyder) | -1 | 1 | 1 | 1 | 1 | 1 | .5 | 0 | 0 | -1 | .98 | .54 | .78 | 2 | no | Unbalanced |
| Red Zen (Linsenmeyer) | -1 | .5 | 2 | 2 | 2 | 2 | .5 | 0 | 0 | -2 | .97 | .62 | .85 | 0 | yes |  |
| Revere Five-Count | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | .43 | .15 | .19 | 4 | no | Unbalanced |
| Revere Plus-Minus | 0 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | -1 | -1 | .89 | .59 | .76 | 0 | yes |  |
| Revere Point Count | -2 | 1 | 2 | 2 | 2 | 2 | 1 | 0 | 0 | -2 | .98 | .56 | .78 | 0 | yes |  |
| Silver Fox (Systems Research, Ita/Green Fountain, Revere) | -1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | -1 | -1 | .96 | .54 | .69 | 0 | yes | Revere claimed he used this count in 1954 |
| Tek’s | 1 | -1 | -1 | -1 | -1 | -1 | -1 | 0 | 1 | 1 | .96 | .54 | .69 | 0 | yes | Opposite of traditional |
| T-Hop 1 (Hopper) | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | -1 | .88 | .65 | .87 | 4 | no | Unbalanced |
| T-Hop 2 (Hopper) | 0 | 1 | 1 | 2 | 2 | 2 | 1 | 0 | 0 | -2 | .91 | .67 | .90 | 4 | no | Unbalanced |
| Thorp Ultimate | -9 | 5 | 6 | 8 | 11 | 6 | 4 | 0 | -3 | -7 | 1.0 | .53 | .70 | 0 | yes | Only a computer could play this :-) |
| Tri-Level | -2 | 1 | 1 | 1 | 2 | 1 | 1 | 0 | -1 | -1 | .97 | .45 | .57 | 0 | yes | Why? Hi-Lo gives the same BC and better PE and IC. |
| UBZ II (George C) | -1 | 1 | 2 | 2 | 2 | 2 | 1 | 0 | 0 | -2 | .94 | .61 | .82 | 4 | no | Unbalanced |
| Uston Ace-Five | -1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | .54 | .05 | 0.0 | 0 | yes |  |
| Uston Adv Plus-Minus | -1 | 0 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | -1 | .95 | .55 | .76 | 0 | yes |  |
| Uston Adv Point | 0 | 1 | 2 | 2 | 3 | 2 | 2 | 1 | -1 | -3 | .90 | .69 | .90 | 0 | yes |  |
| Uston SS Count | -2 | 2 | 2 | 2 | 3 | 2 | 1 | 0 | -1 | -2 | .99 | .56 | .73 | 4 | no | Unbalanced |
| Victor Adv Point | 0 | 2 | 2 | 2 | 3 | 2 | 2 | 0 | -1 | -3 | .92 | .68 | .89 | 0 | yes |  |
| Wilson APC | 4 | -1 | -1 | -1 | -1 | -1 | -1 | -1 | -1 | 1 | .80 | .21 | .45 | 0 | yes | Opposite of traditional |
| Wong Halves | -1 | .5 | 1 | 1 | 1.5 | 1 | .5 | 0 | -.5 | -1 | .99 | .57 | .72 | 0 | yes | See DMPro |
| Zen Count | -1 | 1 | 1 | 2 | 2 | 2 | 1 | 0 | 0 | -2 | .96 | .63 | .85 | 0 | yes |  |

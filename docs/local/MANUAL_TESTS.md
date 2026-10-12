# Manual tests — item stacking (max 5), 2 distinct colored effect cards, persistent pickups with step-off re-entry (2026-10-12)

Start the dev loop: `npm run dev` (Bun server on port 3332, Vite client on http://localhost:3331).
Automated (`bun test` — 166 passing tests), linter (`eslint`), server `tsc`, und Production-Build (`npm run build`) sind grün.
Folgendes im Browser prüfen (je 2 Fenster zum Vergleichen):

## 1. No bots & smaller map

- [ ] Keine Bot-Spieler auf dem Feld, keine `(Bot)`-Einträge in der Spielerliste.
- [ ] Chat-Kommandos `/spawn` und `/clearbots` sind entfernt und werden als normaler Chat gesendet.
- [ ] Kompakte Map: Engagements fühlen sich eng an, Tritte ins Leere (ewiges Laufen ohne Gegner) sind selten.
- [ ] Match-Start teleportiert auf die beiden Tees nahe der Mitte.

## 2. Effect cards & Stacking im Menü

- [ ] `⚙ MENU (ESC)` öffnen, Tab `⛳ Items` wählen: 10 Items in 3 Slots (ball/club/outfit) mit Name + Beschreibung sichtbar. Jedes Item besitzt links einen farbigen Akzentstreifen und einen farbigen Slot-Tag entsprechend seiner Item-Farbe.
- [ ] `Cannonball` → `EQUIP`: Button wird grün (`EQUIPPED`), andere Ball-Items bleiben auf `EQUIP` (1 pro Slot).
- [ ] Erneut klicken: Unequip, Button zurück auf `EQUIP`. Menü-Klicks stacken niemals über 1 hinaus.
- [ ] Menü schließen, Seite neu laden, Menü öffnen: Ausrüstung ist noch da (localStorage-Persistenz).
- [ ] Stack-Indikator: Bei mehrfach gesammelten Items zeigt das Menü ein goldenes `x2` bis `x5` Batch-Label neben dem Item-Namen.
- [ ] Skalierte Effekt-Texte: Bei `x2` bis `x5` skalieren Multiplikatoren (mult^n) und Additionen (add*n) sichtbar im Text.
- [ ] `MAX`-Pill: Items, deren Effekte am `STAT_LIMITS`-Cap anschlagen, zeigen ein gut sichtbares oranges `[MAX]`-Badge.
- [ ] `DROP`-Button: Klick auf `DROP` dekrementiert um 1 Stack (z. B. x5 ➔ x4 ➔ ... ➔ x1). Erst bei 0 Stacks wird das Item aus dem Inventar entfernt und der Slot geleert.

## 3. Physics & Damage

- [ ] Fenster 1: `Driver X` ausrüsten, voll aufladen (`Space`), Marker-Weite merken. Fenster 2 ohne Item: Driver-X-Flug ist deutlich weiter (ca. +40 %).
- [ ] `Curve King` + volle Ladung mit Spin (`A`/`D` beim Laden): Ball kurvt sichtbar seitlich.
- [ ] `Wrecker` vs. Mitspieler: Knockdown-Blutfleck bleibt ca. doppelt so lang (~3 s statt 1,5 s).
- [ ] `Tank Suit`-Opfer vs. normaler Schuss: Knockdown deutlich kürzer (Resistenz).

## 4. Size & Color

- [ ] `Cannonball`: eigener Ball sichtbar größer + dunkler Ring; `Marble Mini`: sichtbar kleiner.
- [ ] `Swift Tee` / `Tank Suit`: eigene Figur sichtbar schmaler/größer.
- [ ] `Titan Ball (Größen-Skalierung)`: Bei jedem Betreten wächst die Spielfigur deutlich an (1x: 1.38x, 2x: 1.9x, 3x: 2.6x, 4x: 3.6x, 5x: 5.0x Riesengestalt). Auch der eigene Ball wächst bis auf das ~7.6-fache heran.
- [ ] Namensschild, Chat-Bubble und Schlagladebalken wandern automatisch mit der Figurenhöhe mit und schweben sauber über dem Kopf.
- [ ] `Sniper`: Treffer-Ring (Range Indicator) um den Spieler ist sichtbar größer.
- [ ] Mit `Driver X` laden: Lande-Marker liegt weiter weg als ohne Item.
- [ ] Zweites Fenster: fremde Ballgröße, -farbe und Spielergröße sind ebenfalls sichtbar (Server-Sync).

## 5. Map pickups (2 Distinct Colored Effect Cards & Stacking bis 5)

- [ ] 200 units über den Tees befinden sich genau 2 farbige Kreise:
  - Links: **Titan Ball** in Electric Blue (`#3b82f6`) mit blauem schwebenden Text, ausgerichtet an Bahn 1.
  - Rechts: **Tailwind** in Hot Pink (`#ec4899`) mit pinkem schwebenden Text, ausgerichtet an Bahn 2.
  - Die 3. Karte (Minnow) existiert nicht mehr.
- [ ] **Kein Despawn**: Pickups verschwinden NIEMALS beim Betreten; Kreise und Labels bleiben dauerhaft sichtbar in der Welt.
- [ ] **Erster Eintritt**: Hineinlaufen rüstet das Item aus bzw. packt es ins Inventar (Chat meldet `picked up …!`).
- [ ] **Kein Stand-Still-Farming**: Im Kreis stehenbleiben stackt nicht durch; der Stack bleibt stabil bei 1.
- [ ] **Step-Off & Re-Entry Stacking**: Sobald man aus dem Kreis heraustritt und direkt wieder hineinläuft, erhöht sich der Stack sofort auf `x2` (Chat meldet `... stacked to x2!`).
- [ ] **Stack-Cap bei 5**: Weiteres Heraustreten und Hineinlaufen stackt bis `x5`.
- [ ] **Max Stack Schutz**: Erneutes Betreten bei 5 Stacks meldet `... is already at max stacks!` und belässt den Stack bei 5.
- [ ] **HUD Inventory**: Unten rechts zeigt das Inventar-Panel die Stacks live an (z. B. `▸ Tailwind x5`).

## 6. Light pool in the middle

- [ ] Map center shows a warm, bright pool of light fading softly into the dark field toward the edges.
- [ ] No hard rectangle edges anywhere in the pool; the fade is smooth and radial.

## 7. Player shadows

- [ ] Every player has a soft elliptical shadow (no hard rectangles), offset away from the map center.
- [ ] Near the center the shadow is a short blob under the feet; near the border it is a long streak pointing outward.
- [ ] Knockdown hides the shadow and shows only the blood stain; respawn restores character + shadow.
- [ ] After reconnect (page reload) the shadow is back and correctly oriented.

## 8. Robustheit & no regressions

- [ ] Während Menü offen: keine Bewegung/Schwung möglich; nach Schließen alles normal.
- [ ] Nach Reconnect (Seite neu laden): Loadout und Stacks werden automatisch synchronisiert, kein Snap-Fehler.
- [ ] Characters, animations, name labels, range indicator, and landing marker look unchanged.
- [ ] Camera still follows the local player; movement feels unchanged.


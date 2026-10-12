# Manual tests — no bots, smaller map, effect cards + pickups, lamp & shadows (2026-10-12)

Start the dev loop: `npm run dev` (Bun server on port 3332, Vite client on http://localhost:3331).
Automated (`bun test` — 138 passing tests), linter (`eslint`) und Production-Build (`npm run build`) sind grün.
Folgendes im Browser prüfen (je 2 Fenster zum Vergleichen):

## 1. No bots & smaller map

- [ ] Keine Bot-Spieler auf dem Feld, keine `(Bot)`-Einträge in der Spielerliste.
- [ ] Chat-Kommandos `/spawn` und `/clearbots` sind entfernt und werden als normaler Chat gesendet.
- [ ] Kompakte Map: Engagements fühlen sich eng an, Tritte ins Leere (ewiges Laufen ohne Gegner) sind selten.
- [ ] Match-Start teleportiert auf die beiden Tees nahe der Mitte.

## 2. Effect cards im Menü

- [ ] `⚙ MENU (ESC)` öffnen, Tab `⛳ Items` wählen: 11 Items in 3 Slots (ball/club/outfit) mit Name + Beschreibung sichtbar.
- [ ] `Cannonball` → `EQUIP`: Button wird grün (`EQUIPPED`), andere Ball-Items bleiben auf `EQUIP` (1 pro Slot).
- [ ] Erneut klicken: Unequip, Button zurück auf `EQUIP`.
- [ ] Menü schließen, Seite neu laden, Menü öffnen: Ausrüstung ist noch da (localStorage-Persistenz).
- [ ] Neue Karten vorhanden: `Titan Ball` (ball), `Tailwind` (club), `Minnow` (outfit).

## 3. Physics & Damage

- [ ] Fenster 1: `Driver X` ausrüsten, voll aufladen (`Space`), Marker-Weite merken. Fenster 2 ohne Item: Driver-X-Flug ist deutlich weiter (ca. +40 %).
- [ ] `Curve King` + volle Ladung mit Spin (`A`/`D` beim Laden): Ball kurvt sichtbar seitlich.
- [ ] `Wrecker` vs. Mitspieler: Knockdown-Blutfleck bleibt ca. doppelt so lang (~3 s statt 1,5 s).
- [ ] `Tank Suit`-Opfer vs. normaler Schuss: Knockdown deutlich kürzer (Resistenz).

## 4. Size & Color

- [ ] `Cannonball`: eigener Ball sichtbar größer + dunkler Ring; `Marble Mini`: sichtbar kleiner.
- [ ] `Swift Tee` / `Tank Suit`: eigene Figur sichtbar schmaler/größer.
- [ ] `Sniper`: Treffer-Ring (Range Indicator) um den Spieler ist sichtbar größer.
- [ ] Mit `Driver X` laden: Lande-Marker liegt weiter weg als ohne Item.
- [ ] Zweites Fenster: fremde Ballgröße, -farbe und Spielergröße sind ebenfalls sichtbar (Server-Sync).

## 5. Map pickups

- [ ] 200 units above the map middle there are 3 gold circles side by side (Titan Ball left, Tailwind center, Minnow right).
- [ ] Above each circle floats a white label with the card name and its effect text.
- [ ] Labels track their circles while moving the camera; circles sit flat on the ground.
- [ ] Walking into a circle equips its card (menu Items tab shows it equipped) and announces `picked up …!` in chat.
- [ ] Titan Ball visibly enlarges ball and body; Tailwind makes shots faster but walking slower; Minnow shrinks the body.
- [ ] The second window sees the same circles and the other player's equipped effects.
- [ ] After page reload the circles are still there and can be picked up again.

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
- [ ] Nach Reconnect (Seite neu laden): Loadout wird automatisch re-equipped, kein Snap-Fehler an der Position.
- [ ] Characters, animations, name labels, range indicator, and landing marker look unchanged.
- [ ] Camera still follows the local player; movement feels unchanged.

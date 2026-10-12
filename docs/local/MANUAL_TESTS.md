# Manual tests — Item-System (2026-10-12)

Start the dev loop: `npm run dev` (Bun server on port 3332, Vite client on http://localhost:3331).
Automated (`bun test` — 130 passing tests), linter (`eslint`) und Production-Build (`npm run build`) sind grün. Server-`tsc` hat nur die 5 bereits bekannten Vorab-Fehler (private `snapshot`/`ballSnapshot` in Tests, `roomId` in `Welcome`).
Folgendes im Browser prüfen:

## 1. Items-Tab & Ausrüsten

- [ ] `⚙ MENU (ESC)` öffnen, Tab `⛳ Items` wählen: 8 Items in 3 Slots (ball/club/outfit) mit Name + Beschreibung sichtbar.
- [ ] `Cannonball` → `EQUIP`: Button wird grün (`EQUIPPED`), andere Ball-Items bleiben auf `EQUIP` (1 pro Slot).
- [ ] Erneut klicken: Unequip, Button zurück auf `EQUIP`.
- [ ] Menü schließen, Seite neu laden, Menü öffnen: Ausrüstung ist noch da (localStorage-Persistenz).

## 2. Physics & Damage (je 2 Fenster zum Vergleichen)

- [ ] Fenster 1: `Driver X` ausrüsten, voll aufladen (`Space`), Marker-Weite merken. Fenster 2 ohne Item: Driver-X-Flug ist deutlich weiter (ca. +40 %).
- [ ] `Curve King` + volle Ladung mit Spin (`A`/`D` beim Laden): Ball kurvt sichtbar seitlich.
- [ ] `Wrecker` vs. Bot: Knockdown-Blutfleck bleibt ca. doppelt so lang (~3 s statt 1,5 s).
- [ ] `Tank Suit`-Opfer vs. normaler Schuss: Knockdown deutlich kürzer (Resistenz).

## 3. Size & Color

- [ ] `Cannonball`: eigener Ball sichtbar größer + dunkler Ring; `Marble Mini`: sichtbar kleiner.
- [ ] `Swift Tee` / `Tank Suit`: eigene Figur sichtbar schmaler/größer.
- [ ] `Sniper`: Treffer-Ring (Range Indicator) um den Spieler ist sichtbar größer.
- [ ] Mit `Driver X` laden: Lande-Marker liegt weiter weg als ohne Item.
- [ ] Zweites Fenster: fremde Ballgröße, -farbe und Spielergröße sind ebenfalls sichtbar (Server-Sync).

## 4. Robustheit

- [ ] Während Menü offen: keine Bewegung/Schwung möglich; nach Schließen alles normal.
- [ ] Nach Reconnect (Seite neu laden): Loadout wird automatisch re-equipped, kein Snap-Fehler an der Position.

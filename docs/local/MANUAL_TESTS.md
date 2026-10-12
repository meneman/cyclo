# Manual tests — 16:9 HD Format Arena (Full Width, Top/Bottom Black Bars) (2026-10-12)

Start the dev loop: `npm run dev` (Bun server on port 3332, Vite client on http://localhost:3331).
Automated (`bun test` — 166 passing tests), linter (`eslint`), server `tsc`, und Production-Build (`npm run build`) sind grün.
Folgendes im Browser prüfen (zwei Fenster zum Vergleichen):

## 1. 16:9 HD Format & Full-Width Screen (Volle Breite & schwarze Balken oben/unten)

- [ ] **Volle Breite**: Das Spielfeld ($640 \times 360$, exakt 16:9 HD-Format) erstreckt sich horizontal über die **gesamte Breite des Bildschirms** (linker und rechter Feldrand schließen exakt mit den Bildschirmrändern ab; links und rechts gibt es keine schwarzen Balken).
- [ ] **Schwarze Balken oben und unten**: Bedingt durch den 40°-Kamerawinkel erscheinen oben und unten saubere schwarze Letterbox-Balken (~126px).
- [ ] **UI-Einbettung**: Die UI-Elemente sitzen passgenau in den schwarzen Balken, ohne das Spielfeld zu verdecken:
  - Oben: Scoreboard und HUD sitzen im oberen schwarzen Balken.
  - Unten: ChatBox und Inventarpanel sitzen im unteren schwarzen Balken.
- [ ] **Kamera steht still**: Keine Kamerabewegung beim Laufen.
- [ ] **Kein Zoom**: Feste, scharfe Skalierung (`CAMERA_ZOOM = 3.0`), 1 World Unit = exakt 3 Pixel.

## 2. Spawn & Tees in der Mitte

- [ ] **Erster Join**: Spielfigur spawnt in der Mitte bei $(320, 180)$.
- [ ] **Match-Start**: 1v1-Tees liegen zentral bei $(280, 180)$ und $(360, 180)$.
- [ ] **Item-Pickups**: Titan Ball und Tailwind schweben bei $(220, 110)$ und $(420, 110)$ symmetrisch in der oberen Spielhälfte.

## 3. Aiming, Bälle & Banden

- [ ] **Aiming**: Maus-Zielen via Space richtet die Schlagrichtung exakt auf den Mauszeiger aus.
- [ ] **Banden**: Volle Schläge prallen sauber an den sichtbaren linken/rechten und oberen/unteren Feldrändern ab.

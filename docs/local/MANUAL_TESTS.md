# Manual tests — Stylized Cartoon Look (Cel-Shading, Outlines & Faceted Grass) (2026-10-12)

Start the dev loop: `npm run dev` (Bun server on port 3332, Vite client on http://localhost:3331).
Automated tests (`bun test` — 166 passing), linter (`eslint`), server `tsc`, und Production-Build (`npm run build`) sind grün.
Folgendes im Browser prüfen (zwei Fenster zum Vergleichen):

## 1. Stilisierter Cartoon-Rasen & Licht
- [ ] **Grastextur**: Das Spielfeld zeigt frischen, leuchtend grünen Low-Poly-Faceted-Rasen (`grass_faceted.png`) statt der fotorealistischen Gesteinstextur.
- [ ] **Warme Ausleuchtung**: Helle, freundliche Sonnenbeleuchtung mit weichem Himmelsblau-Ambient.
- [ ] **Feld-Banding**: Der Rasen reagiert sauber auf das Licht mit harmonischen Farbkontrasten.

## 2. Cel-Shading & Comic-Outlines an Golfern & Schlägern
- [ ] **Cel-Shading (Toon Shading)**: Die Spielfiguren (male-casual und female-casual) sowie der Golfschläger zeigen klare, stufige Schattierungsbänder (3-Stufen-Gradient) anstelle von weichem fotorealistischem Glanz.
- [ ] **Comic-Outlines**: Um die Spielfiguren verläuft eine feine, dunkle Comic-Konturlinie, die sich bei Animationen (Idle, Walk, Golfschwung) perfekt mit den Knochen und Gliedmaßen mitbewegt.
- [ ] **Trikotfarben**: Trikot-Farben (inkl. Umfärben im Menü) bleiben kräftig und stechen klar vom Rasen ab.

## 3. Golfbälle & Schatten
- [ ] **Golfball-Look**: Der Golfball hat ein mattes, cel-geshadetes Toon-Finish mit feiner dunkler Silhouette.
- [ ] **Stilisierte Schatten**: Schatten unter den Spielfiguren und Bällen besitzen definierte, saubere Kanten (Cartoon-Cel-Shadow) statt verwaschener Nebelränder.

# Hoops

Ett litet basketspel som bor längst ner på skärmen. Dra i bollen, sikta med pilen och skjut mot korgen. Byggt med Tauri 2 (Rust + TypeScript) för Mac och Windows.

## Köra

```bash
npm install
npm run tauri dev
```

Kräver Node och Rust (`rustup`).

## Spel

- Dra i bollen och släpp för att skjuta. Pilen (eller prickarna) visar banan.
- Håll Shift och dra för att flytta eller kasta bollen.
- Högerklicka på bollen för menyn. Genväg: Ctrl+Option+Cmd+B (Mac) / Ctrl+Alt+Win+B (Windows).

## Ljud

Lägg ljudfiler i `src/assets/sounds/`. Se README där för filnamn.

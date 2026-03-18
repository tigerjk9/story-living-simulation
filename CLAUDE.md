# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # Install dependencies
npm run dev       # Start dev server at http://localhost:3000
npm run build     # Production build
npm run preview   # Preview production build
```

**No `.env` needed.** API key is entered by the user in the UI and stored in `localStorage`.

## Architecture

This is a **vanilla TypeScript + Vite** app — no React. The UI is driven by direct DOM manipulation, not a component framework.

### Key files

- **`index.tsx`** — the entire application logic: global `STATE` object, `ELEMENTS` (DOM references), event handlers, and render functions. This is the main file to edit for behavior changes.
- **`services/geminiService.js`** — singleton `GeminiService` wrapping `@google/genai`. Handles text generation (`gemini-2.0-flash-exp`) and image generation (`imagen-4.0-generate-001`). The API key is stored in `localStorage` and loaded on init.
- **`constants.ts`** — model names, `MAX_TURNS` (7), `MIN_TURNS_FOR_ENDING` (6), `SIMULATION_TYPES`, and `TARGET_AUDIENCES` arrays.
- **`index.html`** — all HTML markup with Tailwind-based inline styles. DOM element IDs here must match the `ELEMENTS` object in `index.tsx`.

### State management pattern

State lives in a single mutable `STATE` object in `index.tsx`. After any state mutation, call `updateFullUI()` which delegates to three render functions: `renderLoadingState()`, `renderErrorState()`, and `renderSimulationDisplay()`.

### Simulation flow

1. User enters Gemini API key → saved to `localStorage`, `GeminiService.init(key)` called
2. User configures simulation type, target audience, optional topic/goal, turn count (3–10)
3. `handleStartSimulation()` calls `geminiService.generateInitialSimulationStep()` → populates `STATE.currentStep`
4. Image is generated in parallel via `geminiService.generateImage()` using `STATE.previousImagePrompt` for visual consistency across turns
5. User picks a choice or types custom input → `handleChoice()` → `generateNextSimulationStep()` with full history
6. On the final turn (or when `choices` is empty), `STATE.isSimulationEnded = true`
7. Completed story can be exported as an HTML file via `handleDownloadStory()`

### Gemini integration notes

- Text generation uses `responseMimeType: "application/json"` and expects `{ story, imagePrompt, choices }` JSON
- Image generation appends consistency instructions referencing the previous image prompt to maintain visual coherence across turns
- API errors for `API key not valid` automatically clear `localStorage` and reset `STATE.isApiKeySet`
- `components/` directory contains `.tsx` files but they are **empty** — all UI is in `index.html` + `index.tsx`
- `types.ts` contains only commented-out interfaces (kept as reference)

### Vite config

`vite.config.ts` has no env injection — no `define` block. The `@` alias resolves to the project root. Port 3000, host `0.0.0.0`.

### Mobile optimizations (index.html)

- All `input`, `select`, `textarea` have `font-size: 16px` (prevents iOS Safari zoom)
- All interactive elements have `touch-action: manipulation` and `-webkit-tap-highlight-color`
- Buttons/inputs have `min-h-[48px]` touch targets (44px minimum)
- `body` has `overflow-x: hidden`; `footer` has `safe-area-bottom` class for notch/home-bar
- `app-container` uses `env(safe-area-inset-*)` padding
- PWA meta tags: `theme-color=#2d6e56`, `apple-mobile-web-app-capable`
- `user-custom-input` textarea has `enterkeyhint="send"` + Enter key listener submits (Shift+Enter = newline)

### Notification / dialog system (index.tsx)

- `showToastNotification(message, duration?)` — shows `#download-notification` toast, auto-hides after `duration`ms (default 4000)
- `showCustomConfirm(message)` — returns `Promise<boolean>` using `#custom-confirm-dialog` overlay; replaces all `confirm()` calls
- No `alert()` or `confirm()` anywhere in the codebase

### Security

- `escapeHtml()` applied to all user-supplied values in `handleDownloadStory()` HTML output (XSS prevention)
- All error handlers throw only user-friendly Korean messages; raw API error strings are never exposed
- importmap pins `@google/genai@1.0.1` (exact, no `^`)

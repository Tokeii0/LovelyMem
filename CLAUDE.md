# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lovelymem V2 is a desktop memory forensics analysis platform built with **Tauri v2** (TypeScript frontend + Rust backend). It integrates Volatility2/3 for memory dump analysis, plus viewers for registry files, event logs, EXIF data, PE files, and more.

**Always communicate with users in Chinese.**

## Build & Development Commands

```bash
# Development
npm run dev              # Vite dev server (port 14222, strict)
npm run tauri dev        # Full Tauri dev mode (frontend + Rust backend)

# Building
npm run build            # tsc && vite build (frontend only)
npm run tauri build      # Complete desktop app build

# Rust validation (prefer cargo check over cargo build for speed)
cd src-tauri
cargo check              # Fast type/syntax checking
cargo clippy             # Linting
cargo build              # Full compilation (slower)

# Monaco Editor assets
npm run update-monaco    # Copies monaco-editor/min/vs to src/assets/monaco/vs
```

**Windows note:** Avoid `&&` syntax in PowerShell — chain commands with `;` or run separately.

## Architecture

### Multi-Page Tauri v2 App

Each page is a separate Vite entry point (see `vite.config.ts` rollupOptions.input) with its HTML file under `pages/`. Pages share modules from `src/modules/` but are independently built. Key pages: main dashboard (`pages/index.html`), string search, memory file browser, image finder, CSV/text viewers, and the theme editor.

### Frontend (src/)

- **BaseApplication** pattern (`src/modules/ui/baseApplication.ts`): Abstract class that all page applications extend. Provides lifecycle hooks, state management, and UI rendering.
- **ModernUIRenderer**: Shared UI styling system used across all pages.
- **Feature Managers**: Each major feature (images, CSV, text, EXIF, memory browsing) has a dedicated manager class in `src/modules/features/` or its own subdirectory under `src/modules/`.
- **Tauri IPC**: Frontend calls Rust backend via `invoke('command_name', { params })` from `@tauri-apps/api`.

### Backend (src-tauri/)

- **lib.rs**: Central orchestrator — declares all modules and registers all Tauri commands via the `build_tauri_app!` macro. New commands must be added here.
- **Command pattern**: `#[tauri::command] async fn name(...) -> Result<T, String>` — all async operations use `tokio`.
- **Memory loading**: Use `load_image_file()` in `lib.rs` as the entry point for memory image operations.
- **Large modules**: `loadmem.rs` (memory loading/validation), `string_search.rs` (pattern/hex search), `file_operations.rs` (file ops), `ai_chat.rs` (AI integration) are the biggest files.
- **String protection**: Sensitive literals use `obfstr` where appropriate.

### Configuration System

Adding a new setting requires **both sides**:
1. Add the setting entry to the frontend menu-text application settings UI (in `src/`)
2. Add the corresponding backend handler/storage (in `src-tauri/src/settings.rs`)
3. New fields must have default values when missing

### Vendor Chunking

Vite splits large dependencies into separate chunks: `vendor-tauri`, `vendor-iconpark`, `vendor-xterm`, `vendor-idb`, `vendor-monaco`. Monaco Editor is lazy-loaded to avoid blocking initial render.

## Key Technical Constraints

- **Tauri v2 only** — never use v1 APIs
- **Rust edition 2024** with `tokio` async runtime (multi-thread)
- **Release profile**: LTO enabled, strip symbols, single codegen unit
- **ARM64**: Custom panic hook (`setup_arm64_panic_hook()`) — panic strategy is `unwind` for ARM64 compatibility
- **Build copies src/ to dist/src**: The `copySrcPlugin` in vite.config.ts copies runtime CSS/HTML/JS from src/ to dist/src/ at build time.
- Do not create additional test webpages/scripts unless specifically requested

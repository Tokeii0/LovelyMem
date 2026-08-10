# LovelymemV2_rs - Agent Guidelines

This file provides comprehensive instructions for AI agents working on the LovelymemV2_rs repository.

## 1. Environment & Build Commands

### Backend (Rust/Tauri)
*   **Working Directory:** `src-tauri/`
*   **Check (Fast):** `cargo check` (Preferred for syntax/type validation)
*   **Build (Full):** `cargo build` (Only when necessary)
*   **Lint:** `cargo clippy`
*   **Test:**
    *   Run all tests: `cargo test`
    *   Run specific test: `cargo test test_name`
    *   Run specific module: `cargo test module_name::`

### Frontend (TypeScript/Vite)
*   **Working Directory:** `.` (Root)
*   **Dev Server:** `npm run dev` (Port 14222)
*   **Tauri Dev:** `npm run tauri dev`
*   **Build:** `npm run build` (TSC + Vite build)
*   **Preview:** `npm run preview`
*   **Monaco Update:** `npm run update-monaco`

### Multi-Page Configuration
*   This is a **multi-page application**.
*   Entries are defined in `vite.config.ts`.
*   All HTML pages live in `pages/`.
*   Common pages: `pages/index.html` (Dashboard), `pages/ai_assistant.html`, `pages/memory-file-browser.html`.
*   Ensure any new page is added to the Vite config.

---

## 2. Code Style & Conventions

### General
*   **Language:** The user interface and user communication MUST be in **Chinese**.
*   **Safety:** Never commit secrets. Do not use destructive git commands without permission.

### Backend (Rust)
*   **Framework:** **Tauri V2** APIs exclusively. Do NOT use V1 APIs.
*   **Async Runtime:** Use **`tokio`** for all asynchronous operations.
*   **Error Handling:** Use `Result<T, E>` and `thiserror`/`anyhow`. Propagate errors meaningfully; avoid `unwrap()` in production code.
*   **File Structure:**
    *   Main entry: `src-tauri/src/lib.rs`
    *   Modules: `src-tauri/src/*.rs` (Keep features separated).
    *   **Memory Loading:** MUST use `lib.rs::load_image_file()`.
*   **Command Registration:** All Tauri commands must be registered in `lib.rs`.
*   **Naming:** Snake_case for functions/variables, PascalCase for Structs/Enums.
*   **Windows Compat:** Avoid `&&` chaining in PowerShell scripts if writing them; use `;` or separate lines.

### Frontend (TypeScript)
*   **Framework:** Native TypeScript with Vite (Modular architecture).
*   **Style:** `ModernUIRenderer` class for consistent UI.
*   **State:** Use `StateManager` for global state.
*   **Events:** Use `EventManager` for bus communication.
*   **Communication:** Invoke backend via `invoke('command_name', { args })`.
*   **Naming:** camelCase for variables/functions, PascalCase for Classes/Components.

---

## 3. Configuration & Architecture Rules

### Configuration Synchronization (CRITICAL)
*   **Rule:** Settings MUST exist in both Frontend and Backend.
*   **Frontend:** `src/modules/settings/`
*   **Backend:** `src-tauri/src/settings.rs`
*   **Process:**
    1.  Add field to Backend struct.
    2.  Add default value (Required).
    3.  Add field to Frontend `menu-text` settings.
    4.  Ensure sync logic handles the update.

### Module Architecture
*   **Separation:** Create separate module files for new features (e.g., `feature_name.rs` / `FeatureManager.ts`).
*   **Isolation:** Do not bloat `main.ts` or `lib.rs` with logic. Use them only for orchestration/registration.

### AI & Forensics
*   **Memory Analysis:** Leverage `volatility2.rs` and `volatility3.rs`.
*   **AI Assistant:** Backend lives in `src-tauri/src/ai_v2/`; the page is `pages/ai_assistant.html`.
*   **Large Files:** Code must be optimized for reading large memory dumps (GBs in size).

---

## 4. Cursor/Copilot Specific Instructions

*   **Interaction:** Adopt an interactive task loop pattern. Ask for feedback after significant implementation steps.
*   **Language:** **ALWAYS communicate with the user in Chinese.**
*   **Files:**
    *   Frontend code goes in `src/`.
    *   Backend code goes in `src-tauri/`.
*   **No Reverts:** Do not revert changes unless explicitly asked or to fix a breakage caused by the agent.
*   **Dependencies:** Check `Cargo.toml` and `package.json` before importing. Do not assume libraries exist.

## 5. Troubleshooting Common Issues

*   **"Command not found":** Check if the function is annotated with `#[tauri::command]` and added to the `invoke_handler` in `lib.rs`.
*   **Async/Await:** Ensure frontend `invoke` calls are awaited.
*   **Pathing:** Use absolute paths when using agent tools (`read`, `write`).
*   **Windows Paths:** Be mindful of backslashes `\` vs forward slashes `/` in path manipulation strings.

## 6. Testing Strategy for Agents

1.  **Analyze:** Read related code first.
2.  **Plan:** Propose the change.
3.  **Implement:** Edit files.
4.  **Verify:**
    *   **Backend:** `cd src-tauri && cargo check`
    *   **Frontend:** `npm run build` (to check types)
5.  **Refine:** Fix any compile errors immediately.

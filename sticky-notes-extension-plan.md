# Sticky Notes Chrome Extension — Plan

## Overview

Build a Chrome Extension (Manifest V3) that lets users attach resizable, draggable, editable sticky notes to any webpage. Notes are injected into the page DOM via a content script, persist per exact URL (including query string) using `chrome.storage.local`, and scroll with the page content (position: absolute, not fixed).

**Scope:**
- Create, edit, move, resize, and delete notes on any page
- Notes are anchored to the page (scroll with content)
- Persistence is local-only, keyed by the full URL (`location.href`)
- A popup toolbar provides the "Add Note" action
- No sync, no authentication, no backend

**Out of scope:**
- Cross-device sync
- Note tagging or search
- Rich text / markdown formatting
- SPA deep-link re-keying (stretch goal, not required)

---

## Sub-Tasks

---

### Sub-Task 1 — Project Scaffold and Manifest

**Status:** [ ] pending

**Intent:**
Establish the project folder structure and the `manifest.json` that wires all extension components together. This is the foundation every other sub-task builds on.

**Expected Outcomes:**
- A folder `sticky-notes-extension/` exists with all placeholder files in place
- The extension loads in Chrome (`chrome://extensions` → Load unpacked) without errors
- Clicking the extension icon opens the popup without errors

**Todo List:**
1. Create the folder `sticky-notes-extension/` with sub-folder `icons/`
2. Create `manifest.json` with:
   - `manifest_version: 3`
   - `name`, `version`, `description`
   - `permissions`: `["storage", "activeTab", "scripting"]`
   - `background.service_worker`: `"background.js"`
   - `content_scripts` injecting `content.js` and `content.css` on `<all_urls>`
   - `action` pointing to `popup.html` and `icons/icon48.png`
3. Create empty stub files: `background.js`, `content.js`, `content.css`, `popup.html`, `popup.js`
4. Add placeholder PNG icons (16×16, 48×48, 128×128) in `icons/`
5. Load unpacked in Chrome and verify no manifest errors

**Relevant Context:**
- Manifest V3 requires `"scripting"` permission when using `chrome.scripting.executeScript` from the popup
- `activeTab` alone is not enough to inject scripts from the popup; `scripting` is also required

---

### Sub-Task 2 — Storage Layer (background.js)

**Status:** [ ] pending

**Intent:**
Implement the message-passing storage API in the background service worker. All reads and writes to `chrome.storage.local` are funnelled through here so the content script never calls storage directly. This keeps storage logic in one place.

**Expected Outcomes:**
- Sending `{ type: "GET_NOTES", url: <string> }` from any script returns an array of note objects (or `[]` if none)
- Sending `{ type: "SAVE_NOTES", url: <string>, notes: [...] }` persists the array under that URL key
- Verified manually via `chrome.runtime.sendMessage` from the DevTools console

**Todo List:**
1. Register a `chrome.runtime.onMessage` listener in `background.js`
2. Handle `GET_NOTES`: call `chrome.storage.local.get(key)`, respond with the array or `[]`
3. Handle `SAVE_NOTES`: call `chrome.storage.local.set({ [key]: notes })`, respond with `{ ok: true }`
4. Return `true` from the listener to keep the message channel open for async responses

**Relevant Context:**
- Storage key is `location.href` (full URL including query string) — passed in by the caller
- Note object shape: `{ id, x, y, text, color }` where `x`/`y` are pixel offsets from the top of the document (not the viewport)

---

### Sub-Task 3 — Note Rendering and DOM Injection (content.js + content.css)

**Status:** [ ] pending

**Intent:**
Build the `createNote` function that takes a note data object and inserts a styled, interactive sticky note `<div>` into the page. This sub-task covers rendering and styling only — drag and persistence are handled in later sub-tasks.

**Expected Outcomes:**
- Calling `createNote({ id, x, y, text, color })` appends a visible sticky note at the correct absolute position
- The note has a drag handle bar at the top, a delete button, and a resizable textarea body
- The note is visually distinct from page content and stays on top (high z-index)
- Notes do not interfere with page layout (positioned absolutely, outside normal flow)

**Todo List:**
1. In `content.js`, write `createNote(noteData)`:
   - Create a `div.sn-note` set to `position: absolute`, `left: x px`, `top: y px`
   - Add a header bar containing a drag-handle element and a delete `<button>`
   - Add a `<textarea class="sn-body">` pre-filled with `noteData.text`
   - Set `dataset.id` on the outer div for later lookup
   - Append to `document.body`
2. In `content.css`, style `.sn-note`:
   - `position: absolute`, high `z-index` (2147483647), `resize: both`, `overflow: hidden`
   - Yellow default background, rounded corners, drop shadow
   - Header bar with grab cursor, delete button as a plain icon, no visible border
   - Textarea fills remaining space, transparent background, no border, readable font

**Relevant Context:**
- `position: absolute` with offsets from the document top ensures notes scroll with the page
- `z-index: 2147483647` is the maximum 32-bit integer — guards against high-z-index page elements
- The note's `background` CSS property stores the color so it can be read back during `saveAll()`

---

### Sub-Task 4 — Drag-to-Move

**Status:** [ ] pending

**Intent:**
Make notes freely draggable by their header bar. When the user releases the note, its new position is persisted immediately so it survives a page reload.

**Expected Outcomes:**
- Clicking and dragging the header moves the note smoothly
- The note's `left`/`top` style reflects the new position after release
- `saveAll()` is called on `mouseup` so the new position is written to storage

**Todo List:**
1. Write `makeDraggable(noteEl)` in `content.js`:
   - Attach `mousedown` to the drag-handle element only (not the whole note)
   - On `mousedown`, record starting mouse position and starting note `left`/`top`
   - Attach `mousemove` and `mouseup` to `document` (not the note) to handle fast drags
   - On `mousemove`, update `note.style.left` and `note.style.top` using the delta from start
   - On `mouseup`, remove the `mousemove`/`mouseup` listeners and call `saveAll()`
2. Call `makeDraggable(note)` at the end of `createNote()`

**Relevant Context:**
- Listeners must be on `document`, not the element, to avoid losing the drag when the pointer moves faster than the element
- Position values are document-relative (absolute positioning), so no viewport scroll offset adjustment is needed during drag — the browser handles that automatically with `position: absolute`

---

### Sub-Task 5 — Edit and Delete

**Status:** [ ] pending

**Intent:**
Wire up the textarea for live editing and the delete button for note removal. Both actions persist the updated state immediately.

**Expected Outcomes:**
- Typing in a note's textarea updates the stored note text on each `input` event
- Clicking the delete button removes the note from the DOM and from storage
- After delete, reloading the page does not show the deleted note

**Todo List:**
1. In `createNote()`, attach an `input` event listener on the `<textarea>` that calls `saveAll()`
2. In `createNote()`, attach a `click` listener on the delete button that:
   - Calls `note.remove()` to remove the element from the DOM
   - Calls `saveAll()` to write the updated (smaller) note list to storage

**Relevant Context:**
- `saveAll()` (defined in Sub-Task 6) collects all `.sn-note` elements currently in the DOM and saves them — deleting a note before calling `saveAll()` naturally excludes it

---

### Sub-Task 6 — Persistence: Load and Save

**Status:** [ ] pending

**Intent:**
Implement the `saveAll()` helper and the page-load bootstrap that reads saved notes and re-creates them. This ties together storage, rendering, and interaction.

**Expected Outcomes:**
- On page load, all previously saved notes for the exact URL are re-created at their saved positions with their saved text
- After any edit, move, or delete, the updated note list is written back to storage
- Notes survive browser restarts

**Todo List:**
1. Write `saveAll()` in `content.js`:
   - Query all `div.sn-note` elements in the document
   - Map each to `{ id, x: parseInt(style.left), y: parseInt(style.top), text: textarea.value, color: style.background }`
   - Send a `SAVE_NOTES` message to `background.js` with `url: location.href` and the mapped array
2. At the top of `content.js`, on script initialisation, send a `GET_NOTES` message with `url: location.href`
   - In the response callback, call `createNote(note)` for each item in the returned array

**Relevant Context:**
- `location.href` is the full URL including query string — matches the storage key design from Sub-Task 2
- `saveAll()` is called from: `input` on textarea, `mouseup` after drag, `click` on delete, and `sn:add-note` event (Sub-Task 7)

---

### Sub-Task 7 — Popup: Add Note Action

**Status:** [ ] pending

**Intent:**
Build the popup UI with a single "Add Note" button. Clicking it injects a new blank note into the active tab's page at a default position.

**Expected Outcomes:**
- Opening the extension popup shows an "Add Note" button
- Clicking it closes the popup and adds a new blank yellow note at a visible position on the current page
- The new note is immediately editable and is saved to storage

**Todo List:**
1. Write `popup.html` with a single `<button id="add">＋ Add Sticky Note</button>` and a link to `popup.js`
2. Write `popup.js`:
   - On button click, query the active tab with `chrome.tabs.query({ active: true, currentWindow: true })`
   - Use `chrome.scripting.executeScript` to dispatch a `CustomEvent("sn:add-note")` on `document` in the tab
   - Call `window.close()` to close the popup
3. In `content.js`, listen for `document` event `sn:add-note`:
   - Generate a new `id` with `crypto.randomUUID()`
   - Call `createNote({ id, x: 120, y: 120, text: "", color: "#fff9a3" })`
   - Call `saveAll()` to persist the new note immediately

**Relevant Context:**
- `chrome.scripting.executeScript` requires the `"scripting"` permission declared in `manifest.json` (Sub-Task 1)
- Dispatching a `CustomEvent` from the injected script and catching it in the content script is the clean way to trigger content-script logic from the popup in MV3

---

### Sub-Task 8 — Polish and Edge Cases

**Status:** [ ] pending

**Intent:**
Handle known edge cases and improve the user experience so the extension behaves correctly in real-world use.

**Expected Outcomes:**
- Notes cannot be dragged off-screen or to a negative position
- The textarea `resize` handle does not conflict with the note's own `resize: both` — or is intentionally disabled on the textarea
- Long pages with many notes do not noticeably affect page performance
- The popup button is keyboard-accessible

**Todo List:**
1. Clamp note position during drag: do not allow `left` or `top` to go below `0`, and cap at `document.body.scrollWidth` / `document.body.scrollHeight` minus note dimensions
2. Disable `resize` on the `<textarea>` itself in CSS (the outer `.sn-note` container already has `resize: both`)
3. Add `autocomplete="off"` and `spellcheck="false"` to the textarea to reduce browser UI noise inside notes
4. Add a `:focus-within` outline on `.sn-note` so the active note is visually clear
5. In `popup.html`, ensure the button has a visible focus ring and an `aria-label`

**Relevant Context:**
- The note's `min-width` / `min-height` should be set in CSS to prevent notes from being resized to invisible dimensions

---

## File Map

| File | Purpose |
|---|---|
| `manifest.json` | Extension configuration, permissions, entry points |
| `background.js` | Service worker — storage read/write via message passing |
| `content.js` | Injected into every page — note creation, drag, edit, delete, load/save |
| `content.css` | Styles for all `.sn-note` elements |
| `popup.html` | Extension toolbar popup markup |
| `popup.js` | Popup logic — triggers new-note creation via scripting API |
| `icons/` | PNG icons at 16, 48, 128px |

## Note Data Shape

```
{
  id:    string   // crypto.randomUUID()
  x:     number   // px from left edge of document
  y:     number   // px from top edge of document
  text:  string   // textarea content
  color: string   // CSS color value, default "#fff9a3"
}
```

## Storage Key Convention

Notes are stored under `location.href` (full URL including query string).
Example key: `https://example.com/article?id=42`

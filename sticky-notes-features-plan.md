# Sticky Notes Extension — Feature Additions Plan

## Top-Level Overview

Add three groups of new features to the existing sticky-notes Chrome extension:

1. **Color Picker** — A color-wheel icon button in the header opens a floating color picker panel directly on the note; the chosen colour is applied as the note background and persisted.
2. **Image Background + Gallery** — An image icon button in the header opens a gallery panel showing the last 3 uploaded images (shared globally across all notes/pages) with an "Upload new" option. Selecting a thumbnail or uploading a new image applies it as a faded (55% opacity) CSS background image on the note. The gallery is stored in a dedicated `chrome.storage.local` key.
3. **Text Formatting** — A toolbar row below the header provides Bold / Italic / Font-Size controls. Bold and Italic apply to the selected text range only. Font size scales proportionally with note resize. Ctrl+B / Ctrl+I keyboard shortcuts are supported. Requires migrating the `<textarea>` to a `contenteditable` div; note content is stored as HTML.

### Scope
- All changes are confined to `content.js`, `content.css`, and the data model (note object shape).
- `background.js` requires a small addition: a new `GET_GALLERY` / `SAVE_GALLERY` message handler for the global image gallery key.
- `popup.js`, `popup.html`, and `manifest.json` require **no changes**.
- Existing notes load cleanly — plain text continues to render correctly inside `contenteditable`.

---

## Sub-Tasks

---

### Sub-Task 1 — Migrate `<textarea>` to `contenteditable`

**Intent**  
All three new features depend on rich content inside the note body. The current `<textarea>` only supports plain text. Migrating to a `contenteditable` div unlocks selection-based HTML formatting (bold, italic) and enables the font-size scaling logic. This is the foundational change everything else builds on.

**Expected Outcomes**
- The note body is a `<div contenteditable="true" class="sn-body">` instead of `<textarea>`.
- Existing plain-text notes load and display their text correctly.
- The `saveAll()` function reads `innerHTML` (not `.value`) for the note's text field.
- The `createNote()` function sets `innerHTML` (not `.value`) when restoring a note.
- `escapeHtml()` is no longer applied when setting body content (since stored content is now HTML).
- Visual appearance of the note body is unchanged (same sizing, scroll behaviour, font).

**Todo List**
1. In `createNote()`, replace `<textarea class="sn-body">` creation with `<div class="sn-body" contenteditable="true">`.
2. Replace `body.value = escapeHtml(note.text)` with `body.innerHTML = note.text` (raw HTML assignment).
3. Replace the `input` event listener on the textarea with an `input` event listener on the contenteditable div.
4. In `saveAll()`, replace `el.querySelector('.sn-body').value` with `el.querySelector('.sn-body').innerHTML`.
5. In `content.css`, update `.sn-body` styles: remove textarea-specific rules (`resize: none`, `border`) and add `overflow-y: auto`, `word-wrap: break-word`, `outline: none`, `white-space: pre-wrap` so it behaves as a scrollable rich text area.

**Relevant Context**
- [`content.js` — `createNote()`](sticky-notes-extension/content.js) — note DOM creation, textarea init, input event
- [`content.js` — `saveAll()`](sticky-notes-extension/content.js) — reads `.sn-body` value
- [`content.js` — `escapeHtml()`](sticky-notes-extension/content.js) — no longer needed for body set
- [`content.css` — `.sn-body`](sticky-notes-extension/content.css) — textarea CSS rules

**Status** — `[x] done`

---

### Sub-Task 2 — Text Formatting Toolbar (Bold, Italic, Font Size)

**Intent**  
Add a slim toolbar row between the header and the note body that provides Bold, Italic, and font-size controls. Bold/Italic use `document.execCommand` (or a `Range`-based approach) to wrap selected text in `<b>` / `<i>` tags. Font size scales proportionally as the note is resized using a `ResizeObserver`. Ctrl+B / Ctrl+I keyboard shortcuts are wired in the note body.

**Expected Outcomes**
- A `.sn-toolbar` div appears below the header containing: **B** button, *I* button, and a font-size display (e.g. "14px" with ▲/▼ or a range slider).
- Clicking **B** or pressing Ctrl+B while text is selected wraps the selection in `<strong>`.
- Clicking *I* or pressing Ctrl+I while text is selected wraps the selection in `<em>`.
- A `ResizeObserver` on `.sn-note` adjusts the `font-size` of `.sn-body` proportionally to the note's current width (baseline: 210px → 13px; scales linearly).
- Bold/italic state and font size are persisted via `saveAll()` (content is stored as HTML; font size is stored as a separate `fontSize` field on the note object).

**Todo List**
1. In `createNote()`, inject a `<div class="sn-toolbar">` after `.sn-header` containing: a `<button class="sn-fmt-bold">B</button>`, `<button class="sn-fmt-italic">I</button>`, and a `<span class="sn-fontsize-display">` with ▲/▼ buttons.
2. Wire click handlers on `.sn-fmt-bold` and `.sn-fmt-italic` to call `document.execCommand('bold')` / `document.execCommand('italic')` (they operate on the current selection in the focused contenteditable).
3. Wire `keydown` on `.sn-body` to intercept Ctrl+B and Ctrl+I and call `document.execCommand` accordingly (preventing default browser behaviour).
4. Add a `ResizeObserver` on the `.sn-note` element; on resize, set `.sn-body` font size = `Math.max(11, Math.round(note.offsetWidth / 210 * 13))` px.
5. Add `fontSize` field to the note data model (default `13`). Store the current font-size value in `saveAll()` via a `data-fontsize` attribute on `.sn-note`. Restore it in `createNote()` and apply to `.sn-body`.
6. In `content.css`, add `.sn-toolbar` styles: flex row, small padding, button styling (bold/italic visual weight), same semi-transparent header background tone.

**Relevant Context**
- [`content.js` — `createNote()`](sticky-notes-extension/content.js) — where the toolbar div is inserted
- [`content.js` — `saveAll()`](sticky-notes-extension/content.js) — must include `fontSize` in the serialised note object
- [`content.css` — `.sn-header`](sticky-notes-extension/content.css) — visual style reference for toolbar
- Note data object shape: `{ id, x, y, text, color }` → gains `fontSize`

**Status** — `[x] done`

---

### Sub-Task 3 — Color Picker Panel

**Intent**  
Add a colour-wheel icon button to the header. Clicking it opens a small floating panel directly on the note that contains a native `<input type="color">` (color wheel) allowing the user to pick any colour. The chosen colour replaces the note's background and is saved immediately.

**Expected Outcomes**
- A 🎨 (or palette icon) button `.sn-color-btn` appears in the header bar, to the left of the delete button.
- Clicking it toggles a `.sn-color-panel` div visible on the note (positioned below the header).
- The panel contains an `<input type="color">` with the current note colour pre-populated.
- On `input` / `change` events on the colour input, the note's background CSS is updated live.
- `saveAll()` is called on `change` to persist the new colour.
- Clicking outside the panel (document `mousedown`) closes it.
- The colour value continues to be stored in the existing `color` field of the note object.

**Todo List**
1. In `createNote()`, add `<button class="sn-color-btn" title="Change colour">🎨</button>` to `.sn-header`, before the delete button.
2. Create a `<div class="sn-color-panel">` containing `<input type="color" class="sn-color-input">` and append it to the `.sn-note` element (not the header, so it can float over content).
3. Wire a `click` handler on `.sn-color-btn` that toggles a `.sn-color-panel--open` CSS class and sets the color input's value to the current `note.style.background`.
4. Wire `input` on `.sn-color-input` to update `note.style.background = e.target.value` live.
5. Wire `change` on `.sn-color-input` to call `saveAll()`.
6. Wire `mousedown` on `document` to close the panel if the click target is outside the note's color panel (check `!panel.contains(e.target) && e.target !== btn`).
7. In `content.css`, style `.sn-color-panel`: absolute position below the header, small rounded box, white background, drop shadow, hidden by default; `.sn-color-panel--open` sets `display: block`. Style `.sn-color-btn` to match `.sn-delete` sizing.

**Relevant Context**
- [`content.js` — `createNote()`](sticky-notes-extension/content.js) — header DOM construction
- [`content.css` — `.sn-header`, `.sn-delete`](sticky-notes-extension/content.css) — button sizing/style reference
- Note data object shape: `color` field already exists — no schema change needed

**Status** — `[x] done`

---

### Sub-Task 4 — Image Background Upload + Gallery Panel

**Intent**
Add an image icon button to the header. Clicking it opens a gallery panel on the note showing thumbnails of the last 3 globally-uploaded images (retrieved from a dedicated `chrome.storage.local` key) plus an "Upload new" button. Selecting a thumbnail or uploading a new image applies it as a faded (55% opacity) CSS background on the note. Newly uploaded images are prepended to the global gallery (capped at 3). The applied image is persisted per-note. Clicking the button while an image is active reveals the panel with a "Remove image" option.

**Expected Outcomes**
- A 🖼️ button `.sn-img-btn` appears in the header bar.
- Clicking it toggles a `.sn-img-panel` floating panel (similar layout to the colour panel) that shows:
  - Up to 3 thumbnail `<img>` elements from the global gallery.
  - An "Upload new" `<button>` at the bottom of the panel that opens a hidden `<input type="file">`.
  - A "Remove image" `<button>` (only visible if the note already has an image applied).
- Clicking a gallery thumbnail applies that base64 image to the note, sets the faded overlay, and calls `saveAll()`.
- Clicking "Upload new": opens the file picker, reads the file as base64, prepends to the global gallery array (dropping the oldest if length > 3), saves the gallery back to `chrome.storage.local` under the key `"sn:image-gallery"`, then applies the image to the note.
- Clicking "Remove image" clears `dataset.image`, removes background image styles, and calls `saveAll()`.
- On panel open, thumbnails are always refreshed from the latest gallery state in `chrome.storage.local`.
- Clicking outside the panel closes it (same `document mousedown` pattern as the colour panel).
- The applied image is stored as base64 in a per-note `image` field in `chrome.storage.local`.
- On reload, `createNote()` checks for `note.image` and re-applies the background image and overlay.

**Todo List**
1. In `background.js`, add two new message handlers alongside the existing ones:
   - `GET_GALLERY`: reads `chrome.storage.local` key `"sn:image-gallery"`, returns array or `[]`.
   - `SAVE_GALLERY`: writes the provided array to `"sn:image-gallery"`.
2. Add `image` field to the note data model (default `null`).
3. In `createNote()`, add `<button class="sn-img-btn" title="Image background">🖼️</button>` to `.sn-header`.
4. Create a `<div class="sn-img-panel">` (hidden by default) and append it to `.sn-note`. It contains:
   - A `<div class="sn-gallery">` — thumbnail container (populated dynamically on panel open).
   - A `<button class="sn-img-upload-btn">Upload new</button>`.
   - A `<button class="sn-img-remove-btn">Remove image</button>` (hidden unless note has an image).
   - A hidden `<input type="file" accept="image/*" class="sn-img-input">`.
5. Wire `click` on `.sn-img-btn` to:
   - Send `GET_GALLERY` message to background.
   - Populate `.sn-gallery` with `<img>` thumbnails from the returned array.
   - Show/hide `.sn-img-remove-btn` based on whether `note.dataset.image` is set.
   - Toggle `.sn-img-panel--open` CSS class to show/hide the panel.
6. Wire `click` on each gallery `<img>` thumbnail to call `applyImageBackground(note, base64)` and `saveAll()`, then close the panel.
7. Wire `click` on `.sn-img-upload-btn` to trigger `.sn-img-input.click()`.
8. Wire `change` on `.sn-img-input`:
   - Read `e.target.files[0]` via `FileReader.readAsDataURL()`.
   - On `loadend`: send `GET_GALLERY`, prepend new base64 to the array, cap at 3, send `SAVE_GALLERY`, call `applyImageBackground(note, base64)`, call `saveAll()`, close the panel.
9. Wire `click` on `.sn-img-remove-btn` to clear `note.dataset.image`, remove background image styles, remove the overlay div, call `saveAll()`, close the panel.
10. Wire `mousedown` on `document` to close `.sn-img-panel` if click is outside (same pattern as colour panel).
11. Extract a helper `applyImageBackground(note, base64)` that: sets `note.dataset.image = base64`, sets `note.style.backgroundImage`, `backgroundSize`, and inserts/updates the `.sn-img-overlay` div.
12. In `createNote()`, if `note.image` is present, call `applyImageBackground(note, note.image)` after building the DOM.
13. In `saveAll()`, include `image: note.dataset.image || null` in the serialised note object.
14. In `content.css`:
    - Style `.sn-img-panel` and `.sn-img-panel--open` (same floating panel pattern as `.sn-color-panel`).
    - Style `.sn-gallery` as a flex row with `gap`, `flex-wrap: wrap`.
    - Style gallery `img` thumbnails: fixed size (e.g. 56×56px), `object-fit: cover`, rounded corners, cursor pointer, hover border highlight.
    - Style `.sn-img-overlay`: `position: absolute; inset: 0; background: rgba(255,255,255,0.45); pointer-events: none; z-index: 0`.
    - Ensure `.sn-header`, `.sn-toolbar`, `.sn-body` have `position: relative; z-index: 1`.

**Relevant Context**
- [`background.js`](sticky-notes-extension/background.js) — add `GET_GALLERY` / `SAVE_GALLERY` handlers here
- [`content.js` — `createNote()`](sticky-notes-extension/content.js) — where to add the button and panel
- [`content.js` — `saveAll()`](sticky-notes-extension/content.js) — must serialise the `image` field
- [`content.css`](sticky-notes-extension/content.css) — overlay layering and panel styling
- Note data object shape: `{ id, x, y, text, color }` → gains `image`
- Gallery stored under key `"sn:image-gallery"` as `string[]` (array of base64 data URLs, max 3)
- `chrome.storage.local` limit: 10 MB total; base64 images compress poorly — acceptable per user confirmation

**Status** — `[x] done`

---

## Updated Note Data Model

After all sub-tasks are complete, the per-note object shape will be:

```javascript
{
  id:       string,        // crypto.randomUUID()
  x:        number,        // px from document left
  y:        number,        // px from document top
  text:     string,        // innerHTML of .sn-body (may contain <b>, <em> tags)
  color:    string,        // CSS color (default "#fff9a3")
  fontSize: number,        // px (default 13)
  image:    string | null  // base64 data URL or null
}
```

A **separate** global gallery key is stored in `chrome.storage.local`:

```javascript
"sn:image-gallery": string[]  // array of up to 3 base64 data URLs, newest first
```

---

## Implementation Order

Sub-tasks must be implemented in order — each builds on the previous:

```
Sub-Task 1 (contenteditable migration)
  └─▶ Sub-Task 2 (formatting toolbar — requires contenteditable)
        └─▶ Sub-Task 3 (color picker — independent but after foundation is stable)
              └─▶ Sub-Task 4 (image background + gallery — independent but after foundation is stable)
```

Sub-Tasks 3 and 4 are independent of each other and could be done in either order after Sub-Task 2 is complete.

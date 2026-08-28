// Sticky Notes — content script
// Injected into every page. Handles note creation, drag, edit, delete, load/save.

const PAGE_KEY = location.href;

// ─── Note Rendering ───────────────────────────────────────────────────────────

function createNote({ id, x, y, text = "", color = "#fff9a3", fontSize = 13, image = null }) {
  const note = document.createElement("div");
  note.className = "sn-note";
  note.dataset.id = id;
  note.dataset.fontSize = fontSize;
  note.dataset.color = color;
  note.style.left = x + "px";
  note.style.top  = y + "px";
  // Use backgroundColor (not background shorthand) so it never conflicts with backgroundImage
  note.style.backgroundColor = color;

  // ── Header ──
  const header = document.createElement("div");
  header.className = "sn-header";

  const dragHandle = document.createElement("span");
  dragHandle.className = "sn-drag-handle";
  dragHandle.title = "Drag to move";
  dragHandle.textContent = "⠿";

  const headerLeft = document.createElement("div");
  headerLeft.className = "sn-header-left";
  headerLeft.appendChild(dragHandle);

  const colorBtn = document.createElement("button");
  colorBtn.className = "sn-color-btn";
  colorBtn.title = "Change colour";
  colorBtn.textContent = "🎨";
  headerLeft.appendChild(colorBtn);

  const imgBtn = document.createElement("button");
  imgBtn.className = "sn-img-btn";
  imgBtn.title = "Image background";
  imgBtn.textContent = "🖼️";
  headerLeft.appendChild(imgBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "sn-delete";
  deleteBtn.title = "Delete note";
  deleteBtn.setAttribute("aria-label", "Delete note");
  deleteBtn.textContent = "✕";

  header.appendChild(headerLeft);
  header.appendChild(deleteBtn);
  note.appendChild(header);

  // ── Formatting toolbar ──
  const toolbar = document.createElement("div");
  toolbar.className = "sn-toolbar";
  toolbar.innerHTML = `
    <button class="sn-fmt-btn sn-fmt-bold" title="Bold (Ctrl+B)"><b>B</b></button>
    <button class="sn-fmt-btn sn-fmt-italic" title="Italic (Ctrl+I)"><i>I</i></button>
    <span class="sn-fontsize-controls">
      <button class="sn-fontsize-down" title="Decrease font size">−</button>
      <span class="sn-fontsize-display">${fontSize}px</span>
      <button class="sn-fontsize-up" title="Increase font size">+</button>
    </span>
  `;
  note.appendChild(toolbar);

  // ── Body (contenteditable) ──
  const body = document.createElement("div");
  body.className = "sn-body";
  body.contentEditable = "true";
  body.setAttribute("autocomplete", "off");
  body.setAttribute("spellcheck", "false");
  body.innerHTML = text;
  body.style.fontSize = fontSize + "px";
  note.appendChild(body);

  // ── Color picker panel — floats at body level, toggled by the color button ──
  const colorPanel = document.createElement("div");
  colorPanel.className = "sn-color-panel";

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.className = "sn-color-input";
  colorInput.value = color.startsWith("#") ? color : "#fff9a3";
  colorPanel.appendChild(colorInput);

  // ── Image panel — built here, appended to DOM after the note (see bottom of function) ──
  const imgPanel = document.createElement("div");
  imgPanel.className = "sn-img-panel";

  const galleryRow = document.createElement("div");
  galleryRow.className = "sn-gallery-row";
  imgPanel.appendChild(galleryRow);

  const slots = [0, 1, 2].map(() => {
    const slot = document.createElement("div");
    slot.className = "sn-gallery-slot";
    galleryRow.appendChild(slot);
    return slot;
  });

  const removeBtn = document.createElement("button");
  removeBtn.className = "sn-img-remove-btn";
  removeBtn.textContent = "Remove image";
  removeBtn.style.display = "none";
  imgPanel.appendChild(removeBtn);

  const imgInput = document.createElement("input");
  imgInput.type = "file";
  imgInput.accept = "image/*";
  imgInput.style.display = "none";
  imgPanel.appendChild(imgInput);

  // ── Apply image if restoring from storage ──
  if (image) applyImageBackground(note, image);

  // ── Wire interactions ──
  makeDraggable(note);

  // Body: save on input
  body.addEventListener("input", saveAll);

  // Body: Ctrl+B / Ctrl+I shortcuts
  body.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "b") { e.preventDefault(); document.execCommand("bold"); }
    if (e.ctrlKey && e.key === "i") { e.preventDefault(); document.execCommand("italic"); }
  });

  // Delete button — also clean up the body-level panels
  deleteBtn.addEventListener("click", () => {
    resizeObserver.disconnect();
    note.remove();
    imgPanel.remove();
    colorPanel.remove();
    saveAll();
  });

  // Formatting buttons
  toolbar.querySelector(".sn-fmt-bold").addEventListener("click", () => {
    body.focus();
    document.execCommand("bold");
    saveAll();
  });
  toolbar.querySelector(".sn-fmt-italic").addEventListener("click", () => {
    body.focus();
    document.execCommand("italic");
    saveAll();
  });

  // Font size +/− buttons
  const fontsizeDisplay = toolbar.querySelector(".sn-fontsize-display");
  toolbar.querySelector(".sn-fontsize-up").addEventListener("click", () => {
    const next = Math.min((parseInt(note.dataset.fontSize) || 13) + 1, 36);
    setFontSize(note, next);
    saveAll();
  });
  toolbar.querySelector(".sn-fontsize-down").addEventListener("click", () => {
    const next = Math.max((parseInt(note.dataset.fontSize) || 13) - 1, 8);
    setFontSize(note, next);
    saveAll();
  });

  // ResizeObserver: scale displayed font size proportionally with note width
  const resizeObserver = new ResizeObserver(() => {
    const base   = parseInt(note.dataset.fontSize) || 13;
    const scaled = Math.max(8, Math.round(base * (note.offsetWidth / 210)));
    body.style.fontSize = scaled + "px";
    fontsizeDisplay.textContent = base + "px";
  });
  resizeObserver.observe(note);

  // ── Position helper: places a body-level panel below the given button ──
  function positionBelow(panel, btn) {
    const r = btn.getBoundingClientRect();
    panel.style.position = "fixed";
    panel.style.top  = (r.bottom + 4) + "px";
    panel.style.left = r.left + "px";
  }

  // Color button: toggle the color panel
  colorBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    imgPanel.classList.remove("sn-img-panel--open");
    if (colorPanel.classList.contains("sn-color-panel--open")) {
      colorPanel.classList.remove("sn-color-panel--open");
      return;
    }
    colorInput.value = note.dataset.color || "#fff9a3";
    positionBelow(colorPanel, colorBtn);
    colorPanel.classList.add("sn-color-panel--open");
  });

  // Color input: live preview on drag, persist on close
  colorInput.addEventListener("input", (e) => {
    const hex = e.target.value;
    note.style.backgroundColor = hex;
    note.dataset.color = hex;
  });
  colorInput.addEventListener("change", () => saveAll());

  // Close color panel on outside click
  document.addEventListener("mousedown", (e) => {
    if (!colorPanel.contains(e.target) && e.target !== colorBtn) {
      colorPanel.classList.remove("sn-color-panel--open");
    }
  });

  // Helper: populate the 3 slots from a gallery array
  function refreshSlots(gallery) {
    slots.forEach((slot, i) => {
      slot.innerHTML = "";
      slot.onclick = null;
      if (gallery[i]) {
        const img = document.createElement("img");
        img.src = gallery[i];
        img.className = "sn-gallery-thumb";
        slot.appendChild(img);
        const captured = gallery[i];
        slot.onclick = (ev) => {
          ev.stopPropagation();
          applyImageBackground(note, captured);
          saveAll();
          imgPanel.classList.remove("sn-img-panel--open");
        };
      } else {
        slot.textContent = "+";
        slot.onclick = (ev) => {
          ev.stopPropagation();
          imgInput.click();
        };
      }
    });
  }

  // Image button: load gallery, populate slots, toggle panel
  imgBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (imgPanel.classList.contains("sn-img-panel--open")) {
      imgPanel.classList.remove("sn-img-panel--open");
      return;
    }
    chrome.runtime.sendMessage({ type: "GET_GALLERY" }, (gallery) => {
      if (chrome.runtime.lastError) return;
      refreshSlots(gallery || []);
      removeBtn.style.display = note.dataset.image ? "block" : "none";
      positionBelow(imgPanel, imgBtn);
      imgPanel.classList.add("sn-img-panel--open");
    });
  });

  // File input: read → update gallery → apply
  imgInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("loadend", () => {
      const base64 = reader.result;
      chrome.runtime.sendMessage({ type: "GET_GALLERY" }, (gallery) => {
        if (chrome.runtime.lastError) return;
        const updated = [base64, ...(gallery || []).filter(g => g !== base64)].slice(0, 3);
        chrome.runtime.sendMessage({ type: "SAVE_GALLERY", gallery: updated }, () => {
          void chrome.runtime.lastError; // suppress unchecked error warning
        });
      });
      applyImageBackground(note, base64);
      saveAll();
      imgPanel.classList.remove("sn-img-panel--open");
      imgInput.value = "";
    });
    reader.readAsDataURL(file);
  });

  // Remove image button — removes from the note and deletes it from the gallery
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const imageToRemove = note.dataset.image;
    removeImageBackground(note);
    saveAll();
    imgPanel.classList.remove("sn-img-panel--open");
    if (imageToRemove) {
      chrome.runtime.sendMessage({ type: "GET_GALLERY" }, (gallery) => {
        if (chrome.runtime.lastError) return;
        const updated = (gallery || []).filter(g => g !== imageToRemove);
        chrome.runtime.sendMessage({ type: "SAVE_GALLERY", gallery: updated }, () => {
          void chrome.runtime.lastError;
        });
      });
    }
  });

  // Close image panel on outside click
  document.addEventListener("mousedown", (e) => {
    if (!imgPanel.contains(e.target) && e.target !== imgBtn) {
      imgPanel.classList.remove("sn-img-panel--open");
    }
  });

  // Append note first, then the panels — later siblings paint on top of notes
  // even when z-index values are equal.
  const root = document.body || document.documentElement;
  root.appendChild(note);
  root.appendChild(colorPanel);
  root.appendChild(imgPanel);
  return note;
}

// ─── Image Background Helpers ─────────────────────────────────────────────────

function applyImageBackground(note, base64) {
  note.dataset.image        = base64;
  note.style.backgroundImage    = `url(${base64})`;
  note.style.backgroundSize     = "cover";
  note.style.backgroundRepeat   = "no-repeat";
  note.style.backgroundPosition = "center";

  // Overlay fades the image to ~55% opacity, sits below all content
  let overlay = note.querySelector(".sn-img-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "sn-img-overlay";
    note.insertBefore(overlay, note.firstChild);
  }
}

function removeImageBackground(note) {
  delete note.dataset.image;
  note.style.backgroundImage    = "";
  note.style.backgroundSize     = "";
  note.style.backgroundRepeat   = "";
  note.style.backgroundPosition = "";
  const overlay = note.querySelector(".sn-img-overlay");
  if (overlay) overlay.remove();
}

// ─── Font Size Helper ─────────────────────────────────────────────────────────

function setFontSize(note, size) {
  note.dataset.fontSize = size;
  const body = note.querySelector(".sn-body");
  if (body) body.style.fontSize = size + "px";
  const display = note.querySelector(".sn-fontsize-display");
  if (display) display.textContent = size + "px";
}

// ─── Colour Utility ───────────────────────────────────────────────────────────

function rgbToHex(rgb) {
  if (!rgb || rgb.startsWith("#")) return rgb;
  const m = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!m) return "#fff9a3";
  return "#" + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, "0")).join("");
}

// ─── Drag-to-Move ─────────────────────────────────────────────────────────────

function makeDraggable(note) {
  const handle = note.querySelector(".sn-drag-handle");

  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startLeft   = parseInt(note.style.left) || 0;
    const startTop    = parseInt(note.style.top)  || 0;

    function onMove(e) {
      if (!note.isConnected) return; // note was deleted mid-drag
      const newLeft = startLeft + e.clientX - startMouseX;
      const newTop  = startTop  + e.clientY - startMouseY;
      note.style.left = Math.max(0, Math.min(newLeft, document.documentElement.scrollWidth  - note.offsetWidth))  + "px";
      note.style.top  = Math.max(0, Math.min(newTop,  document.documentElement.scrollHeight - note.offsetHeight)) + "px";
    }

    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
      saveAll();
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  });
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function saveAll() {
  const notes = [...document.querySelectorAll(".sn-note")].map((el) => {
    const bodyEl = el.querySelector(".sn-body");
    return {
      id:       el.dataset.id,
      x:        parseInt(el.style.left)  || 0,
      y:        parseInt(el.style.top)   || 0,
      text:     bodyEl ? bodyEl.innerHTML : "",
      color:    el.dataset.color || "#fff9a3",
      fontSize: parseInt(el.dataset.fontSize) || 13,
      image:    el.dataset.image || null,
    };
  });

  chrome.runtime.sendMessage({ type: "SAVE_NOTES", url: PAGE_KEY, notes }, () => {
    void chrome.runtime.lastError; // suppress unchecked error if context invalidated
  });
}

// ─── Bootstrap: load saved notes on page load ─────────────────────────────────

chrome.runtime.sendMessage({ type: "GET_NOTES", url: PAGE_KEY }, (notes) => {
  if (chrome.runtime.lastError) return;
  if (notes && notes.length) {
    notes.forEach(createNote);
  }
});

// ─── Add Note trigger (from popup via CustomEvent) ────────────────────────────

document.addEventListener("sn:add-note", () => {
  const id = crypto.randomUUID();
  const x = Math.min(120 + window.scrollX, document.documentElement.scrollWidth  - 220);
  const y = Math.min(120 + window.scrollY, document.documentElement.scrollHeight - 200);
  createNote({ id, x, y, text: "", color: "#fff9a3" });
  saveAll();
});

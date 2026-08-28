// Storage layer — all chrome.storage.local reads and writes go through here.
// Content scripts and popup communicate via chrome.runtime.sendMessage.

const GALLERY_KEY = "sn:image-gallery";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const key = msg.url;

  if (msg.type === "GET_NOTES") {
    chrome.storage.local.get(key, (data) => {
      sendResponse(data[key] || []);
    });
    return true;
  }

  if (msg.type === "SAVE_NOTES") {
    chrome.storage.local.set({ [key]: msg.notes }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "GET_GALLERY") {
    chrome.storage.local.get(GALLERY_KEY, (data) => {
      sendResponse(data[GALLERY_KEY] || []);
    });
    return true;
  }

  if (msg.type === "SAVE_GALLERY") {
    chrome.storage.local.set({ [GALLERY_KEY]: msg.gallery }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
});

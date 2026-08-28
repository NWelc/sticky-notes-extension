document.getElementById("add").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.dispatchEvent(new CustomEvent("sn:add-note")),
  });
  window.close();
});

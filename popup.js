async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function sendToActive(message) {
  const tabId = await getActiveTabId();
  if (!tabId) return { ok: false, error: "No active tab." };
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }
}

document.getElementById("btnStart")?.addEventListener("click", async () => {
  const resp = await sendToActive({ action: "ytq_sequential_start" });
  if (!resp?.ok) alert("Failed: " + (resp?.error || "unknown"));
  else window.close();
});

document.getElementById("btnStop")?.addEventListener("click", async () => {
  const resp = await sendToActive({ action: "ytq_sequential_stop" });
  if (!resp?.ok) alert("Failed to stop.");
  else window.close();
});

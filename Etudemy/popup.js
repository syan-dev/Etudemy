async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function sendToActive(message) {
  const tabId = await getActiveTabId();
  if (!tabId) return { ok: false, error: "No active tab found." };
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    try {
      // Try to inject content script if it's not already there
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (err)
      {
      // We can't alert here, as the popup might be closed
      // Log the error for debugging
      console.error("YTQ sendToActive failed:", err?.message || String(err));
      return { ok: false, error: "Cannot run on this page." };
    }
  }
}

/**
 * Shows the specified view ('start' or 'running')
 */
function showView(viewId) {
  document.getElementById('start-view').style.display = (viewId === 'start') ? 'block' : 'none';
  document.getElementById('running-view').style.display = (viewId === 'running') ? 'block' : 'none';
}

/**
 * Disables buttons and shows an error message
 */
function setErrorState(enabled, errorMsg = "") {
  document.getElementById('btnStart').disabled = !enabled;
  document.getElementById('btnStop').disabled = !enabled;
  
  const errorEl = document.getElementById('error-message');
  if (errorMsg) {
    errorEl.textContent = errorMsg;
    errorEl.style.display = 'block';
  } else {
    errorEl.style.display = 'none';
  }
}

document.getElementById("btnStart")?.addEventListener("click", () => { // <--- No 'async'
  // Get the selected difficulty from the radio buttons
  const difficulty = document.querySelector('input[name="difficulty"]:checked')?.value || "Medium";
  
  // "Fire and forget" - send the message but don't wait for a reply
  sendToActive({ 
    action: "ytq_sequential_start",
    difficulty: difficulty 
  });
  
  // Close immediately
  window.close(); 
});

document.getElementById("btnStop")?.addEventListener("click", () => { // <--- No 'async'
  // "Fire and forget" - send the message but don't wait for a reply
  sendToActive({ action: "ytq_sequential_stop" });
  
  // Close immediately
  window.close();
});

/**
 * Check the status of the quiz when the popup opens
 * This part STILL needs to be async to work correctly.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const resp = await sendToActive({ action: "ytq_get_status" });
  
  if (resp?.ok) {
     // Connection is good, enable buttons
     setErrorState(true);
     // Show the correct view based on the response
     showView(resp.running ? 'running' : 'start');
  } else {
    // Failed to communicate (e.g., not a YouTube page)
    setErrorState(false, resp?.error || "Could not connect to this page.");
    // Show start view, but buttons will be disabled
    showView('start'); 
  }
});
// === Add handlers for View Results buttons ===
document.getElementById("btnViewResults")?.addEventListener("click", () => {
  sendToActive({ action: "ytq_show_results" });
  window.close();
});

document.getElementById("btnViewResults2")?.addEventListener("click", () => {
  sendToActive({ action: "ytq_show_results" });
  window.close();
});

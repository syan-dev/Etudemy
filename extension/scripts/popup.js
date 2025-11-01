document.getElementById("btn").addEventListener("click", () => {
  chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    chrome.tabs.sendMessage(
      tabs[0].id,
      {action: "getTranscript"},
      response => {
        if (response && response.length > 0) {
          const text = response.map(r => `[${r.time}] ${r.text}`).join("\n");
          document.getElementById("output").innerText = text;
        } else {
          document.getElementById("output").innerText = "Cannot find transcript";
        }
      }
    );
  });
});

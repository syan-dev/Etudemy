// Hàm mở panel transcript tự động
function openTranscriptPanel() {
  // click nút expand
  const expandButton = document.querySelector('tp-yt-paper-button#expand');
  if (expandButton) {
    expandButton.click();

    // Chờ menu render và tìm nút Show transcript hoặc Hiển thị bản chép lời"
    setTimeout(() => {
      const transcriptButton = document.querySelector('button[aria-label*="transcript" i], button[aria-label*="bản chép lời" i]');
      if (transcriptButton) {
        transcriptButton.click();
        return true; 
        return false;
      }
    }, 1000); 
  } else {
    console.log("Cannot find Expand");
    return false;
  }
}


function getTranscriptFromPanel() {
  const segments = document.querySelectorAll("ytd-transcript-segment-renderer");
  if (segments.length === 0) {
    return [];
  }
  
  return [...segments].map(seg => {
    const time = seg.querySelector(".segment-timestamp")?.innerText.trim() || "";
    const text = seg.querySelector(".segment-text")?.innerText.trim() || "";
    return { time, text };
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "getTranscript") {
    const opened = openTranscriptPanel();
    setTimeout(() => {
      const transcriptData = getTranscriptFromPanel();
      sendResponse(transcriptData);
    }, opened ? 2000 : 0); 
  }
  return true; 
});

// Tự động thử mở panel transcript khi trang tải. Cải tiến sau
setTimeout(openTranscriptPanel, 2000);
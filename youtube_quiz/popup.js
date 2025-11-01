

// File: popup.js
document.getElementById('start').addEventListener('click', async () => {
  // send a message to the active tab to start the quiz overlay
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) return;
  chrome.tabs.sendMessage(tabs[0].id, { action: 'startQuiz' });
  window.close();
});

// File: content.js
// This content script runs on YouTube pages. It listens for a message from the popup
// and then pauses the first <video> it finds and draws an overlay with a question.

(function () {
  // Ensure we don't inject multiple overlays
  let overlayExists = false;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === 'startQuiz') {
      tryStartQuiz();
    }
  });

  function tryStartQuiz() {
    const video = document.querySelector('video');
    if (!video) {
      alert('No video element found on this page. Make sure you are on a YouTube watch page.');
      return;
    }

    if (overlayExists) return; // already showing

    // Pause video
    video.pause();

    // Build overlay
    const overlay = document.createElement('div');
    overlay.id = 'yt-quiz-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(0,0,0,0.6)';
    overlay.style.zIndex = '2147483647';

    // Card
    const card = document.createElement('div');
    card.style.background = 'white';
    card.style.padding = '20px';
    card.style.borderRadius = '8px';
    card.style.maxWidth = '720px';
    card.style.width = '90%';
    card.style.boxShadow = '0 6px 24px rgba(0,0,0,0.3)';

    // Question (you asked me to think of the question)
    const q = document.createElement('h2');
    q.textContent = 'Quiz: Why do habits form in the brain?';
    q.style.marginTop = '0';

    const p = document.createElement('p');
    p.textContent = 'Choose the BEST answer (you must pick the correct one to continue).';

    // Choices
    const choices = [
      { id: 'a', text: 'Because the brain always wants to be active' },
      { id: 'b', text: 'Because the brain links a behavior to a benefit using dopamine' },
      { id: 'c', text: 'Because the environment forces us to do them' },
      { id: 'd', text: 'Because habits are inherited genetically' }
    ];

    const form = document.createElement('div');

    choices.forEach(choice => {
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.margin = '8px 0';
      label.style.cursor = 'pointer';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'yt-quiz-choice';
      input.value = choice.id;
      input.style.marginRight = '8px';

      label.appendChild(input);
      label.appendChild(document.createTextNode(choice.text));
      form.appendChild(label);
    });

    // Feedback area
    const feedback = document.createElement('div');
    feedback.style.minHeight = '22px';
    feedback.style.marginTop = '12px';
    feedback.style.color = 'red';

    // Submit button
    const submit = document.createElement('button');
    submit.textContent = 'Submit';
    submit.style.marginTop = '10px';
    submit.style.padding = '8px 14px';
    submit.style.fontSize = '16px';

    submit.addEventListener('click', () => {
      const selected = document.querySelector('input[name="yt-quiz-choice"]:checked');
      if (!selected) {
        feedback.textContent = 'Vui lòng chọn một đáp án.';
        return;
      }

      // Correct answer is 'b' (as in the video's script)
      if (selected.value === 'b') {
        feedback.style.color = 'green';
        feedback.textContent = 'Chính xác! Tiếp tục xem...';
        // remove overlay and play video
        setTimeout(() => {
          overlay.remove();
          overlayExists = false;
          const v = document.querySelector('video');
          if (v) v.play();
        }, 700);
      } else {
        feedback.style.color = 'red';
        feedback.textContent = 'Sai rồi — hãy thử lại.';
      }
    });

    // Assemble
    card.appendChild(q);
    card.appendChild(p);
    card.appendChild(form);
    card.appendChild(feedback);
    card.appendChild(submit);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    overlayExists = true;

    // Prevent clicks through the overlay
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        // clicking outside the card does nothing
        e.stopPropagation();
      }
    });

    // Accessibility: allow pressing Enter to submit when a radio is focused
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        submit.click();
      }
    });
  }

  // Optional: automatically inject a small control in the page to test
  // (comment out if undesired)
  /*
  const btn = document.createElement('button');
  btn.textContent = 'Start Quiz (Injected)';
  btn.style.position = 'fixed';
  btn.style.bottom = '16px';
  btn.style.right = '16px';
  btn.style.zIndex = 2147483646;
  btn.addEventListener('click', tryStartQuiz);
  document.body.appendChild(btn);
  */
})();

// File: icon48.png
// (You can add any 48x48 PNG icon named icon48.png in the extension folder.)

/*
Instructions to load extension into Chrome/Edge:
1. Create a folder, e.g., `youtube-quiz-extension`.
2. Save the above files into that folder with the exact filenames.
3. Open Chrome and go to chrome://extensions
4. Enable 'Developer mode' (top-right).
5. Click 'Load unpacked' and select the folder.
6. Open a YouTube video, click the extension icon, and press 'Start Quiz'.

Notes:
- This is a minimal example. You can add multiple questions, randomization, timers,
  persistence (chrome.storage), and nicer styling as needed.
- The content script is intentionally simple and only targets the first <video> on the page.
*/

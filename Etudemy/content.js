(() => {
  const CHUNK_WORDS = 80;

  const state = {
  running: false,
  stopping: false,
  model: null,
  results: [],  // ← THÊM DÒNG NÀY
  };

  const QUESTION_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["question", "options", "answerIndex"],
    properties: {
      question: { type: "string", minLength: 8, maxLength: 200 },
      options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string", minLength: 1, maxLength: 120 } },
      answerIndex: { type: "integer", minimum: 0, maximum: 3 },
      explanation: { type: "string" }
    }
  };

  // ... (All functions from $v() down to buildWordChunks() remain unchanged) ...

  const $v = () => document.querySelector("video");
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function wordsCount(s) { return s ? s.trim().split(/\s+/).filter(Boolean).length : 0; }

  function hmsToSeconds(t) {
    if (!t) return NaN;
    const p = t.split(":").map(Number);
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return Number(t) || NaN;
  }

  async function openTranscriptPanel() {
    try {
      document.querySelector("ytd-menu-renderer yt-icon-button#button")?.click();
      await sleep(250);
      const items = Array.from(document.querySelectorAll("ytd-menu-service-item-renderer tp-yt-paper-item"));
      const btn = items.find(el => /transcript/i.test(el.textContent || ""));
      btn?.click();
    } catch {}
  }

  function grabTranscriptNodes() {
    const sel = [
      "ytd-transcript-segment-renderer",
      "ytd-transcript-segment-list-renderer ytd-transcript-segment-renderer",
      'ytd-engagement-panel-section-list-renderer[engagement-panel-section-identifier="engagement-panel-transcript"] ytd-transcript-segment-renderer'
    ].join(",");
    return Array.from(document.querySelectorAll(sel));
  }

  function normalizeSegments(nodes) {
    const items = nodes.map(el => {
      const timeEl = el.querySelector(".segment-timestamp,#segment-timestamp,a[href^='#'],button,time");
      const textEl = el.querySelector(".segment-text,#segment-text,.cue,yt-formatted-string") || el;
      const ts = (timeEl?.textContent || "").trim();
      const text = (textEl?.textContent || "").trim();
      return { ts, text };
    }).filter(x => x.text);
    const segs = [];
    for (let i = 0; i < items.length; i++) {
      const start = hmsToSeconds(items[i].ts);
      const nextStart = hmsToSeconds(items[i + 1]?.ts || "");
      const end = Number.isFinite(nextStart) && nextStart > start ? nextStart : start + 3;
      segs.push({ start, end, text: items[i].text });
    }
    return segs;
  }

  async function ensureTranscriptModule() {
    if (window.TranscriptModule?.readTranscript) return window.TranscriptModule;
    try {
      const url = chrome.runtime.getURL("transcript.js");
      const code = await fetch(url).then(r => r.text());
      const factory = new Function(code + "; return window.TranscriptModule;");
      const mod = factory();
      if (mod?.readTranscript) {
        window.TranscriptModule = mod;
        return mod;
      }
    } catch (e) {
      console.warn("[YTQ] Failed to lazy-load transcript.js:", e);
    }
    return null;
  }

  async function readTranscript() {
    const TM = await ensureTranscriptModule();
    if (!TM) throw new Error("TranscriptModule not loaded");
    const data = await TM.readTranscript(location.href);
    const segs = [];
    for (let i = 0; i < data.segments.length; i++) {
      const [ts, text] = data.segments[i];
      const start = hmsToSeconds(ts);
      const nextStart = hmsToSeconds(data.segments[i + 1]?.[0] || "");
      const end = Number.isFinite(nextStart) && nextStart > start ? nextStart : start + 3;
      if (text && Number.isFinite(start)) segs.push({ start, end, text: String(text).trim() });
    }
    return segs;
  }

  function buildWordChunks(segs, targetWords) {
    const chunks = [];
    let bufText = [];
    let bufStart = null;
    let lastEnd = 0;
    for (const seg of segs) {
      if (bufStart === null) bufStart = seg.start;
      bufText.push(seg.text);
      lastEnd = seg.end;
      if (wordsCount(bufText.join(" ")) >= targetWords) {
        chunks.push({ idx: chunks.length, start: bufStart, end: lastEnd, text: bufText.join(" ") });
        bufText = [];
        bufStart = null;
      }
    }
    if (bufText.length) {
      chunks.push({ idx: chunks.length, start: bufStart ?? 0, end: lastEnd || (bufStart ?? 0) + 3, text: bufText.join(" ") });
    }
    return chunks;
  }

  // ===================================================================
  // FIXED FUNCTIONS START HERE
  // ===================================================================

  /**
   * [FIXED] Injects the quiz-overlay.css file from the extension package.
   */
  async function injectStylesOnce() {
    if (document.getElementById("ytq-overlay-styles")) return;
    try {
      const url = chrome.runtime.getURL("quiz-overlay.css");
      const css = await fetch(url).then(r => r.text());
      const s = document.createElement("style");
      s.id = "ytq-overlay-styles";
      s.textContent = css;
      document.head.appendChild(s);
    } catch (e) {
      console.error("YTQ: Failed to inject quiz-overlay.css", e);
    }
  }
function injectResultsStylesOnce() {
  if (document.getElementById("ytq-results-styles")) return;
  try {
    const s = document.createElement("link");
    s.id = "ytq-results-styles";
    s.rel = "stylesheet";
    s.href = chrome.runtime.getURL("results-panel.css");
    document.head.appendChild(s);
  } catch (e) {
    console.error("[YTQ] Failed to inject results CSS:", e);
  }
}
  // ... (coerceQuestion, normalizeQuestion, isValidQuestion, ensureModel, generateQuestionForChunk functions remain unchanged) ...

  function coerceQuestion(out) {
    let obj = null;
    if (typeof out === "string") {
      try { obj = JSON.parse(out); } catch {
        const m = out.match(/\{[\s\S]*\}/);
        if (m) { try { obj = JSON.parse(m[0]); } catch {} }
      }
    }
    if (!obj && out && typeof out === "object") obj = out;
    if (!obj) return null;
    if (Array.isArray(obj.questions) && obj.questions.length) obj = obj.questions[0];
    if (!obj.options && Array.isArray(obj.choices)) obj.options = obj.choices;
    if (obj.answer && typeof obj.answer === "string") {
      const map = { A:0, B:1, C:2, D:3 };
      const k = obj.answer.trim().toUpperCase()[0];
      if (k in map) obj.answerIndex = map[k];
    }
    if (typeof obj.answerIndex === "string" && /^\d$/.test(obj.answerIndex)) obj.answerIndex = Number(obj.answerIndex);
    if (Array.isArray(obj.options)) obj.options = obj.options.map(s => String(s || "").trim());
    return obj;
  }

  function normalizeQuestion(q, chunkText) {
    if (!q || typeof q !== "object") q = {};
    if (!q.question || String(q.question).trim().length < 6) {
      const head = String(chunkText || "").trim().split(/\s+/).slice(0, 12).join(" ");
      q.question = head ? `Which option best matches: "${head}..."?` : "Choose the correct option.";
    }
    if (!Array.isArray(q.options) || q.options.length === 0) q.options = [];
    q.options = q.options.map(s => String(s || "").trim()).filter(Boolean);
    if (q.options.length > 4) q.options = q.options.slice(0, 4);
    while (q.options.length < 4) {
      const fillers = ["Not mentioned", "Incorrect", "Unrelated", "None of the above"];
      q.options.push(fillers[q.options.length % fillers.length]);
    }
    if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3) q.answerIndex = 0;
    if (!q.explanation || String(q.explanation).trim().length < 5) q.explanation = "Best aligns with the chunk.";
    return q;
  }

  function isValidQuestion(q) {
    return (
      q &&
      typeof q.question === "string" && q.question.trim().length > 5 &&
      Array.isArray(q.options) && q.options.length === 4 &&
      Number.isInteger(q.answerIndex) &&
      q.answerIndex >= 0 && q.answerIndex < 4
    );
  }

  async function ensureModel() {
    if (state.model) return state.model;
    if (!globalThis.LanguageModel?.create) throw new Error("Prompt API unavailable.");
    state.model = await LanguageModel.create();
    return state.model;
  }

  async function generateQuestionForChunk(ch) {
    const model = await ensureModel();
    const prompt = [
      "You are an MCQ generator for YouTube transcript chunks.",
      "Create EXACTLY 1 question with 4 options based ONLY on the chunk below.",
      "Return JSON with: question, options[4], answerIndex (0..3), explanation.",
      "",
      "CHUNK:",
      ch.text
    ].join("\n");

    let q = null;
    try {
      const out = await model.prompt({
        prompt,
        responseConstraint: { type: "json_schema", schema: QUESTION_SCHEMA },
        topK: 1,
        temperature: 0.7
      });
      q = coerceQuestion(out);
    } catch {}

    if (!isValidQuestion(q)) {
      try {
        const raw = await model.prompt(prompt);
        q = coerceQuestion(raw);
      } catch {}
    }

    q = normalizeQuestion(q, ch.text);
    return q;
  }


  /**
   * [FIXED] Loads the overlay from 'quiz-overlay.html' and uses the
   * correct styles from 'quiz-overlay.css'.
   */
  async function showQuestionOverlay(q, questionNumber, totalQuestions) {
    await injectStylesOnce(); // Use the new function to load external CSS
    const v = $v();
    const wasPlaying = !!(v && !v.paused && !v.ended && v.readyState > 2);
    try { v?.pause(); } catch {}

    const overlay = document.createElement("div");
    overlay.className = "ytq-overlay";
    
    // [FIX] Fetch and inject the HTML template
    let box;
    try {
      const url = chrome.runtime.getURL("quiz-overlay.html");
      const html = await fetch(url).then(r => r.text());
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      box = tempDiv.querySelector('.ytq-box');
      if (!box) throw new Error(".ytq-box not found in template");
      overlay.appendChild(box);
    } catch (e) {
      console.error("YTQ: Failed to load quiz-overlay.html", e);
      // Fallback to simple creation if template fails
      box = document.createElement("div");
      box.className = "ytq-box";
      box.textContent = "Error: Could not load quiz UI.";
      overlay.appendChild(box);
    }

    // Get elements from the loaded template
    const title = box.querySelector("#ytq-question-title");
    const buttons = [
      box.querySelector("#ytq-opt-0"),
      box.querySelector("#ytq-opt-1"),
      box.querySelector("#ytq-opt-2"),
      box.querySelector("#ytq-opt-3"),
    ].filter(Boolean); // Filter out nulls if template was wrong
    const sub = box.querySelector("#ytq-feedback-sub");
    const skip = box.querySelector("#ytq-skip-btn");
    // ← THÊM ĐOẠN NÀY (trước dòng title.textContent)
// Add question counter (nếu có tham số questionNumber và totalQuestions)
  if (typeof questionNumber !== 'undefined' && typeof totalQuestions !== 'undefined') {
    const counter = document.createElement("div");
    counter.style.cssText = "text-align:center;margin-bottom:12px;opacity:0.7;font-size:13px;";
    counter.textContent = `Question ${questionNumber} of ${totalQuestions}`;
    box.insertBefore(counter, title);
}
    // Populate template
    if (title) title.textContent = q.question || "Question";
    q.options.forEach((opt, i) => {
      if (buttons[i]) {
        buttons[i].textContent = opt;
      }
    });

    let resolved = false;
    let resolveP;
    const p = new Promise(res => { resolveP = res; });

    const done = (result) => {
      if (resolved) return;
      resolved = true;
      overlay.remove();
      try { if (wasPlaying) v?.play(); } catch {}
      if (typeof resolveP === "function") resolveP(result);
    };

    // Add skip handler
    if (skip) {
      skip.addEventListener("click", () => done({ skipped: true }));
    }

    // [FIX] This logic was correct, but now it operates on the
    // template elements and will be styled by the correct CSS file.
    let locked = false;
    buttons.forEach((btn, i) => {
      btn.addEventListener("click", () => {
        if (locked) return;
        locked = true;
        buttons.forEach(b => b.disabled = true);

        if (i === q.answerIndex) {
          btn.classList.add("ytq-correct");
          setTimeout(() => done({ correct: true, chosen: i }), 500);
        } else {
          btn.classList.add("ytq-wrong");
          const correctBtn = buttons[q.answerIndex];
          if (correctBtn) correctBtn.classList.add("ytq-correct");
          if (sub) sub.textContent = "Showing the correct answer…";
          setTimeout(() => done({ correct: false, chosen: i }), 1200);
        }
      });
    });

    document.body.appendChild(overlay);
    return p;
  }

  // ===================================================================
  // END OF FIXED FUNCTIONS
  // ===================================================================
  // ← THÊM FUNCTION NÀY
// ← THÊM FUNCTION NÀY
async function showResultsPanel() {
  injectResultsStylesOnce();

  // Remove existing panel if any
  const existing = document.querySelector(".ytq-results-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.className = "ytq-results-overlay";

  try {
    const htmlUrl = chrome.runtime.getURL("results-panel.html");
    const htmlContent = await fetch(htmlUrl).then(r => r.text());
    overlay.innerHTML = htmlContent;
  } catch (e) {
    console.error("[YTQ] Failed to load results-panel.html", e);
    return;
  }

  const panel = overlay.querySelector(".ytq-results-panel");
  const closeBtn = overlay.querySelector("#ytq-results-close");
  const scoreText = overlay.querySelector("#ytq-results-score-text");
  const resultsList = overlay.querySelector("#ytq-results-list");

  if (!panel || !closeBtn || !scoreText || !resultsList) {
    console.error("[YTQ] Results panel template missing elements.");
    return;
  }

  // Close button handler
  const closePanel = () => {
    panel.style.animation = "ytqResultsSlideOut 0.3s ease forwards";
    setTimeout(() => overlay.remove(), 300);
  };
  closeBtn.addEventListener("click", closePanel);

  // Calculate stats
  const totalQuestions = state.results.length;
  const correctAnswers = state.results.filter(r => r.correct === true).length;

  // Update score
  scoreText.textContent = `${correctAnswers}/${totalQuestions}`;

  // Render results
  if (totalQuestions === 0) {
    resultsList.innerHTML = `
      <div class="ytq-no-results">
        <div class="ytq-no-results-icon">📝</div>
        <div class="ytq-no-results-text">No quiz results yet.<br>Start a quiz to see results here.</div>
      </div>
    `;
  } else {
    resultsList.innerHTML = "";
    state.results.forEach((result, index) => {
      const item = document.createElement("div");
      item.className = `ytq-result-item ${result.skipped ? 'skipped' : (result.correct ? 'correct' : 'wrong')}`;

      // Question number
      const number = document.createElement("div");
      number.className = "ytq-result-number";
      number.textContent = `Question ${index + 1}`;
      item.appendChild(number);

      // Question text
      const question = document.createElement("div");
      question.className = "ytq-result-question";
      question.textContent = result.question;
      item.appendChild(question);

      if (result.skipped) {
        // Skipped indicator
        const skippedText = document.createElement("div");
        skippedText.style.cssText = "font-style:italic;opacity:0.7;font-size:14px;";
        skippedText.textContent = "⏭️ Skipped";
        item.appendChild(skippedText);
      } else {
        // Options container
        const optionsContainer = document.createElement("div");
        optionsContainer.className = "ytq-options";

        result.options.forEach((option, optIndex) => {
          const optDiv = document.createElement("div");
          optDiv.className = "ytq-option";
          
          // Add class based on correctness
          if (optIndex === result.answerIndex) {
            optDiv.classList.add("correct");
          }
          if (optIndex === result.chosen && !result.correct) {
            optDiv.classList.add("wrong-choice");
          }

          const optText = document.createElement("span");
          optText.textContent = option;
          optDiv.appendChild(optText);

          // Add icon
          if (optIndex === result.answerIndex) {
            const icon = document.createElement("span");
            icon.textContent = "✓";
            icon.style.cssText = "color: #22c55e; font-weight: bold;";
            optDiv.appendChild(icon);
          } else if (optIndex === result.chosen && !result.correct) {
            const icon = document.createElement("span");
            icon.textContent = "✗";
            icon.style.cssText = "color: #ef4444; font-weight: bold;";
            optDiv.appendChild(icon);
          }

          optionsContainer.appendChild(optDiv);
        });

        item.appendChild(optionsContainer);

        // ===== EXPLANATION SECTION (Editable) =====
        const explSection = document.createElement("div");
        explSection.className = "ytq-explanation-section";

        const explHeader = document.createElement("div");
        explHeader.className = "ytq-explanation-header";

        const explTitle = document.createElement("div");
        explTitle.className = "ytq-explanation-title";
        explTitle.innerHTML = "💡 Explanation";
        explHeader.appendChild(explTitle);

        const explActions = document.createElement("div");
        explActions.className = "ytq-explanation-actions";

        const btnEdit = document.createElement("button");
        btnEdit.className = "ytq-btn-edit";
        btnEdit.textContent = "Edit";
        explActions.appendChild(btnEdit);

        const btnDelete = document.createElement("button");
        btnDelete.className = "ytq-btn-delete";
        btnDelete.textContent = "Delete";
        explActions.appendChild(btnDelete);

        explHeader.appendChild(explActions);
        explSection.appendChild(explHeader);

        // Explanation text/textarea
        const explTextDiv = document.createElement("div");
        explTextDiv.className = "ytq-explanation-text";
        explTextDiv.textContent = result.explanation || "";
        if (!result.explanation || result.explanation.trim() === "") {
          explTextDiv.textContent = "No explanation provided.";
          explTextDiv.classList.add("empty");
        }

        const explTextarea = document.createElement("textarea");
        explTextarea.className = "ytq-explanation-textarea";
        explTextarea.style.display = "none";
        explTextarea.value = result.explanation || "";

        explSection.appendChild(explTextDiv);
        explSection.appendChild(explTextarea);

        // Edit mode buttons (hidden initially)
        const explEditActions = document.createElement("div");
        explEditActions.className = "ytq-explanation-actions";
        explEditActions.style.cssText = "display: none; margin-top: 8px;";

        const btnSave = document.createElement("button");
        btnSave.className = "ytq-btn-save";
        btnSave.textContent = "Save";
        explEditActions.appendChild(btnSave);

        const btnCancel = document.createElement("button");
        btnCancel.className = "ytq-btn-cancel";
        btnCancel.textContent = "Cancel";
        explEditActions.appendChild(btnCancel);

        explSection.appendChild(explEditActions);

        // Edit button handler
        btnEdit.addEventListener("click", () => {
          explTextDiv.style.display = "none";
          explTextarea.style.display = "block";
          explActions.style.display = "none";
          explEditActions.style.display = "flex";
          explTextarea.focus();
        });

        // Cancel button handler
        btnCancel.addEventListener("click", () => {
          explTextarea.value = result.explanation || "";
          explTextDiv.style.display = "block";
          explTextarea.style.display = "none";
          explActions.style.display = "flex";
          explEditActions.style.display = "none";
        });

        // Save button handler
        btnSave.addEventListener("click", () => {
          const newExpl = explTextarea.value.trim();
          result.explanation = newExpl;
          explTextDiv.textContent = newExpl || "No explanation provided.";
          if (!newExpl) {
            explTextDiv.classList.add("empty");
          } else {
            explTextDiv.classList.remove("empty");
          }
          explTextDiv.style.display = "block";
          explTextarea.style.display = "none";
          explActions.style.display = "flex";
          explEditActions.style.display = "none";
          console.log("[YTQ] Explanation updated for question", index + 1);
        });

        // Delete button handler
        btnDelete.addEventListener("click", () => {
          if (confirm("Delete this explanation?")) {
            result.explanation = "";
            explTextDiv.textContent = "No explanation provided.";
            explTextDiv.classList.add("empty");
            explTextarea.value = "";
            console.log("[YTQ] Explanation deleted for question", index + 1);
          }
        });

        item.appendChild(explSection);

        // ===== USER NOTE SECTION =====
        const noteSection = document.createElement("div");
        noteSection.className = "ytq-note-section";

        const noteHeader = document.createElement("div");
        noteHeader.className = "ytq-note-header";

        const noteTitle = document.createElement("div");
        noteTitle.className = "ytq-note-title";
        noteTitle.innerHTML = "📌 My Note";
        noteHeader.appendChild(noteTitle);

        const noteToggle = document.createElement("button");
        noteToggle.className = "ytq-note-toggle";
        noteToggle.textContent = result.userNote ? "Edit" : "Add Note";
        noteHeader.appendChild(noteToggle);

        noteSection.appendChild(noteHeader);

        // Note content (collapsed by default)
        const noteContent = document.createElement("div");
        noteContent.className = "ytq-note-content";
        if (result.userNote) {
          noteContent.classList.add("visible");
        }

        const noteTextarea = document.createElement("textarea");
        noteTextarea.className = "ytq-note-textarea";
        noteTextarea.placeholder = "Add your personal note here...";
        noteTextarea.value = result.userNote || "";

        const noteActions = document.createElement("div");
        noteActions.className = "ytq-note-actions";

        const btnSaveNote = document.createElement("button");
        btnSaveNote.className = "ytq-btn-save-note";
        btnSaveNote.textContent = "Save Note";
        noteActions.appendChild(btnSaveNote);

        const btnClearNote = document.createElement("button");
        btnClearNote.className = "ytq-btn-clear-note";
        btnClearNote.textContent = "Clear";
        noteActions.appendChild(btnClearNote);

        noteContent.appendChild(noteTextarea);
        noteContent.appendChild(noteActions);
        noteSection.appendChild(noteContent);

        // Toggle note visibility
        noteToggle.addEventListener("click", () => {
          noteContent.classList.toggle("visible");
          noteTextarea.focus();
        });

        // Save note handler
        btnSaveNote.addEventListener("click", () => {
          const noteText = noteTextarea.value.trim();
          result.userNote = noteText;
          noteToggle.textContent = noteText ? "Edit" : "Add Note";
          console.log("[YTQ] Note saved for question", index + 1);
          
          // Optional: show success feedback
          const originalText = btnSaveNote.textContent;
          btnSaveNote.textContent = "✓ Saved!";
          setTimeout(() => {
            btnSaveNote.textContent = originalText;
          }, 1500);
        });

        // Clear note handler
        btnClearNote.addEventListener("click", () => {
          if (confirm("Clear this note?")) {
            noteTextarea.value = "";
            result.userNote = "";
            noteToggle.textContent = "Add Note";
            noteContent.classList.remove("visible");
            console.log("[YTQ] Note cleared for question", index + 1);
          }
        });

        item.appendChild(noteSection);
      }

      resultsList.appendChild(item);
    });
  }

  document.body.appendChild(overlay);
}
  function waitForVideoToReach(targetSec, epsilon = 0.25) {
    return new Promise((resolve) => {
      const v = $v();
      if (!v || !Number.isFinite(targetSec)) return resolve();
      const reached = () => (v.currentTime + epsilon >= targetSec);

      if (reached()) return resolve();

      let rvfcId = 0;
      let intId = 0;

      const cleanup = () => {
        if (rvfcId && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(rvfcId);
        if (intId) clearInterval(intId);
        v.removeEventListener("seeked", onTick);
        v.removeEventListener("timeupdate", onTick);
      };

      function onTick() {
        if (reached()) { cleanup(); resolve(); }
      }

      if (v.requestVideoFrameCallback) {
        const loop = () => { onTick(); rvfcId = v.requestVideoFrameCallback(loop); };
        rvfcId = v.requestVideoFrameCallback(loop);
      } else {
        intId = setInterval(onTick, 200);
      }

      v.addEventListener("seeked", onTick);
      v.addEventListener("timeupdate", onTick);
    });
  }

  async function sequentialRun() {
    if (state.running) return { ok: false, error: "Already running." };
    state.running = true; state.stopping = false;

    try {
      const v = $v();
      if (!v || !Number.isFinite(v.duration) || v.duration === 0) {
        state.running = false;
        return { ok: false, error: "No ready <video>." };
      }

      const segs = await readTranscript();
      if (!segs.length) {
        state.running = false;
        return { ok: false, error: "No transcript." };
      }

      const chunks = buildWordChunks(segs, CHUNK_WORDS);
      console.log(`[YTQ] Sequential mode. Total chunks: ${chunks.length} (≈${CHUNK_WORDS} words each)`);

      for (let i = 0; i < chunks.length; i++) {
        if (state.stopping) break;
        const ch = chunks[i];

        // 1) Generate question (sequential)
        const q = await generateQuestionForChunk(ch);

        // 2) Log ra console (vẫn như trước)
        const payload = {
          index: ch.idx, start: ch.start, end: ch.end,
          question: q.question, options: q.options,
          answerIndex: q.answerIndex, explanation: q.explanation
        };
        console.log("[YTQ][QUIZ]", payload);

        // 3) CHỜ đến khi video chạm mốc bắt đầu của chunk này
        await waitForVideoToReach(ch.start);

        // 4) Khi đã chạm mốc -> mới popup cho chunk này
        // 4) Khi đã chạm mốc -> mới popup cho chunk này
        const result = await showQuestionOverlay(q, i + 1, chunks.length); // ← THÊM params

// 5) ← THÊM ĐOẠN NÀY - Store result
        state.results.push({
          questionNumber: i + 1,
          question: q.question,
          options: q.options,
          answerIndex: q.answerIndex,
          explanation: q.explanation,
          chosen: result.chosen,
          correct: result.correct,
          skipped: result.skipped || false
});

        console.log("[YTQ][RESULT]", state.results[state.results.length - 1]);

      }

      state.running = false;
      return { ok: true };
    } catch (e) {
      state.running = false;
      return { ok: false, error: e?.message || String(e) };
    }
  }

  function stopSequential() {
    state.stopping = true;
  }

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg?.action === "ytq_sequential_start") {
      sequentialRun().then(r => sendResponse({ ok: !!r.ok, ...r })).catch(err => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (msg?.action === "ytq_sequential_stop") {
      stopSequential(); sendResponse({ ok: true }); return;
    }
    // [FIX] Add the get_status listener from popup.js
    if (msg?.action === "ytq_get_status") {
      sendResponse({ ok: true, running: state.running });
      return;
    }
    if (msg?.action === "ytq_show_results") {
      showResultsPanel();
      sendResponse({ ok: true });
      return;
}
  });
})();
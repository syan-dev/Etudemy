(() => {
  const CHUNK_WORDS = 80;

  const state = {
    running: false,
    stopping: false,
    model: null
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
    } catch { }
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

  function injectStylesOnce() {
    if (document.getElementById("ytq-overlay-styles")) return;
    try {
      const s = document.createElement("link");
      s.id = "ytq-overlay-styles";
      s.rel = "stylesheet";
      s.href = chrome.runtime.getURL("quiz-overlay.css");
      document.head.appendChild(s);
    } catch (e) {
      console.error("[YTQ] Failed to inject overlay CSS:", e);
    }
  }

  function coerceQuestion(out) {
    let obj = null;
    if (typeof out === "string") {
      try { obj = JSON.parse(out); } catch {
        const m = out.match(/\{[\s\S]*\}/);
        if (m) { try { obj = JSON.parse(m[0]); } catch { } }
      }
    }
    if (!obj && out && typeof out === "object") obj = out;
    if (!obj) return null;
    if (Array.isArray(obj.questions) && obj.questions.length) obj = obj.questions[0];
    if (!obj.options && Array.isArray(obj.choices)) obj.options = obj.choices;
    if (obj.answer && typeof obj.answer === "string") {
      const map = { A: 0, B: 1, C: 2, D: 3 };
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
      "You are an MCQ generator for YouTube content.",
      "Create EXACTLY 1 question with 4 options based ONLY on the chunk below.",
      "You don't need to mention `based on Youtube video` or `based on transcript` in the question.",
      "Make the question clear and concise.",
      "Distractors (wrong options) should be plausible but clearly incorrect.",
      "Randomize the order of options.",
      "Avoid using 'All of the above' or 'None of the above' as options.",
      "Do NOT include any explanations in the options.",
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
    } catch { }

    if (!isValidQuestion(q)) {
      try {
        const raw = await model.prompt(prompt);
        q = coerceQuestion(raw);
      } catch { }
    }

    q = normalizeQuestion(q, ch.text);
    return q;
  }

  async function showQuestionOverlay(q) {
    injectStylesOnce();
    const v = $v();
    const wasPlaying = !!(v && !v.paused && !v.ended && v.readyState > 2);
    try { v?.pause(); } catch { }

    const overlay = document.createElement("div");
    overlay.className = "ytq-overlay";

    // --- NEW LOGIC ---
    try {
      // 1. Fetch the HTML template
      const htmlUrl = chrome.runtime.getURL("quiz-overlay.html");
      const htmlContent = await fetch(htmlUrl).then(r => r.text());

      // 2. Inject the HTML into the overlay
      // We wrap it so we can remove the 'ytq-box' easily if needed,
      // but here we'll just set the innerHTML of the overlay.
      overlay.innerHTML = htmlContent;

    } catch (e) {
      console.error("[YTQ] Failed to load quiz-overlay.html", e);
      overlay.innerHTML = `<div class="ytq-box"><h2>Error</h2><p>Could not load quiz UI.</p></div>`;
    }
    // --- END NEW LOGIC ---

    // 3. Find elements *inside* the new HTML
    const box = overlay.querySelector(".ytq-box");
    const title = overlay.querySelector("#ytq-question-title");
    const buttons = [
      overlay.querySelector("#ytq-opt-0"),
      overlay.querySelector("#ytq-opt-1"),
      overlay.querySelector("#ytq-opt-2"),
      overlay.querySelector("#ytq-opt-3"),
    ];
    const sub = overlay.querySelector("#ytq-feedback-sub");
    const skip = overlay.querySelector("#ytq-skip-btn");

    if (!box || !title || !buttons.every(Boolean) || !sub || !skip) {
      console.error("[YTQ] Quiz UI template is missing required elements.");
      try { if (wasPlaying) v?.play(); } catch { }
      return { skipped: true }; // Fail gracefully
    }

    // 4. Populate content
    title.textContent = q.question || "Question";
    q.options.forEach((opt, i) => {
      if (buttons[i]) buttons[i].textContent = opt;
    });

    let resolved = false;
    let resolveP;
    const p = new Promise(res => { resolveP = res; });

    const done = (result) => {
      if (resolved) return;
      resolved = true;

      // Add a fade-out animation
      overlay.style.animation = "ytqFadeOut 0.2s ease forwards";
      overlay.addEventListener("animationend", () => {
        overlay.remove();
      });

      try { if (wasPlaying) v?.play(); } catch { }
      if (typeof resolveP === "function") resolveP(result);
    };

    // 5. Attach event listeners
    skip.addEventListener("click", () => done({ skipped: true }));

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
          sub.textContent = "Showing the correct answer…";
          setTimeout(() => done({ correct: false, chosen: i }), 1200);
        }
      });
    });

    document.body.appendChild(overlay);
    return p;
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
        await showQuestionOverlay(q);
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
      return true; // Keep message port open for async response
    }
    if (msg?.action === "ytq_sequential_stop") {
      stopSequential();
      sendResponse({ ok: true });
      return; // Synchronous, no 'true' needed
    }

    // --- ADD THIS NEW HANDLER ---
    if (msg?.action === "ytq_get_status") {
      sendResponse({ ok: true, running: state.running });
      return; // Synchronous, no 'true' needed
    }
    // --- END OF NEW HANDLER ---
  });
})();
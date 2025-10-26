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

  async function readTranscript() {
    for (let i = 0; i < 10; i++) {
      let nodes = grabTranscriptNodes();
      if (!nodes.length) await openTranscriptPanel();
      if (!nodes.length) { await sleep(600); nodes = grabTranscriptNodes(); }
      if (nodes.length) return normalizeSegments(nodes);
      await sleep(300);
    }
    return [];
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
    const s = document.createElement("style");
    s.id = "ytq-overlay-styles";
    s.textContent = `
      .ytq-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;display:flex;align-items:center;justify-content:center}
      .ytq-box{background:#111;color:#fff;max-width:720px;width:min(92vw,720px);border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.5);padding:20px;line-height:1.45;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial}
      .ytq-box h2{margin:0 0 12px;font-size:18px}
      .ytq-options{display:grid;grid-template-columns:1fr;gap:8px}
      .ytq-options button{border:1px solid #333;background:#1c1c1c;color:#fff;padding:10px 12px;border-radius:10px;text-align:left;cursor:pointer}
      .ytq-options button:hover{background:#232323}
      .ytq-options button.ytq-correct{border-color:#22c55e;background:#16341f}
      .ytq-options button.ytq-wrong{border-color:#ef4444;background:#3a1313}
      .ytq-row{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:10px}
      .ytq-sub{opacity:.8;font-size:12px}
      .ytq-close{cursor:pointer;opacity:.7}
      .ytq-close:hover{opacity:1}
      .ytq-spinner{display:inline-block;width:16px;height:16px;border:2px solid #888;border-top-color:#fff;border-radius:50%;animation:ytqspin 1s linear infinite;margin-right:8px}
      @keyframes ytqspin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(s);
  }

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

  function showQuestionOverlay(q) {
  injectStylesOnce();
  const v = $v();
  const wasPlaying = !!(v && !v.paused && !v.ended && v.readyState > 2);
  try { v?.pause(); } catch {}

  const overlay = document.createElement("div");
  overlay.className = "ytq-overlay";
  const box = document.createElement("div");
  box.className = "ytq-box";
  overlay.appendChild(box);

  const title = document.createElement("h2");
  title.textContent = q.question || "Question";
  box.appendChild(title);

  const opts = document.createElement("div");
  opts.className = "ytq-options";
  box.appendChild(opts);

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

  // render options
  const buttons = [];
  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.textContent = opt;
    btn.dataset.index = String(i);
    opts.appendChild(btn);
    buttons.push(btn);
  });

  // feedback row + skip
  const row = document.createElement("div");
  row.className = "ytq-row";
  const sub = document.createElement("div");
  sub.className = "ytq-sub";
  sub.textContent = "Choose the correct answer ▶";
  row.appendChild(sub);
  const skip = document.createElement("div");
  skip.className = "ytq-close";
  skip.textContent = "✖";
  skip.title = "Skip";
  skip.addEventListener("click", () => done({ skipped: true }));
  row.appendChild(skip);
  box.appendChild(row);

  // click handler: correct -> close fast; wrong -> show correct then close
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

        const q = await generateQuestionForChunk(ch);
        const payload = {
          index: ch.idx, start: ch.start, end: ch.end,
          question: q.question, options: q.options,
          answerIndex: q.answerIndex, explanation: q.explanation
        };
        console.log("[YTQ][QUIZ]", payload);

        await showQuestionOverlay(q); // wait user interaction, then continue
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
  });
})();

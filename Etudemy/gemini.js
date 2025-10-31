// Prompt API + Structured Output (JSON Schema) — bản chống treo

export const QuizGenerator = {
  schema: {
    type: "object",
    required: ["questions"],
    additionalProperties: false,
    properties: {
      questions: {
        type: "array",
        minItems: 4,
        maxItems: 6,
        items: {
          type: "object",
          required: ["question", "choices", "answerIndex", "explanation"],
          additionalProperties: false,
          properties: {
            question: { type: "string", minLength: 5 },
            choices: {
              type: "array",
              minItems: 4,
              maxItems: 4,
              items: { type: "string", minLength: 1 }
            },
            answerIndex: { type: "integer", minimum: 0, maximum: 3 },
            explanation: { type: "string", minLength: 5 }
          }
        }
      }
    }
  },

  async ensureSession(statusEl) {
  if (!("LanguageModel" in self)) {
    throw new Error("Prompt API not supported in this context.");
  }

  const avail = await LanguageModel.availability();
  if (avail === "unavailable") {
    throw new Error("Model unavailable on this device.");
  }

  // ✅ Khai báo ngôn ngữ để hết cảnh báo (API hiện chỉ hỗ trợ en/es/ja cho attestation)
  const session = await LanguageModel.create({
    expectedInputs:  [{ type: "text", languages: ["en"] }],  // hoặc bỏ entirely cũng được
    expectedOutputs: [{ type: "text", languages: ["en"] }],  // <-- quan trọng
    monitor(m) {
      m.addEventListener("downloadprogress", e => {
        if (statusEl) statusEl.textContent = `Đang tải model: ${Math.round(e.loaded * 100)}%`;
      });
    }
  });

  return session;
},


  // Ping đơn giản để kiểm tra model chạy
  async ping(statusEl, timeoutMs = 15000) {
    const session = await this.ensureSession(statusEl);
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort("Ping timeout"), timeoutMs);
    try {
      const res = await session.prompt("Say 'Xin chào' in Vietnamese.", { signal: controller.signal });
      console.log("[PromptAPI] ping reply:", res);
      return res;
    } finally {
      clearTimeout(to);
    }
  },

  async generateQuizFromTranscript(transcript, statusEl, timeoutMs = 45000) {
  const session = await this.ensureSession(statusEl);

  const systemPrompt = `You are a quiz generator. 
From the input transcript, generate 4–6 multiple-choice questions.
Each question must have 4 options (A–D) and exactly 1 correct answer.
Return ONLY valid JSON matching this schema:
{
  "questions": [
    {
      "question": "string",
      "choices": ["A", "B", "C", "D"],
      "answerIndex": 0,
      "explanation": "string"
    }
  ]
}`;

  const userPrompt = `TRANSCRIPT:\n${transcript}`;

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort("Timeout"), timeoutMs);

  try {
    const result = await session.prompt(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      {
        responseConstraint: this.schema, // structured output
        signal: controller.signal
      }
    );
    // Trường hợp structured output thành công
    return JSON.parse(result);
  } catch (err) {
    console.warn("Structured output failed, retrying as plain text:", err);
    // fallback sang plain text
    const raw = await session.prompt(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      { signal: controller.signal }
    );
    try {
      return JSON.parse(raw);
    } catch {
      // cố gắng parse JSON thủ công nếu model in text
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error("Model output not JSON: " + raw.slice(0, 200));
    }
  } finally {
    clearTimeout(to);
  }
}
};

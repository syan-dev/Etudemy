const questions = [
  { time: 30, question: "According to the video, which of the following is NOT mentioned as a way to stop nail-biting?", options: ["Wearing gloves all day", "Dipping hands in salt", "Applying chili on skin", "Drinking more water"], correct: 3 },
  { time: 56, question: "According to scientists, what is a 'habit'?", options: ["Random daily behaviors", "Actions repeated often and embedded in the subconscious", "Things forced by others", "Actions only when stressed"], correct: 1 },
  { time: 86, question: "Which brain chemical is linked to pleasure and neuroplasticity in habit formation?", options: ["Serotonin", "Dopamine", "Adrenaline", "Endorphin"], correct: 1 },
  { time: 117, question: "When the loop 'cue - behavior - reward' is triggered, what happens?", options: ["The brain stops to decide", "You easily control behavior", "Decision-making is overridden", "You lose pleasure"], correct: 2 },
  { time: 153, question: "On average, how much time do people spend on repeated actions daily?", options: ["10%", "25%", "40%", "70%"], correct: 2 },
  { time: 179, question: "What alone is NOT enough for long-term behavioral change?", options: ["The intention to change", "Understanding habits", "Thorough planning", "Changing environment"], correct: 0 },
  { time: 211, question: "When is the 'perfect' time to break or form a new habit?", options: ["When stressed", "When changing environment or schedule", "When staying up late", "When busy"], correct: 1 },
  { time: 232, question: "What did the 2005 study show about students’ habits after transferring schools?", options: ["Their habits stayed the same", "They formed more bad habits", "Even hard-to-break habits changed", "They couldn’t form new habits"], correct: 2 },
  { time: 261, question: "In 'habit reversal', which example was given?", options: ["Post a note saying 'Don't bite nails'", "Use a small toy instead when stressed", "Wash hands many times", "Write a mood journal"], correct: 1 },
  { time: 277, question: "Why should we focus on good habits?", options: ["They’re easier to form", "They make us more adaptable and successful", "They need no practice", "They make us forget bad habits"], correct: 1 }
];

let answeredQuestions = new Set();
let results = [];

const video = document.querySelector("video");

if (video) {
  const observer = setInterval(() => {
    const currentTime = Math.floor(video.currentTime);
    const q = questions.find(q => q.time === currentTime && !answeredQuestions.has(q.time));
    if (q) {
      showQuestion(q);
      answeredQuestions.add(q.time);
    }
    if (currentTime >= Math.floor(video.duration) - 1) {
      clearInterval(observer);
      showSummary();
    }
  }, 1000);
}

function showQuestion(q) {
  video.pause();

  const overlay = document.createElement("div");
  overlay.className = "quiz-overlay";

  const box = document.createElement("div");
  box.className = "quiz-box";

  const questionEl = document.createElement("h2");
  questionEl.textContent = q.question;
  box.appendChild(questionEl);

  let answeredWrongFirst = false;
  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "quiz-option";
    btn.textContent = opt;
    btn.onclick = () => {
      if (i === q.correct) {
        btn.classList.add("correct");
        results.push({ ...q, correct: true, firstTryWrong: answeredWrongFirst });
        setTimeout(() => {
          overlay.remove();
          video.play();
        }, 700);
      } else {
        btn.classList.add("wrong");
        answeredWrongFirst = true;
      }
    };
    box.appendChild(btn);
  });

  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function showSummary() {
  const overlay = document.createElement("div");
  overlay.className = "summary-overlay";

  const box = document.createElement("div");
  box.className = "summary-box";

  const title = document.createElement("h2");
  title.textContent = "Quiz Summary";
  box.appendChild(title);

  let correctCount = 0;
  results.forEach(r => {
    const p = document.createElement("p");
    const firstWrong = r.firstTryWrong ? "(First try wrong)" : "(First try correct)";
    const isCorrect = !r.firstTryWrong;
    if (isCorrect) correctCount++;
    p.textContent = `${r.question} → ${r.options[r.correct]} ${firstWrong}`;
    p.className = isCorrect ? "summary-correct" : "summary-wrong";
    box.appendChild(p);
  });

  const score = document.createElement("h3");
  score.textContent = `Score: ${correctCount}/${results.length}`;
  box.appendChild(score);

  const closeBtn = document.createElement("span");
  closeBtn.textContent = "✖";
  closeBtn.className = "close-summary";
  closeBtn.onclick = () => overlay.remove();
  box.appendChild(closeBtn);

  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

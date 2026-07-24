/*
 * quiz.js
 * Renderiza el cuestionario final de cada lección y marca el progreso.
 * Cada lección define su propio array `LESSON_QUIZ` antes de cargar este script:
 *   var LESSON_QUIZ = [
 *     { q: "¿Pregunta?", options: ["A","B","C","D"], correct: 1, explain: "Por qué." }
 *   ];
 */

function renderQuiz(containerId, questions, nivel, leccionId, opts) {
  opts = opts || {};
  var passPct = opts.passPct || 70;
  var container = document.getElementById(containerId);
  if (!container || !questions || !questions.length) return;

  var answers = new Array(questions.length).fill(null);

  var html = "";
  questions.forEach(function (item, qi) {
    html += '<div class="quiz-q" data-qi="' + qi + '">';
    html += '<p class="q-text">' + (qi + 1) + ". " + item.q + "</p>";
    html += '<div class="quiz-options">';
    item.options.forEach(function (opt, oi) {
      html += '<label class="quiz-option" data-qi="' + qi + '" data-oi="' + oi + '">' +
        '<input type="radio" name="q' + qi + '" style="margin:0" /> <span>' + opt + "</span></label>";
    });
    html += "</div>";
    html += '<p class="quiz-feedback" data-qi="' + qi + '" style="display:none"></p>';
    html += "</div>";
  });
  html += '<button class="btn btn-primary" id="quizSubmit">Comprobar y completar lección</button>' +
    '<p class="quiz-feedback" id="quizResult" style="margin-top:14px"></p>';

  container.innerHTML = html;

  container.querySelectorAll(".quiz-option").forEach(function (label) {
    label.addEventListener("click", function () {
      var qi = parseInt(label.getAttribute("data-qi"), 10);
      var oi = parseInt(label.getAttribute("data-oi"), 10);
      answers[qi] = oi;
      container.querySelectorAll('.quiz-option[data-qi="' + qi + '"]').forEach(function (l) {
        l.classList.remove("correct", "incorrect");
      });
      label.querySelector("input").checked = true;
    });
  });

  document.getElementById("quizSubmit").addEventListener("click", function () {
    var unanswered = answers.indexOf(null);
    var resultEl = document.getElementById("quizResult");
    if (unanswered !== -1) {
      resultEl.textContent = "Responde a todas las preguntas antes de comprobar el resultado.";
      resultEl.className = "quiz-feedback ko";
      document.querySelector('.quiz-q[data-qi="' + unanswered + '"]').scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    var correctCount = 0;
    questions.forEach(function (item, qi) {
      var isCorrect = answers[qi] === item.correct;
      if (isCorrect) correctCount++;
      container.querySelectorAll('.quiz-option[data-qi="' + qi + '"]').forEach(function (l) {
        var oi = parseInt(l.getAttribute("data-oi"), 10);
        if (oi === item.correct) l.classList.add("correct");
        else if (oi === answers[qi]) l.classList.add("incorrect");
      });
      var fb = container.querySelector('.quiz-feedback[data-qi="' + qi + '"]');
      fb.style.display = "block";
      fb.className = "quiz-feedback " + (isCorrect ? "ok" : "ko");
      fb.textContent = (isCorrect ? "✓ Correcto. " : "✗ Incorrecto. ") + (item.explain || "");
    });

    var pct = Math.round((correctCount / questions.length) * 100);
    if (pct >= passPct) {
      Progress.markDone(nivel, leccionId, true);
      resultEl.textContent = "Resultado: " + correctCount + "/" + questions.length + " (" + pct + "%). ¡Lección completada!";
      resultEl.className = "quiz-feedback ok";
      document.dispatchEvent(new CustomEvent("invia:lesson-done"));
    } else {
      resultEl.textContent = "Resultado: " + correctCount + "/" + questions.length + " (" + pct + "%). Necesitas al menos " + passPct + "% para completar la lección. Revisa las respuestas marcadas y vuelve a intentarlo.";
      resultEl.className = "quiz-feedback ko";
    }
  });
}

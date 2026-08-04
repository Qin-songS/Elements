const hints = [
  "先不要判断句子的内容恰好为真还是为假。先问：它有没有资格拥有真值？",
  "命令要求行动，问题要求回答；它们都没有在断言某种情况，因此可以先排除。",
  "含有未指定对象 x 的表达式还没有封闭。四项中只有 A 是对象已指定的陈述。"
];

const phaseOrder = ["think", "check", "reference", "record"];

export function initBuildMode() {
  const elements = {
    svg: document.querySelector("#constructionSvg"),
    instructionLabel: document.querySelector("#buildInstructionLabel"),
    instruction: document.querySelector("#buildInstruction"),
    status: document.querySelector("#buildStageStatus"),
    prompt: document.querySelector(".offline-prompt"),
    toast: document.querySelector("#buildToast"),
    completionMark: document.querySelector("#completionMark"),
    challengeStatus: document.querySelector("#challengeStatus"),
    inspector: document.querySelector("#buildInspector"),
    selfCheckSection: document.querySelector("#selfCheckSection"),
    selfCheckActionSection: document.querySelector("#selfCheckActionSection"),
    beginSelfCheck: document.querySelector("#beginSelfCheck"),
    beginSelfCheckSide: document.querySelector("#beginSelfCheckSide"),
    showReferenceCenter: document.querySelector("#showReferenceCenter"),
    referenceProof: document.querySelector("#referenceProofSection"),
    assessmentSection: document.querySelector("#assessmentSection"),
    completeSection: document.querySelector("#buildCompleteSection"),
    completionHeading: document.querySelector("#completionHeading"),
    completionDescription: document.querySelector("#completionDescription"),
    hintButtons: [document.querySelector("#hintButton"), document.querySelector("#hintButtonCenter")],
    hintCopy: document.querySelector("#hintCopy"),
    actionCount: document.querySelector("#buildActionCount"),
    hintCount: document.querySelector("#buildHintCount"),
    reset: document.querySelector("#buildReset"),
    resetTop: document.querySelector("#buildResetTop"),
    place: document.querySelector("#placeInEdifice"),
    routeOne: document.querySelector("#routeChallengeOne"),
    routeTwo: document.querySelector("#routeChallengeTwo"),
    progressBar: document.querySelector("#routeProgressBar"),
    progressText: document.querySelector("#routeProgressText")
  };

  let state = freshState();
  let toastTimer;

  bindEvents();
  render();

  return {
    reset: resetChallenge,
    onActivated: render
  };

  function freshState() {
    return {
      phase: "think",
      hintLevel: 0,
      revealedChecks: new Set(),
      referenceOpened: false,
      assessment: null,
      placed: false
    };
  }

  function bindEvents() {
    elements.hintButtons.forEach((button) => button.addEventListener("click", revealHint));
    elements.beginSelfCheck.addEventListener("click", beginSelfCheck);
    elements.beginSelfCheckSide.addEventListener("click", () => {
      if (state.phase === "think") beginSelfCheck();
      else if (state.phase === "check") revealReference();
    });
    elements.showReferenceCenter.addEventListener("click", revealReference);
    elements.reset.addEventListener("click", resetChallenge);
    elements.resetTop.addEventListener("click", resetChallenge);
    elements.place.addEventListener("click", placeInEdifice);

    document.querySelectorAll("[data-reveal-check]").forEach((button) => {
      button.addEventListener("click", () => revealCheck(Number(button.dataset.revealCheck)));
    });

    document.querySelectorAll("[data-assessment]").forEach((button) => {
      button.addEventListener("click", () => recordAssessment(button.dataset.assessment));
    });
  }

  function revealHint() {
    state.hintLevel = Math.min(state.hintLevel + 1, hints.length);
    render();
    showToast(`已打开第 ${state.hintLevel} 层提示。`, false);
  }

  function beginSelfCheck() {
    if (state.phase !== "think") return;
    state.phase = "check";
    render();
    showToast("先在脑中回答三个问题，再逐项揭示核对。", false);
    window.dispatchEvent(new CustomEvent("build:open-inspector"));
  }

  function revealCheck(index) {
    state.revealedChecks.add(index);
    render();
  }

  function revealReference() {
    if (state.phase === "think") beginSelfCheck();
    state.phase = "reference";
    state.referenceOpened = true;
    render();
    showToast("参考证明已展开。现在比较它与你的思路。", false);
    window.dispatchEvent(new CustomEvent("build:open-inspector"));
  }

  function recordAssessment(assessment) {
    if (!state.referenceOpened) return;

    if (assessment === "independent" && state.hintLevel > 0) {
      showToast("本次已经查看过提示，更适合记录为“提示后完成”。", true);
      return;
    }

    state.assessment = assessment;
    if (assessment === "independent" || assessment === "hinted") {
      state.phase = "record";
      render();
      showToast("学习状态已记录；确认后即可安放这条命题。", false);
    } else {
      render();
      showToast(
        assessment === "redo" ? "已标记为需要重做，下一关暂不解锁。" : "已保留当前关卡，可以继续查看提示和证明。",
        false
      );
    }
  }

  function placeInEdifice() {
    if (state.phase !== "record" || state.placed) return;
    state.placed = true;
    render();
    showToast("地基 M.1 已安放。下一关“真值与否定”已解锁。", false);
  }

  function resetChallenge() {
    state = freshState();
    render();
    showToast("已回到题目。参考证明和提示重新收起。", false);
  }

  function render() {
    renderDiagram();
    renderPhase();
    renderHints();
    renderChecks();
    renderAssessment();
    renderRoute();
  }

  function renderDiagram() {
    const showSolution = state.referenceOpened;
    const grid = [];
    for (let x = 70; x <= 850; x += 78) grid.push(`<line class="construction-axis" x1="${x}" y1="55" x2="${x}" y2="565"></line>`);
    for (let y = 70; y <= 550; y += 80) grid.push(`<line class="construction-axis" x1="55" y1="${y}" x2="865" y2="${y}"></line>`);

    elements.svg.innerHTML = `
      <g aria-hidden="true">${grid.join("")}</g>
      <text class="construction-note" x="70" y="48">FOUNDATION GATE · WHAT CAN BE TRUE OR FALSE?</text>
      <g class="marker-example" aria-hidden="true">
        <circle cx="460" cy="116" r="25"></circle>
        <text x="500" y="110">标记 A</text>
        <text class="marker-note" x="500" y="130">已经显示为金色圆点</text>
      </g>
      ${renderExpressionCard("A", 90, 190, "标记 A 是金色的。", showSolution ? "命题 · 真值为真" : "等待分类", showSolution ? "answer" : "")}
      ${renderExpressionCard("B", 490, 190, "请把标记 A 涂成金色。", showSolution ? "命令 · 没有真值" : "等待分类", showSolution ? "rejected" : "")}
      ${renderExpressionCard("C", 90, 350, "标记 x 是金色的。", showSolution ? "开放表达式 · x 尚未指定" : "等待分类", showSolution ? "rejected" : "")}
      ${renderExpressionCard("D", 490, 350, "标记 A 是金色的吗？", showSolution ? "问题 · 没有真值" : "等待分类", showSolution ? "rejected" : "")}
      ${showSolution
        ? `<text class="reference-caption" x="460" y="545" text-anchor="middle">A 是命题；B、C、D 仍不能直接被判定为真或假</text>`
        : `<text class="reference-caption is-muted" x="460" y="545" text-anchor="middle">先在纸上分类，再回来核对</text>`}
    `;
  }

  function renderPhase() {
    const phaseIndex = state.placed ? 3 : Math.max(0, phaseOrder.indexOf(state.phase));
    document.querySelectorAll("[data-phase-step]").forEach((step, index) => {
      step.classList.toggle("is-current", index === phaseIndex);
      step.classList.toggle("is-complete", index < phaseIndex);
    });

    const copy = {
      think: ["思考阶段", "请在本子上分类并写出理由；这里不要求输入或操作。", "独立思考"],
      check: ["自检阶段", "先在脑中回答右侧三个关键问题，再揭示检查点。", "核对关键点"],
      reference: ["对照阶段", "参考分类已经展开；比较它与你自己的理由是否一致。", "对照证明"],
      record: ["记录阶段", "选择这次完成方式，确认理解后再把规则安放进大厦。", "等待安放"]
    };
    const current = state.placed ? ["建造完成", "规则 M.1 已成为新的地基，下一关已经解锁。", "地基已安放"] : copy[state.phase];
    elements.instructionLabel.textContent = current[0];
    elements.instruction.textContent = current[1];
    elements.status.textContent = current[2];

    const promptContent = {
      think: ["离开屏幕完成", "找出唯一能够直接判定真假的表达式。", "重点不是它恰好为真还是为假，而是它是否已经具备真值。"],
      check: ["暂不看答案", "用三个问题检查自己的推导。", "先回答，再点击右侧的“揭示检查点”。不需要把答案输入电脑。"],
      reference: ["参考分类", "只有封闭的陈述能够进入证明。", "逐条比较四种表达式，检查你的理由是否同时考虑了句子功能和对象指称。"],
      record: ["完成记录", "你已经完成了分类与对照。", "选择真实的完成情况；只有理解确认后，这条规则才会成为后续地基。"]
    };
    const prompt = state.placed ? ["已经安放", "规则 M.1 成为新的可用知识。", "M.2“真值与否定”已经解锁。"] : promptContent[state.phase];
    elements.prompt.querySelector(".eyebrow").textContent = prompt[0];
    elements.prompt.querySelector("h3").textContent = prompt[1];
    elements.prompt.querySelector("p:last-child").textContent = prompt[2];

    elements.beginSelfCheck.hidden = state.phase !== "think";
    elements.showReferenceCenter.hidden = state.phase !== "check";
    elements.selfCheckSection.hidden = state.phase === "think";
    elements.referenceProof.hidden = !state.referenceOpened;
    elements.assessmentSection.hidden = !state.referenceOpened || state.placed;

    elements.selfCheckActionSection.hidden = state.referenceOpened || state.phase === "record";
    elements.beginSelfCheckSide.textContent = state.phase === "check" ? "查看参考证明" : "我已完成，开始核对";
    elements.challengeStatus.textContent = state.placed
      ? "已安放"
      : state.phase === "think"
        ? "思考中"
        : state.phase === "check"
          ? "核对中"
          : state.phase === "reference"
            ? "等待记录"
            : "可以安放";
  }

  function renderHints() {
    elements.hintCopy.textContent = state.hintLevel ? hints[state.hintLevel - 1] : "提示默认隐藏。只有卡住时再打开，不影响你继续尝试。";
    elements.hintButtons.forEach((button) => {
      button.textContent = state.hintLevel === 0 ? "给我一点提示" : state.hintLevel < hints.length ? "再给一点提示" : "已显示完整提示";
      button.disabled = state.hintLevel >= hints.length || state.placed;
    });
    elements.hintCount.textContent = state.hintLevel;
  }

  function renderChecks() {
    document.querySelectorAll("[data-check-index]").forEach((item) => {
      const index = Number(item.dataset.checkIndex);
      const revealed = state.revealedChecks.has(index);
      item.classList.toggle("is-revealed", revealed);
      item.querySelector("span").hidden = !revealed;
      const button = item.querySelector("button");
      button.hidden = revealed;
    });
    elements.actionCount.textContent = state.revealedChecks.size + Number(state.referenceOpened);
  }

  function renderAssessment() {
    document.querySelectorAll("[data-assessment]").forEach((button) => {
      button.classList.toggle("is-selected", state.assessment === button.dataset.assessment);
      button.disabled = state.placed || (button.dataset.assessment === "independent" && state.hintLevel > 0);
    });

    const canPlace = state.phase === "record";
    elements.completeSection.hidden = !canPlace && !state.placed;
    elements.inspector.classList.toggle("is-complete", canPlace || state.placed);
    elements.inspector.classList.toggle("is-placed", state.placed);
    elements.completionMark.classList.toggle("is-visible", canPlace || state.placed);
    elements.completionMark.querySelector("strong").textContent = state.placed ? "已经安放" : "理解确认";

    if (state.assessment === "independent") {
      elements.completionHeading.textContent = "这块砖可以安放了。";
      elements.completionDescription.textContent = "你在没有提示的情况下完成分类，并对照确认了三个判断门槛。";
    } else if (state.assessment === "hinted") {
      elements.completionHeading.textContent = "理解已经形成。";
      elements.completionDescription.textContent = "你借助提示完成了分类，并理解了参考理由。";
    }

    elements.place.disabled = state.placed;
    elements.place.textContent = state.placed ? "已安放 · 真值与否定已解锁" : "安放到知识大厦";
  }

  function renderRoute() {
    elements.routeOne.classList.toggle("is-active", !state.placed);
    elements.routeOne.classList.toggle("is-complete", state.placed);
    elements.routeOne.querySelector("small").textContent = state.placed ? "已经安放" : "当前挑战";
    elements.routeOne.querySelector("i").textContent = state.placed ? "✓" : "";

    elements.routeTwo.classList.toggle("is-locked", !state.placed);
    elements.routeTwo.classList.toggle("is-new", state.placed);
    elements.routeTwo.querySelector("small").textContent = state.placed ? "下一关已解锁" : "完成上一关后解锁";
    elements.routeTwo.querySelector("i").textContent = state.placed ? "→" : "⌁";
    elements.progressBar.style.width = state.placed ? "10%" : "0%";
    elements.progressText.textContent = state.placed ? "1 / 10 块地基" : "0 / 10 块地基";
  }

  function showToast(message, isError) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("is-error", isError);
    elements.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
  }
}

function renderExpressionCard(label, x, y, copy, note, stateClass) {
  return `
    <g class="expression-card ${stateClass ? `is-${stateClass}` : ""}" aria-hidden="true">
      <rect x="${x}" y="${y}" width="340" height="116"></rect>
      <text class="expression-index" x="${x + 20}" y="${y + 28}">${label}</text>
      <text class="expression-copy" x="${x + 20}" y="${y + 65}">${copy}</text>
      <text class="expression-note" x="${x + 20}" y="${y + 94}">${note}</text>
      ${stateClass === "answer" ? `<path class="expression-check" d="M ${x + 298} ${y + 26} l 8 8 16 -19"></path>` : ""}
    </g>
  `;
}

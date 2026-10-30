export function createLabPanel({
  onGenerate,
  onToolChange,
  onEffectSettings,
  onCompare,
  onReset,
  onQuickAction,
  onClearDrawing,
  onAuthorship = () => null,
  onClose = () => {},
  onDone = () => {}
}) {
  const panel = document.createElement('aside');
  panel.className = 'xp-panel';

  panel.innerHTML = `
    <div class="xp-titlebar">
      <span class="xp-title-icon">✦</span>
      <span>WHY BOTHER? — Creative Lab</span>
      <div class="xp-window-controls">
        <button type="button" aria-label="Minimize">_</button>
        <button type="button" aria-label="Maximize">□</button>
        <button type="button" class="xp-close" aria-label="Close">×</button>
      </div>
    </div>

    <div class="xp-menubar">
      <span>File</span><span>Edit</span><span>View</span><span>Help</span>
    </div>

    <div class="xp-content">
      <section class="xp-section intro-section">
        <div class="section-heading">
          <span class="heading-icon">🤖</span>
          <div>
            <span class="eyebrow">GENERATIVE LAB</span>
            <h1>What do you want<br>to create?</h1>
          </div>
        </div>
        <p class="muted">The machine makes a version. You make it yours.</p>

        <div class="chat-window" id="chat-messages">
          <div class="chat-message ai-message">
            <span class="message-avatar">✦ AI</span>
            <p>Hello! I can make almost anything. Understanding it is another story.</p>
          </div>
        </div>

        <form id="prompt-form" class="prompt-form">
          <textarea id="prompt-input" rows="3"
            placeholder="A floating garden, perfect symmetry, organized chaos..."></textarea>
          <button class="xp-button primary-button" type="submit">✦ GENERATE</button>
        </form>
      </section>

      <section class="xp-section">
        <div class="xp-section-title">
          <span>🛠</span><h2>Your creative tools</h2>
        </div>

        <div class="human-only-tag">✦ HUMAN ONLY — YOUR TOOLS</div>

        <div class="tool-grid">
          <button class="xp-button tool-button active" data-mode="MOVE">↖ MOVE</button>
          <button class="xp-button tool-button draw-tool" data-mode="DRAW">✎ DRAW</button>
          <button class="xp-button tool-button" data-mode="EFFECT">✺ EFFECT</button>
          <button class="xp-button tool-button" data-mode="SCALE">↗ SCALE</button>
          <button class="xp-button tool-button" data-mode="ROTATE">⟳ ROTATE</button>
          <button class="xp-button tool-button" data-mode="COLOR">◉ COLOR</button>
          <button class="xp-button tool-button" data-mode="DUPLICATE">▣ DUPLICATE</button>
          <button class="xp-button tool-button" data-mode="ALIGN">▦ ALIGN ALL</button>
          <button class="xp-button tool-button" data-mode="CONNECT">⌁ CONNECT</button>
          <button class="xp-button tool-button" data-mode="DELETE">× DELETE</button>
          <button class="xp-button tool-button" data-mode="REPAIR">✳ REPAIR</button>
        </div>

        <div class="draw-instructions" id="draw-instructions">
          <strong>✎ YOUR MARKER</strong>
          <p>Draw a shape in the space. Your figures will follow your gesture.</p>
          <button class="xp-button clear-drawing-button" id="clear-drawing">CLEAR DRAWING</button>
        </div>

        <div class="effect-studio" id="effect-studio">
          <div class="effect-studio-heading">
            <strong>✺ EFFECT STUDIO</strong>
            <span>HUMAN ONLY</span>
          </div>

          <p class="effect-description">Brush over several objects to style them at once.</p>

          <div class="effect-grid">
            <button class="effect-choice active" data-effect="NEON">NEON</button>
            <button class="effect-choice" data-effect="FIRE">🔥 FIRE</button>
            <button class="effect-choice" data-effect="CHROME">CHROME</button>
            <button class="effect-choice" data-effect="GLITCH">GLITCH</button>
            <button class="effect-choice" data-effect="GLOW">GLOW</button>
            <button class="effect-choice" data-effect="OUTLINE">OUTLINE</button>
            <button class="effect-choice remove-effect" data-effect="NONE">✕ REMOVE</button>
          </div>

          <label class="effect-control">
            <span>COLOR</span>
            <input id="effect-color" type="color" value="#8d65ff">
          </label>

          <label class="effect-control">
            <span>INTENSITY <output id="intensity-value">100%</output></span>
            <input id="effect-intensity" type="range" min="10" max="200" value="100">
          </label>

          <label class="effect-control">
            <span>BRUSH SIZE <output id="size-value">2.0</output></span>
            <input id="effect-size" type="range" min="5" max="45" value="20">
          </label>

          <label class="effect-control">
            <span>ANIMATION SPEED <output id="speed-value">1.0x</output></span>
            <input id="effect-speed" type="range" min="0" max="30" value="10">
          </label>

          <button class="xp-button effect-apply" id="activate-effect">✺ ACTIVATE EFFECT BRUSH</button>
          <p class="effect-tip">Choose an effect, activate the brush, then paint over your composition.</p>
        </div>

        <p class="tool-hint" id="tool-hint">Drag objects around. Make a mess.</p>
      </section>

      <section class="xp-section">
        <div class="xp-section-title">
          <span>⚡</span><h2>Quick experiments</h2>
        </div>
        <p class="muted small">Try a new direction with one click.</p>
        <div class="quick-grid">
          <button class="xp-button quick-button" data-action="scatter">↗ Scatter</button>
          <button class="xp-button quick-button" data-action="orbit">◎ Orbit</button>
          <button class="xp-button quick-button" data-action="grid">▦ Grid</button>
          <button class="xp-button quick-button" data-action="spiral">〰 Spiral</button>
        </div>
      </section>

      <section class="xp-section process-section">
        <div class="xp-section-title">
          <span>◷</span><h2>The process</h2>
        </div>
        <div class="comparison-buttons">
          <button class="xp-button" id="show-ai">AI RESULT</button>
          <button class="xp-button" id="show-human">YOUR VERSION</button>
        </div>
        <button class="xp-button authors-button" id="show-authors" type="button">? WHO DECIDED THIS?</button>
        <div class="author-legend" id="author-legend" hidden>
          <div><i class="dot dot-hand"></i> I decided <b id="author-hand">0</b></div>
          <div><i class="dot dot-shared"></i> I placed it, the machine moved it <b id="author-shared">0</b></div>
          <div><i class="dot dot-machine"></i> The machine decided <b id="author-machine">0</b></div>
        </div>
        <div class="process-stats">
          <span id="intervention-count">0 HUMAN INTERVENTIONS</span>
          <span id="composition-count">48 OBJECTS</span>
        </div>

        <div class="care-meter">
          <div class="care-meter-label">
            <span>YOUR HAND</span>
            <span>THE MACHINE</span>
          </div>
          <div class="care-meter-track">
            <div class="care-meter-fill" id="care-fill"></div>
          </div>
          <div class="care-meter-value" id="care-value">0% STILL YOURS</div>
          <p class="care-meter-hint">What you touch tends to stay. What you leave, the machine tidies. Sometimes it is beautiful.</p>
        </div>

        <div class="history-list" id="history-list"></div>
      </section>

      <section class="xp-section final-question">
        <span class="eyebrow">A QUESTION FOR YOU</span>
        <h2>If the result already exists,<br>why bother?</h2>
        <p class="muted">Maybe not to beat the machine. Maybe to notice what you decided, and what was decided for you.</p>
        <button class="xp-button restart-button" id="reset-lab">↻ START AGAIN</button>
      </section>
    </div>

    <div class="xp-actions">
      <button class="xp-button back-button" id="back-to-work" type="button">← VOLVER A LA OBRA</button>
      <button class="xp-button done-button" id="done-lab" type="button">✓ LISTO</button>
    </div>

    <div class="xp-statusbar">
      <span id="status-message">Ready</span>
      <span>Creative Lab 1.0</span>
    </div>
  `;

  document.body.appendChild(panel);

  const $ = selector => panel.querySelector(selector);
  const chat = $('#chat-messages');
  const promptInput = $('#prompt-input');
  const generateButton = $('.primary-button');
  const historyList = $('#history-list');

  const toolHints = {
    MOVE: 'Drag an object to decide where it belongs.',
    DRAW: 'Draw directly in the space. Your figures follow your gesture.',
    EFFECT: 'Brush over your objects. Style several in one stroke.',
    SCALE: 'Click a figure to make it bigger or smaller.',
    ROTATE: 'Click a figure to change its orientation.',
    COLOR: 'Click a figure to cycle through the color palette.',
    DUPLICATE: 'Click a figure to make a copy.',
    ALIGN: 'Click ALIGN ALL to organize the entire composition.',
    CONNECT: 'Select two objects to create a relationship. Relationships hold things together.',
    DELETE: 'Remove things. Empty space is also a decision.',
    REPAIR: 'Try to fix what the machine thought was finished.'
  };

  let generating = false;
  let replyTimer = null;
  let selectedEffect = 'NEON';
  let tidying = false;
  let authorsShown = false;

  function addMessage(message, type = 'ai') {
    const item = document.createElement('div');
    item.className = `chat-message ${type}-message`;

    const avatar = document.createElement('span');
    avatar.className = 'message-avatar';
    avatar.textContent = type === 'human' ? 'YOU' : '✦ AI';

    const paragraph = document.createElement('p');
    paragraph.textContent = message;

    item.append(avatar, paragraph);
    chat.appendChild(item);
    chat.scrollTop = chat.scrollHeight;
  }

  function getReply(prompt) {
    const replies = [
      `Perfect. I interpreted "${prompt}" in a completely correct way. Probably.`,
      'Done! I made some bold decisions that you definitely asked for.',
      'I think this is excellent. You may disagree, but the result is technically complete.',
      'Your idea has been processed. Meaning may vary.',
      'Beautiful. I optimized the fun out of it. You are welcome.'
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  function setStatus(message) {
    $('#status-message').textContent = message;
  }

  // Medidor: cuanto de la composicion sigue siendo tuyo
  function setCare({ care = 0, drift = 0, active = false } = {}) {
    const percent = Math.round(care * 100);

    $('#care-fill').style.width = `${percent}%`;
    $('#care-value').textContent = `${percent}% STILL YOURS`;

    if (active && drift > 0.05 && !tidying) {
      tidying = true;
      setStatus('THE MACHINE IS TIDYING WHAT YOU LEFT');
    } else if (drift <= 0.05 && tidying) {
      tidying = false;
      setStatus('YOUR HAND IS ON IT');
    }
  }

  // Muestra u oculta quien decidio cada objeto
  function setAuthors(on) {
    authorsShown = on;
    $('#show-authors').classList.toggle('active', on);
    $('#author-legend').hidden = !on;

    const counts = onAuthorship(on);
    if (on && counts) {
      $('#author-hand').textContent = counts.HAND;
      $('#author-shared').textContent = counts.SHARED;
      $('#author-machine').textContent = counts.MACHINE;
    }
  }

  function updateEffectSettings() {
    const settings = {
      effect: selectedEffect,
      color: $('#effect-color').value,
      intensity: Number($('#effect-intensity').value) / 100,
      size: Number($('#effect-size').value) / 10,
      speed: Number($('#effect-speed').value) / 10
    };

    $('#intensity-value').textContent = `${Math.round(settings.intensity * 100)}%`;
    $('#size-value').textContent = settings.size.toFixed(1);
    $('#speed-value').textContent = `${settings.speed.toFixed(1)}x`;

    onEffectSettings(settings);
  }

  function updateHistory(entries = [], status = {}) {
    historyList.innerHTML = '';

    entries.slice(0, 7).forEach(entry => {
      const row = document.createElement('div');
      row.className = 'history-row';

      const label = document.createElement('span');
      label.className = 'history-label';
      label.textContent = entry.label;

      const meta = document.createElement('span');
      meta.className = 'history-meta';
      meta.textContent = `${entry.elements} objects · ${entry.links} links`;

      row.append(label, meta);
      historyList.appendChild(row);
    });

    $('#intervention-count').textContent =
      `${status.interventions ?? 0} HUMAN INTERVENTIONS`;

    $('#composition-count').textContent =
      `${entries[0]?.elements ?? 0} OBJECTS`;

    $('#show-ai').disabled = !status.hasAI;
    $('#show-human').disabled = !status.hasHuman;
  }

  panel.querySelectorAll('[data-mode]').forEach(button => {
    button.addEventListener('click', () => {
      const mode = button.dataset.mode;

      panel.querySelectorAll('[data-mode]').forEach(item => {
        item.classList.toggle('active', item === button);
      });

      $('#tool-hint').textContent = toolHints[mode];
      $('#draw-instructions').classList.toggle('visible', mode === 'DRAW');
      $('#effect-studio').classList.toggle('visible', mode === 'EFFECT');

      setStatus(`${mode} TOOL SELECTED`);
      onToolChange(mode);

      if (mode === 'EFFECT') updateEffectSettings();
    });
  });

  panel.querySelectorAll('[data-effect]').forEach(button => {
    button.addEventListener('click', () => {
      selectedEffect = button.dataset.effect;

      panel.querySelectorAll('[data-effect]').forEach(item => {
        item.classList.toggle('active', item === button);
      });

      updateEffectSettings();
      setStatus(`${selectedEffect} SELECTED`);
    });
  });

  ['#effect-color', '#effect-intensity', '#effect-size', '#effect-speed'].forEach(selector => {
    $(selector).addEventListener('input', updateEffectSettings);
  });

  $('#activate-effect').addEventListener('click', () => {
    panel.querySelectorAll('[data-mode]').forEach(button => {
      button.classList.toggle('active', button.dataset.mode === 'EFFECT');
    });

    $('#effect-studio').classList.add('visible');
    $('#draw-instructions').classList.remove('visible');
    $('#tool-hint').textContent = 'Brush over the objects to apply your effect.';
    onToolChange('EFFECT');
    updateEffectSettings();
    setStatus('EFFECT BRUSH READY');
  });

  panel.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      onQuickAction(action);
      setStatus(`${action.toUpperCase()} EXPERIMENT`);
    });
  });

  $('#clear-drawing').addEventListener('click', () => {
    onClearDrawing();
    setStatus('DRAWING CLEARED');
  });

  $('#prompt-form').addEventListener('submit', event => {
    event.preventDefault();

    const prompt = promptInput.value.trim();
    if (!prompt || generating) return;

    generating = true;
    generateButton.disabled = true;
    generateButton.textContent = '✦ THINKING...';

    if (replyTimer) clearTimeout(replyTimer);

    addMessage(prompt, 'human');
    if (authorsShown) setAuthors(false);
    onGenerate(prompt);
    promptInput.value = '';

    replyTimer = setTimeout(() => {
      addMessage(getReply(prompt), 'ai');
      generateButton.disabled = false;
      generateButton.textContent = '✦ GENERATE';
      generating = false;
      setStatus('GENERATION COMPLETE. ARE YOU CONVINCED?');
      replyTimer = null;
    }, 650);
  });

  // Salir del lab: la X, VOLVER y LISTO
  $('.xp-close').addEventListener('click', () => onClose());
  $('#back-to-work').addEventListener('click', () => onClose());
  $('#done-lab').addEventListener('click', () => onDone());

  $('#show-authors').addEventListener('click', () => {
    setAuthors(!authorsShown);
    setStatus(authorsShown ? 'WHO DECIDED WHAT?' : 'AUTHORSHIP HIDDEN');
  });

  $('#show-ai').addEventListener('click', () => {
    onCompare('AI');
    addMessage('Here is my original result. I still think it is excellent.', 'ai');
    setStatus('SHOWING AI RESULT');
  });

  $('#show-human').addEventListener('click', () => {
    onCompare('HUMAN');
    addMessage('Your version. Interesting. You changed quite a lot.', 'ai');
    setStatus('SHOWING YOUR VERSION');
  });

  $('#reset-lab').addEventListener('click', () => {
    if (replyTimer) clearTimeout(replyTimer);

    generating = false;
    tidying = false;
    generateButton.disabled = false;
    generateButton.textContent = '✦ GENERATE';

    if (authorsShown) setAuthors(false);
    onReset();
    onClearDrawing();

    chat.innerHTML = '';
    addMessage('A fresh canvas! Let us make the same mistakes differently.', 'ai');
    setStatus('NEW BEGINNING');
  });

  panel.updateHistory = updateHistory;
  panel.setStatus = setStatus;
  panel.setCare = setCare;
  panel.say = message => addMessage(message, 'ai');

  return panel;
}
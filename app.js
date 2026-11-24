(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const app = $('chat-app');
  const conversation = $('conversation');
  const messages = $('messages');
  const input = $('message-input');
  const composer = $('composer');
  const originalMessages = messages.innerHTML;
  const viewport = window.visualViewport;
  const state = {
    baseline: viewport?.height || innerHeight,
    width: innerWidth,
    inset: 0,
    keyboardSession: false,
    follow: true,
    composing: false,
    focusSnapshot: null,
    suppressUntil: 0,
    pendingReset: false,
    timers: new Set(),
  };
  let viewportFrame = 0;
  let rotationTimer = 0;
  const nearEnd = () => conversation.scrollHeight - conversation.clientHeight - conversation.scrollTop <= 32;
  const suppressScroll = () => { state.suppressUntil = performance.now() + 80; };
  const syncComposer = () => app.style.setProperty('--composer-height', `${composer.offsetHeight}px`);

  function syncViewportPosition() {
    if (viewport && Math.abs(viewport.scale - 1) > 0.05) return;
    const top = `${Math.max(0, viewport?.offsetTop || 0)}px`;
    if (app.style.getPropertyValue('--viewport-top') !== top) {
      // Native viewport panning can arrive in a scroll event after its resize.
      // Compensate in this event, not in the next requestAnimationFrame.
      app.style.setProperty('--viewport-top', top);
    }
  }

  function updateControls() {
    $('jump-latest').hidden = nearEnd();
    $('send-button').disabled = !input.value.trim();
    $('dismiss-keyboard').hidden = state.inset === 0;
    app.dataset.keyboard = state.inset > 0 ? 'open' : 'closed';
    app.dataset.behavior = state.follow ? 'push' : 'overlay';
  }

  function applyLayout(height) {
    const previousTop = conversation.scrollTop;
    // Keep the whole page at its pre-keyboard height. Only the conversation's
    // lower edge and composer move. Never move the navigation with the messages.
    state.inset = Math.max(0, height);
    app.dataset.keyboard = state.inset > 0 ? 'open' : 'closed';
    app.style.setProperty('--app-height', `${state.baseline}px`);
    app.style.setProperty('--keyboard-inset', `${state.inset}px`);
    syncViewportPosition();
    syncComposer();
    suppressScroll();
    conversation.scrollTop = state.follow
      ? conversation.scrollHeight - conversation.clientHeight
      : previousTop;
    updateControls();
  }

  function capturePosition() {
    if (state.keyboardSession) return;
    state.focusSnapshot = { top: conversation.scrollTop, atEnd: nearEnd() };
    state.follow = state.focusSnapshot.atEnd;
    // The idle viewport is measured before focus. Keep that same baseline for
    // the entire open/close animation, including the first small resize frames.
    state.keyboardSession = true;
    syncComposer();
  }

  function syncViewport() {
    viewportFrame = 0;
    if (viewport && Math.abs(viewport.scale - 1) > 0.05) return;
    // An orientation change invalidates the full-height baseline. Wait for the
    // OS keyboard to dismiss before capturing the new orientation's dimensions.
    if (Math.abs(innerWidth - state.width) > 50) {
      state.width = innerWidth;
      input.blur();
      state.focusSnapshot = null;
      state.inset = 0;
      state.keyboardSession = false;
      state.baseline = viewport?.height || innerHeight;
      clearTimeout(rotationTimer);
      rotationTimer = setTimeout(() => {
        state.baseline = viewport?.height || innerHeight;
        applyLayout(0);
      }, 350);
    }
    const visibleHeight = viewport?.height || innerHeight;
    let inset = Math.max(0, state.baseline - visibleHeight);
    // Only idle resizes can change the full-height baseline. Treating small
    // focus-time deltas as toolbar movement corrupted it during keyboard entry.
    if (!state.keyboardSession) {
      state.baseline = visibleHeight;
      inset = 0;
    }
    if (inset < 2) {
      inset = 0;
      // Some keyboards close while the textarea remains focused (Android back).
      // Unlock only after a real keyboard has returned to the original height,
      // or after a focus session without a keyboard has ended.
      if (state.inset > 0 || document.activeElement !== input) {
        state.keyboardSession = false;
        state.focusSnapshot = null;
        state.baseline = visibleHeight;
      }
    }
    if (inset > 0 && state.inset === 0 && state.focusSnapshot) {
      suppressScroll();
      conversation.scrollTop = state.focusSnapshot.top;
    }
    applyLayout(inset);
    if (!inset && state.pendingReset) finishReset();
  }

  function queueViewportSync() {
    syncViewportPosition();
    if (!viewportFrame) viewportFrame = requestAnimationFrame(syncViewport);
  }

  function onViewportResize() {
    cancelAnimationFrame(viewportFrame);
    viewportFrame = 0;
    // A viewport resize is already a native layout notification. Deferring its
    // correction introduces one frame with the old keyboard/viewport geometry.
    syncViewport();
  }

  function jumpLatest() {
    state.follow = true;
    suppressScroll();
    conversation.scrollTop = conversation.scrollHeight;
    updateControls();
  }

  function resizeInput() {
    const top = conversation.scrollTop;
    input.style.height = '26px';
    input.style.height = `${Math.min(130, input.scrollHeight)}px`;
    syncComposer();
    suppressScroll();
    conversation.scrollTop = state.follow ? conversation.scrollHeight : top;
    updateControls();
  }

  function appendMessage(role, text) {
    const article = document.createElement('article');
    article.className = `message ${role}`;
    const body = document.createElement('p');
    body.textContent = text;
    article.append(body);
    messages.append(article);
    if (state.follow) jumpLatest();
    else updateControls();
    if (role === 'assistant') $('announcer').textContent = text;
  }

  function sendMessage() {
    const text = input.value.trim();
    if (!text || state.composing) return;
    state.follow = true;
    appendMessage('user', text);
    input.value = '';
    resizeInput();
    const timer = setTimeout(() => {
      state.timers.delete(timer);
      appendMessage('assistant', '这里是一个固定恢复');
    }, 350);
    state.timers.add(timer);
  }

  function dismissKeyboard() {
    input.blur();
    state.focusSnapshot = null;
    queueViewportSync();
  }

  function finishReset() {
    state.pendingReset = false;
    messages.innerHTML = originalMessages;
    input.value = '';
    state.follow = true;
    resizeInput();
    jumpLatest();
  }

  input.addEventListener('pointerdown', event => {
    capturePosition();
    if (event.pointerType === 'touch' && document.activeElement !== input) {
      // Keep focus in the original trusted gesture so the OS keyboard opens,
      // while avoiding the browser's default scroll-into-view on the first tap.
      event.preventDefault();
      input.focus({ preventScroll: true });
    }
  });
  input.addEventListener('focus', () => {
    if (!state.focusSnapshot) capturePosition();
    queueViewportSync();
  });
  input.addEventListener('blur', () => {
    state.focusSnapshot = null;
    setTimeout(queueViewportSync, 100);
  });
  input.addEventListener('input', resizeInput);
  input.addEventListener('compositionstart', () => { state.composing = true; });
  input.addEventListener('compositionend', () => { state.composing = false; resizeInput(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !state.composing && event.keyCode !== 229) {
      event.preventDefault();
      sendMessage();
    }
    if (event.key === 'Escape') dismissKeyboard();
  });
  composer.addEventListener('submit', event => { event.preventDefault(); sendMessage(); });
  $('send-button').addEventListener('pointerdown', event => {
    if (document.activeElement === input) event.preventDefault();
  });
  $('jump-latest').addEventListener('pointerdown', event => event.preventDefault());
  $('jump-latest').addEventListener('click', jumpLatest);
  $('dismiss-keyboard').addEventListener('click', dismissKeyboard);
  $('back').addEventListener('click', () => {
    if (state.inset || document.activeElement === input) dismissKeyboard();
    else {
      suppressScroll();
      state.follow = false;
      conversation.scrollTop = 0;
      updateControls();
    }
  });
  $('reset').addEventListener('click', () => {
    for (const timer of state.timers) clearTimeout(timer);
    state.timers.clear();
    state.pendingReset = true;
    dismissKeyboard();
    if (state.inset === 0) finishReset();
  });
  conversation.addEventListener('scroll', () => {
    if (performance.now() < state.suppressUntil) return;
    state.follow = nearEnd();
    state.focusSnapshot = null;
    updateControls();
  }, { passive: true });
  for (const event of ['wheel', 'touchmove']) {
    conversation.addEventListener(event, () => { state.suppressUntil = 0; }, { passive: true });
  }
  window.addEventListener('resize', queueViewportSync);
  viewport?.addEventListener('resize', onViewportResize);
  viewport?.addEventListener('scroll', syncViewportPosition);
  new ResizeObserver(() => {
    const height = composer.offsetHeight;
    if (app.style.getPropertyValue('--composer-height') !== `${height}px`) {
      const top = conversation.scrollTop;
      syncComposer();
      suppressScroll();
      conversation.scrollTop = state.follow ? conversation.scrollHeight : top;
      updateControls();
    }
  }).observe(composer);
  syncViewport();
  resizeInput();
  requestAnimationFrame(jumpLatest);
})();

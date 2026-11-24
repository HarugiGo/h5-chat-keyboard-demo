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
    baseline: app.getBoundingClientRect().height,
    width: innerWidth,
    inset: 0,
    keyboardHeight: 0,
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

  function updateControls() {
    $('jump-latest').hidden = nearEnd();
    $('send-button').disabled = !input.value.trim();
    $('dismiss-keyboard').hidden = state.keyboardHeight === 0;
    app.dataset.keyboard = state.keyboardHeight > 0 ? 'open' : 'closed';
    app.dataset.behavior = state.follow ? 'push' : 'overlay';
  }

  function applyLayout(height, keyboardHeight = 0) {
    const previousTop = conversation.scrollTop;
    // Keep the chat region at its pre-keyboard height. Only its lower edge and
    // composer move. The independent fixed header has no JS layout updates.
    state.inset = Math.max(0, height);
    state.keyboardHeight = Math.max(0, keyboardHeight);
    if (state.keyboardSession) {
      app.style.setProperty('--app-height', `${state.baseline}px`);
    } else {
      // Let CSS own the idle page height. A transient first visualViewport
      // reading must not pin the composer above the actual bottom of the page.
      app.style.removeProperty('--app-height');
      state.baseline = app.getBoundingClientRect().height;
    }
    app.style.setProperty('--keyboard-inset', `${state.inset}px`);
    app.style.setProperty('--keyboard-height', `${state.keyboardHeight}px`);
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
    // Freeze the rendered CSS layout only when input starts, before the OSK
    // animation. Do not use an earlier startup visualViewport measurement.
    state.baseline = app.getBoundingClientRect().height;
    state.keyboardSession = true;
    app.style.setProperty('--app-height', `${state.baseline}px`);
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
      state.keyboardHeight = 0;
      state.keyboardSession = false;
      clearTimeout(rotationTimer);
      rotationTimer = setTimeout(() => {
        if (!state.keyboardSession) applyLayout(0);
      }, 350);
    }
    if (!state.keyboardSession) {
      applyLayout(0);
      if (state.pendingReset) finishReset();
      return;
    }
    const visibleHeight = viewport?.height || innerHeight;
    let keyboardHeight = Math.max(0, state.baseline - visibleHeight);
    if (keyboardHeight < 2) {
      keyboardHeight = 0;
      // Some keyboards close while the textarea remains focused (Android back).
      // Unlock only after a real keyboard has returned to the original height,
      // or after a focus session without a keyboard has ended.
      if (state.keyboardHeight > 0 || document.activeElement !== input) {
        state.keyboardSession = false;
        state.focusSnapshot = null;
      }
    }
    if (keyboardHeight > 0 && state.keyboardHeight === 0 && state.focusSnapshot) {
      suppressScroll();
      conversation.scrollTop = state.focusSnapshot.top;
    }
    // Height alone is not a bottom coordinate. If the browser pans the visual
    // viewport on first focus, lifting by baseline-height lifts the input twice.
    // Only inset the chat's lower edge by the overlap that actually remains.
    // Never translate the app/header or force the document scroll position.
    const visibleBottom = visibleHeight + (viewport?.offsetTop || 0);
    const inset = keyboardHeight > 0
      ? Math.max(0, app.getBoundingClientRect().bottom - visibleBottom)
      : 0;
    applyLayout(inset, keyboardHeight);
    if (!keyboardHeight && state.pendingReset) finishReset();
  }

  function queueViewportSync() {
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
    if (state.keyboardHeight || document.activeElement === input) dismissKeyboard();
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
    if (state.keyboardHeight === 0) finishReset();
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
  viewport?.addEventListener('scroll', () => {
    // Native panning may settle only after a touch/scroll. Update the remaining
    // input overlap on that event too; the root and navigation stay untouched.
    if (state.keyboardSession) onViewportResize();
  });
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

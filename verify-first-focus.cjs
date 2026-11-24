// Exercise the viewport event sequence that a single final-size resize misses.
// This emulates geometry notifications, not an actual iOS keyboard/compositor.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const report = { cases: [], errors: [], frames: [] };
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 2, `${label}: ${actual} vs ${expected}`);

function measure() {
  const q = id => document.getElementById(id);
  const viewport = window.visualViewport;
  const c = q('conversation');
  const top = element => element.getBoundingClientRect().top - viewport.offsetTop;
  return {
    height: viewport.height,
    offsetTop: viewport.offsetTop,
    navTop: top(q('chat-nav')),
    anchorTop: top(q('history-anchor')),
    appHeight: q('chat-app').getBoundingClientRect().height,
    composerBottom: q('composer').getBoundingClientRect().bottom - viewport.offsetTop,
    lastBottom: q('messages').lastElementChild.getBoundingClientRect().bottom - viewport.offsetTop,
    scrollTop: c.scrollTop,
    distance: c.scrollHeight - c.clientHeight - c.scrollTop,
    keyboard: q('chat-app').dataset.keyboard,
    inset: parseFloat(q('chat-app').style.getPropertyValue('--keyboard-inset')),
  };
}

async function frame(page, height, offsetTop, event = 'resize') {
  return page.evaluate(({ height, offsetTop, event, measureSource }) => {
    visualViewport.height = height;
    visualViewport.offsetTop = offsetTop;
    visualViewport.dispatchEvent(new Event(event));
    // Check before requestAnimationFrame: a correction one frame late fails.
    return (0, eval)(`(${measureSource})`)();
  }, { height, offsetTop, event, measureSource: measure.toString() });
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const scene of ['end', 'history']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      page.on('pageerror', e => report.errors.push(e.message));
      await page.addInitScript(() => {
        const viewport = new EventTarget();
        Object.assign(viewport, { height: 844, width: 390, offsetTop: 0, offsetLeft: 0, scale: 1 });
        Object.defineProperty(window, 'visualViewport', { value: viewport });
        const focus = HTMLElement.prototype.focus;
        window.focusCalls = [];
        HTMLElement.prototype.focus = function (options) {
          if (this.id === 'message-input') window.focusCalls.push(options);
          return focus.call(this, options);
        };
      });
      if (process.env.TEST_APP_JS) {
        await page.route('**/app.js*', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(process.env.TEST_APP_JS, 'utf8') }));
      }
      await page.goto(process.env.DEMO_URL || 'http://127.0.0.1:3026/');
      await page.waitForTimeout(120);
      if (scene === 'history') {
        await page.evaluate(() => { const c = document.getElementById('conversation'); c.dispatchEvent(new WheelEvent('wheel')); c.scrollTop = 180; });
        await page.waitForTimeout(100);
      }
      const initial = await page.evaluate(measure);
      for (let cycle = 0; cycle < 3; cycle++) {
        await page.locator('#message-input').tap();
        await page.waitForTimeout(30);
        const baseline = await page.evaluate(measure);
        // Small opening deltas must not be accepted as new idle heights.
        for (const [height, offset] of [[836, 0], [824, 8], [798, 16], [768, 32], [724, 54], [650, 72], [540, 90]]) {
          const row = await frame(page, height, offset);
          report.frames.push({ scene, cycle, phase: 'open', ...row });
          near(row.appHeight, 844, 'locked full height');
          near(row.inset, 844 - height, 'keyboard height from original baseline');
          near(row.navTop, 0, 'navigation has no uncorrected event frame');
          near(row.composerBottom, height, 'input stays above keyboard');
          if (scene === 'history') {
            near(row.scrollTop, baseline.scrollTop, 'history scrollTop');
            near(row.anchorTop, baseline.anchorTop, 'history visual position');
          } else {
            near(row.distance, 0, 'last message pinned');
            near(baseline.lastBottom - row.lastBottom, 844 - height, 'message upward distance');
          }
          await page.waitForTimeout(20);
        }
        // Safari may pan after resize, without another resize event.
        for (const offset of [120, 60, 0, 90]) {
          const row = await frame(page, 540, offset, 'scroll');
          near(row.navTop, 0, 'scroll-only compensation before next frame');
          near(row.composerBottom, 540, 'input screen position during native pan');
          if (scene === 'history') near(row.anchorTop, baseline.anchorTop, 'history during native pan');
        }
        // Candidate bar expands/contracts within the same keyboard session.
        for (const height of [490, 520, 540]) {
          const row = await frame(page, height, 90);
          near(row.appHeight, 844, 'candidate bar keeps baseline');
          near(row.composerBottom, height, 'candidate bar input position');
        }
        if (cycle !== 1) await page.locator('#message-input').evaluate(el => el.blur());
        // cycle 1 models Android back: the OSK closes while focus remains.
        for (const [height, offset] of [[620, 72], [740, 24], [820, 4], [840, 0], [844, 0]]) {
          const row = await frame(page, height, offset);
          report.frames.push({ scene, cycle, phase: 'close', ...row });
          near(row.appHeight, 844, 'close animation keeps full height');
          near(row.navTop, 0, 'closing nav position');
          near(row.composerBottom, height, 'closing input position');
          if (scene === 'history') near(row.anchorTop, initial.anchorTop, 'closing history position');
          await page.waitForTimeout(20);
        }
        const closed = await page.evaluate(measure);
        assert.equal(closed.keyboard, 'closed');
        near(closed.scrollTop, initial.scrollTop, 'repeated open/close has no drift');
      }
      assert.ok(await page.evaluate(() => focusCalls.some(call => call?.preventScroll === true)), 'initial touch focuses with preventScroll');
      report.cases.push(`${scene}: first focus + 2 reopens, 7 opening frames, offset-only events, candidate bar, 5 closing frames; no baseline/scroll drift.`);
      await context.close();
    }

    // Regression: viewport events before focus must update the idle baseline.
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(process.env.DEMO_URL || 'http://127.0.0.1:3026/');
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForTimeout(100);
    await page.locator('#message-input').focus();
    await page.setViewportSize({ width: 390, height: 500 });
    await page.waitForTimeout(100);
    const keyboardFocus = await page.evaluate(measure);
    near(keyboardFocus.appHeight, 780, 'idle resize before keyboard focus');
    near(keyboardFocus.inset, 280, 'non-pointer focus baseline');
    report.cases.push('Idle viewport resize and keyboard/programmatic focus preserve the new baseline.');
    assert.deepEqual(report.errors, []);
    report.passed = true;
  } catch (error) {
    report.passed = false;
    report.failure = error.stack;
    throw error;
  } finally {
    fs.mkdirSync(path.join(__dirname, '.archive'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, '.archive', process.env.TEST_APP_JS ? '首次聚焦旧版验证.json' : '首次聚焦验证.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, frames: `${report.frames.length} recorded` }, null, 2));
    await browser.close();
  }
})();

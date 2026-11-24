const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.DEMO_URL || 'http://127.0.0.1:3026/';
const report = { testedAt: new Date().toISOString(), cases: [], errors: [], limitations: ['视口缩小由自动化模拟，系统键盘和目标 App 的辅助栏需真机验证。'] };
const wait = page => page.waitForTimeout(140);
const close = (a,b,n) => assert.ok(Math.abs(a-b)<2, `${n}: ${a} versus ${b}`);
function measure() {
  const c = document.getElementById('conversation');
  const rect = id => document.getElementById(id).getBoundingClientRect().toJSON();
  return { nav:rect('chat-nav'), composer:rect('composer'), anchor:rect('history-anchor'), app:rect('chat-app'), top:c.scrollTop, distance:c.scrollHeight-c.clientHeight-c.scrollTop, last:document.querySelector('.message:last-child').getBoundingClientRect().toJSON(), mode:document.getElementById('chat-app').dataset.behavior, keyboard:document.getElementById('chat-app').dataset.keyboard, overflow:document.documentElement.scrollWidth > innerWidth, scroll:scrollY };
}
async function history(page) {
  await page.evaluate(() => { const c = document.getElementById('conversation'); c.dispatchEvent(new WheelEvent('wheel')); c.scrollTop = 180; });
  await wait(page);
}
(async () => {
  const browser = await chromium.launch();
  fs.mkdirSync(path.join(__dirname,'验证截图'),{recursive:true});
  try {
    for(const width of [320,375,390,430,1440]) {
      const context=await browser.newContext({ viewport:{width,height:844}, isMobile:width<500, hasTouch:width<500 });
      const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
      await page.goto(url);await wait(page);
      assert.equal(await page.locator('textarea').count(),1);
      assert.equal(await page.locator('#sim-keyboard,.control-panel,.phone-shell').count(),0);
      let before=await page.evaluate(measure);
      assert.equal(before.overflow,false);assert.ok(before.distance<2);
      close(before.app.width,Math.min(width,760),'自适应宽度');
      await page.locator('#message-input').click();await wait(page);
      assert.equal((await page.evaluate(measure)).keyboard,'closed','自动化/电脑没有系统键盘时不画假键盘');
      await page.setViewportSize({width,height:540});await wait(page);
      let after=await page.evaluate(measure);
      assert.equal(after.keyboard,'open');assert.equal(after.mode,'push');
      close(after.nav.top,before.nav.top,'末尾导航固定');
      close(after.composer.bottom,540,'输入框在键盘上方');
      close(before.last.bottom-after.last.bottom,304,'末尾消息上推');
      assert.ok(after.distance<2);
      await page.locator('#dismiss-keyboard').click();await page.setViewportSize({width,height:844});await wait(page);
      after=await page.evaluate(measure);close(before.top,after.top,'末尾收起恢复');
      await history(page);before=await page.evaluate(measure);
      await page.locator('#message-input').click();await page.setViewportSize({width,height:540});await wait(page);
      after=await page.evaluate(measure);assert.equal(after.mode,'overlay');
      close(after.nav.top,before.nav.top,'历史导航固定');close(after.anchor.top,before.anchor.top,'历史消息屏幕位置不变');
      close(after.top,before.top,'历史 scrollTop 保留');close(after.composer.bottom,540,'历史输入框跟随键盘');
      await page.locator('#message-input').fill('第一行\n第二行\n第三行\n第四行\n第五行\n第六行');await wait(page);
      after=await page.evaluate(measure);close(after.anchor.top,before.anchor.top,'多行输入不带动历史');
      assert.equal(await page.locator('#message-input').evaluate(el=>el.clientHeight<=130),true);
      await page.locator('#message-input').fill('');await page.locator('#dismiss-keyboard').click();
      await page.setViewportSize({width,height:844});await wait(page);
      after=await page.evaluate(measure);close(after.anchor.top,before.anchor.top,'历史收起恢复');
      assert.equal(after.scroll,0);
      await page.locator('#jump-latest').click();await page.locator('#message-input').fill('你好，小康！');
      await page.locator('#send-button').click();await page.waitForTimeout(450);
      assert.equal(await page.locator('.message.user p').last().innerText(),'你好，小康！');
      assert.equal(await page.locator('.message.assistant p').last().innerText(),'这里是一个固定恢复');
      assert.ok((await page.evaluate(measure)).distance<2);
      assert.equal(await page.locator('#send-button').isDisabled(),true);
      if(width===390||width===1440){await page.locator('#reset').click();await wait(page);await page.screenshot({path:path.join(__dirname,`验证截图/v2-${width}.png`)});}
      report.cases.push(`${width}px：纯对话、系统输入、末尾上推、历史遮盖、导航固定、多行输入、收起恢复、固定回复通过。`);
      await context.close();
    }
    const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>report.errors.push(e.message));
    await page.goto(url);await wait(page);
    const input=page.locator('#message-input');
    const count=await page.locator('.message').count();
    await input.fill('   ');await input.press('Enter');assert.equal(await page.locator('.message').count(),count);
    await input.fill('候选词');await input.dispatchEvent('compositionstart');await input.press('Enter');
    assert.equal(await page.locator('.message').count(),count);await input.dispatchEvent('compositionend');
    await input.fill('<img src=x onerror="window.demoXSS=1">');await input.press('Enter');await page.waitForTimeout(440);
    assert.equal(await page.locator('.message.user p').last().innerText(),'<img src=x onerror="window.demoXSS=1">');
    assert.equal(await page.evaluate(()=>window.demoXSS),undefined);
    report.cases.push('空消息拦截、中文输入法确认不误发、用户 HTML 字符串不执行。');
    await input.fill('等待回复时滚动历史');await input.press('Enter');await wait(page);await history(page);
    const top=(await page.evaluate(measure)).top;await page.waitForTimeout(450);close((await page.evaluate(measure)).top,top,'回复不抢滚动位置');
    report.cases.push('回复到达时已滚到历史，阅读位置保持。');
    await page.locator('#reset').click();await wait(page);assert.equal(await page.locator('.message').count(),count);
    await page.goto(pathToFileURL(path.join(__dirname,'H5对话键盘Demo.html')).href);await wait(page);
    await page.locator('#message-input').fill('离线输入');await page.locator('#message-input').press('Enter');await page.waitForTimeout(440);
    assert.equal(await page.locator('.message.assistant p').last().innerText(),'这里是一个固定恢复');
    report.cases.push('重置初始对话和离线独立 HTML 可用。');
    assert.deepEqual(report.errors,[]);report.passed=true;
  }catch(error){report.passed=false;report.failure=error.stack;throw error;}
  finally{fs.writeFileSync(path.join(__dirname,'验证记录.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
})();

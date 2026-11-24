# AI小康 · H5 对话键盘 Demo

纯 HTML / CSS / JavaScript，手机与 PC 均可打开，无运行依赖。界面沿用已有小康 v5 对话原型的灰底、浅绿色用户气泡、白色回复区、胶囊输入框与绿色发送按钮。

只保留顶部导航、静态对话、输入和发送。**手机点击输入框调用系统真实键盘，PC 使用实体键盘；页面不绘制模拟键盘。**

## 体验

1. 默认已在最后一条消息；点击输入框，键盘弹出时最新消息上推，导航不动。
2. 收起键盘，向上滚动阅读历史，再点击输入框；阅读位置保持，键盘遮盖下面的内容。
3. 发送任意消息，将实际输入追加到会话，固定回复为“这里是一个固定恢复”。
4. 输入框最多五行，超过后内部滚动。Enter 发送，Shift+Enter 换行。中文输入法确认候选词不会触发发送。
5. “重置”恢复初始对话；消息仅存在页面内存。

电脑不会自动出现手机系统键盘。手机上的输入法、候选词、声音、振动和系统辅助栏由操作系统及浏览器决定。

## 本地运行

```sh
node server.mjs
```

浏览器打开 `http://127.0.0.1:3026/`。手机同一网络访问终端显示的局域网地址。也可双击 `H5对话键盘Demo.html` 离线运行。

修改后执行 `node build.mjs`，重新生成单文件版本。GitHub Pages 直接发布根目录 `index.html`。

## 键盘约束

H5 设置 `inputmode="text"`、`enterkeyhint="send"`、`autocomplete="off"`、`autocorrect="off"`、`autocapitalize="off"` 与 `spellcheck="false"`。这些是输入提示/配置，实际支持由浏览器决定，不是隐藏 iOS“上下箭头＋完成”辅助栏的开关。

- H5 可控制输入框高度、最多五行内部滚动、聚焦/失焦、输入内容与发送行为。
- H5 可响应 `visualViewport` 变化，保持顶部导航并按滚动位置选择消息上推或遮盖。
- H5 没有跨浏览器标准接口可以强制隐藏 iOS 表单辅助栏、设置系统键盘高度或控制输入法外观。
- 在支持相应能力的 App 容器内，可由 Native 隐藏辅助栏；普通 Safari 页面没有该原生权限。需要目标容器确认能力和实际占位。

官方资料：

- [MDN：enterkeyhint](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/enterkeyhint)
- [MDN：Visual Viewport API](https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API)
- [Capacitor Keyboard 官方文档](https://github.com/ionic-team/capacitor-keyboard)：`setAccessoryBarVisible({ isVisible: false })`，文档限定 iPhone 支持。这是已集成该插件的容器能力，不是网页可直接获得的权限，也不代表目标 App 已有此方法。

如果 WebView 不暴露键盘造成的视口变化，仍需要 Native 提供有效遮挡高度，不能由本示例保证该容器适配。已缩小 WebView 扣除的高度不能重复扣除。

## 验证

`verify.cjs` 覆盖手机宽度 320/375/390/430px 和 PC 1440px、视口缩小、两种消息布局、收起恢复、多行输入、发送回复、输入法组合输入和离线运行。运行需提供本机 Playwright 模块：

```sh
PLAYWRIGHT_MODULE=/path/to/playwright node verify.cjs
```

自动化模拟视口变化，不会真正唤起 iOS/Android 系统键盘。实际输入法、Safari 和 App WebView 辅助栏需真机验收。

## 首次聚焦闪动修复

旧逻辑把聚焦期间小于 90px 的视口变化当作普通窗口变化，反复改写键盘收起高度；同时，视口滚动补偿延迟至下一帧。在分帧模拟中，844px 的初始高度被改成 650px；72px 的视口上移则有一帧未补偿。两者都是可复现的布局缺陷，不能将模拟结果等同于已复现全部真机闪烁。

修复后，键盘打开及收起过程使用同一份聚焦前高度；`visualViewport` 的 resize / scroll 事件及时同步布局和偏移。首次触摸使用 `focus({ preventScroll: true })`，避免触发默认聚焦滚动；底部安全区随键盘遮挡逐步扣除，不在第一帧整块移除。静态资源带版本参数，避免浏览器混用旧脚本。

`verify-first-focus.cjs` 专项覆盖两种消息状态、首次聚焦与重复唤起、逐帧变化、单独滚动偏移、候选栏高度变化和保持焦点收起键盘。每个事件中即检查几何位置，不仅检查动画结束后的状态。运行方式与 `verify.cjs` 相同；仍须使用真实设备确认 Safari / WebView 合成器行为。

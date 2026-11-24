# AI小康 · H5 对话键盘 Demo

纯 HTML / CSS / JavaScript，手机与 PC 均可打开，无运行依赖。界面沿用已有小康 v5 对话原型的灰底、浅绿色用户气泡、白色回复区、胶囊输入框与绿色发送按钮。

只保留顶部导航、静态对话、输入和发送。**手机点击输入框调用系统真实键盘，PC 使用实体键盘；页面不绘制模拟键盘。**

## 体验

1. 默认已在最后一条消息；点击输入框，键盘弹出时最新消息上推，导航独立固定在 H5 布局顶部。
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
- 顶部导航位于 `body` 根层，使用 CSS `position: fixed; top: 0`；键盘高度只影响聊天区域。H5 响应 `visualViewport.resize`，按滚动位置选择消息上推或遮盖。
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

## 独立顶导与键盘布局

导航移到聊天容器外，独立固定在页面顶部；导航及其祖先不设置 `transform`。聊天容器也不再使用位移变换居中，改用左右定位与自动外边距。删除 `offsetTop` 反向位移计算、`--viewport-top` 和视口 scroll 补偿监听；不会根据浏览器的上移量把页面或导航移回来。

键盘打开及收起过程使用同一份聚焦前高度，保留此前对中间帧误改高度基准的修复。`visualViewport.resize` 只更新聊天区域的高度参数、输入框和消息区下边界。首次触摸使用 `focus({ preventScroll: true })` 请求避免聚焦滚动；底部安全区随键盘遮挡逐步扣除。静态资源带版本参数，避免浏览器混用旧脚本。

首屏及键盘收起后的页面高度由 CSS `100dvh` 管理，不再用首次 `visualViewport.height` 写入固定像素高度；只在输入开始时读取当前已渲染的页面高度并锁定，键盘收起后解除。专项模拟覆盖初始视觉视口读数偏小的情况，防止它将未聚焦的输入框抬高。该模拟不代表已确定所有 iOS 首屏底部异常的原因，仍须在出现问题的设备上验收。

这个版本保证的是页面布局不主动移动顶导。浏览器若仍在聚焦时移动整个可见视口，页面不会反向补偿，导航和输入框的实际屏幕位置仍可能受影响。不能将 CSS 固定定位或自动化结果理解为所有 Safari / WebView 真机首帧绝对无闪动。

`verify-first-focus.cjs` 专项覆盖独立顶导、两种消息状态、首次聚焦与重复唤起、逐帧高度变化、候选栏高度变化和保持焦点收起键盘。模拟视口滚动时检查页面没有立即或延后的位移补偿；分别记录布局坐标和模拟可见坐标，不再把位移补偿作为通过条件。运行方式与 `verify.cjs` 相同，真实键盘效果仍须真机验收。

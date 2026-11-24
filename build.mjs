import { readFile, writeFile } from 'node:fs/promises';
const read = name => readFile(new URL(name, import.meta.url), 'utf8');
const [html, css, js] = await Promise.all(['index.html', 'style.css', 'app.js'].map(read));
const standalone = html
  .replace(/<link rel="stylesheet" href="style\.css(?:\?[^"<>]*)?">/, () => `<style>\n${css}\n</style>`)
  .replace(/<script src="app\.js(?:\?[^"<>]*)?"><\/script>/, () => `<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`);
await writeFile(new URL('H5对话键盘Demo.html', import.meta.url), standalone);
console.log('已生成 H5对话键盘Demo.html，可双击打开或独立分享。');

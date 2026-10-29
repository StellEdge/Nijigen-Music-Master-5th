# 参与开发

请从本仓库根目录运行命令，保持网页可直接打开，不引入不必要的运行依赖。Node.js 22+、Python 3 可用于本地检查和静态服务。

```sh
npm run check
npm test
```

默认测试使用合成数据，可在不包含 MusicData 的独立仓库运行。若设置 `KARUTA_MUSIC_DATA` 为含 CoreSet 和 Dark 的目录，额外校验原始私人歌包；未设置时明确跳过该项，不在 CI 上传真实歌曲。

## 浏览器验证

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:browser
```

可用 `PLAYWRIGHT_PATH` 指定已有 Playwright 模块，`CHROME_PATH` 指定浏览器可执行文件。冒烟测试检查 ZIP 导入、播放、暂停、移动端布局及页面错误，不涵盖全部游戏行为。

`native-range-bridge.cjs`、`native-reopen.cjs`、`background-playback.cjs` 等为额外手动回归脚本，使用模拟 Android 桥接，不能替代真机。`tests/legacy/browser.cjs` 依赖已移除的文件夹导入和私人曲库，仅保留为历史参考，不应作为当前回归入口。

修改播放逻辑时说明普通 / 游戏 / 热场模式的影响；修改 Android 时记录安装、锁屏、通知控制、音频焦点与文件授权实测情况。不要提交 APK、密钥、构建目录或真实歌曲曲库。

提交 PR 时描述问题、改动和实际验证结果。不要将尚未执行的验证写成通过。提交者应确认有权以项目许可证贡献代码；素材需单独注明来源与授权。

## 文档截图

安装 Playwright 后运行 `npm run docs:preview`（同时需要 Python 3），使用 `docs/media/demo-cover.png` 和生成的静音 WAV 创建演示 ZIP，再通过真实导入流程生成桌面和手机截图。临时曲包保存在被忽略的 `output/`。不要用 CoreSet / Dark 等外部曲库封面生成公开截图。历史截图仅留本机，不上传。

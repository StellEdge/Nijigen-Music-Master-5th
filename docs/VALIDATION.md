# 仓库整理验证

日期：2026-10-30。环境：Windows、Node.js 24.13.0、Python 3.14.2、Google Chrome / Playwright。

## 已执行

- `npm run check`：app.js、core.js、zip.js 语法检查通过。
- `npm test`：21 项通过，1 项需要显式提供私人曲库的集成检查按设计跳过。
- 设置 `KARUTA_MUSIC_DATA` 后运行 `npm test`：22 项全部通过；曲库只用于本机验证，不提交。
- `npm run test:browser`：合成 ZIP 导入、音频实际播放、暂停、390×844 无横向溢出和无未处理页面错误通过。使用 `PLAYWRIGHT_PATH` 指定本机已有模块、`CHROME_PATH` 指定 Chrome。
- 当前 README、贡献指南、素材说明、使用指南、发布说明和 Android README 的本地 Markdown 链接均存在。
- `git check-ignore`：Android 签名、Android 构建输出、APK 和 Windows 下载的 nupkg 均已排除。
- 待纳入 Git 的文件列表未发现 `.jks`、`.apk`、`.idsig`、`.key`、`.pem` 或 `.nupkg`。

- 2026-10-30：权利人确认 `assets/` 下全部资产的版权归其所有，并选择 CC BY-NC-SA 4.0 授权，已同步素材说明、目录内许可声明、README、NOTICE 与发布说明。

- README 桌面及手机截图改用维护者提供的展示图片、虚构曲目信息及合成静音音频；含外部曲包封面的历史截图已排除上传。

## 尚未执行或完成

- GitHub Actions 尚未在远端运行；Linux 和 Node 22 的结果待 CI 验证。
- 本次未构建 APK，未安装 Android 真机或模拟器；Windows 封装亦未构建验证。
- 历史浏览器完整回归脚本不再作为当前功能通过的依据；本轮浏览器测试为冒烟范围。
- 截图中若包含 `assets/` 之外的第三方曲包内容，仍需核对其分发范围，见 ASSETS.md。
- 未配置远端仓库、提交或推送。

历史开发与 APK 验证见 [历史记录](VALIDATION-HISTORY.md)。

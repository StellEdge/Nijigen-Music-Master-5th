# Windows EXE

输出：`../dist/NijigenMusicMaster-Windows-x64-preview7.exe`。Windows 10/11 x64，使用系统 .NET Framework 4.8 和 Microsoft Edge WebView2 Evergreen Runtime。单文件便携程序，约 8.3 MiB，不内置完整浏览器；需要 WebView2 已安装。如未安装会显示微软官方下载地址，不自动安装组件。

首次运行将内置页面、音乐、图标、微软 SDK DLL 和许可证解压到 `%LOCALAPPDATA%/StellEdge/NijigenMusicMaster/app/<build-id>`。浏览器偏好、曲包路径保存在同一应用目录下，移动 EXE 不影响记忆。关闭窗口退出；最小化继续播放，原生时钟在最小化期间驱动游戏片段和间隔。

原生文件选择器和拖放支持 ZIP；记住文件路径，重启自动恢复，移除曲包时取消对应记忆。路径失效时提示重新选择。ZIP 使用原生定位、每次最多 1 MiB 的桥接读取，按需解压；不复制整个 ZIP。JSON 记录通过原生保存对话框导出。保留网页音频、WebP/动态 WebP、频谱、游戏和热场功能。程序未使用 Windows 代码签名证书。

## 构建

安装 Python + Pillow，微软 .NET Framework 编译器。使用微软官方 NuGet `Microsoft.Web.WebView2` 1.0.4314.35，将 net462 的 Core/WinForms DLL、win-x64 的 WebView2Loader.dll 和 LICENSE.txt 放入 `vendor` 对应目录。执行 `python KarutaPlayer/windows/build.py`。脚本嵌入最新页面资源、五周年图标和热场音频，并输出 SHA-256。

参考：[微软 WebView2 分发说明](https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution)。SDK 许可证随 EXE 内置。

## 验证

本机真实运行生成的 EXE，WebView2 页面加载成功、三个菜单存在、原生桥接可调用；导入两首歌的 ZIP 测试包并播放，曲目数量 2、播放状态正确、进度推进，无导入诊断错误。构建逐字节核对内置网页资源，ZIP CRC 通过。测试入口 `--smoke-test`，可选环境变量 KARUTA_SMOKE_ZIP 指定测试包；完成后自动移除测试包记忆并退出。未在没有 WebView2 的干净 Windows 系统、ARM64 或其他 Windows 版本验证。

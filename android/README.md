# Android 封装

当前源码：`1.0.0-preview.7`（versionCode 7），包名 `com.stelledge.nijigenmusicmaster`，Android 8.0+，targetSdk 34。轻量 Java / WebView 实现，未使用 Gradle 或 Media3。

## Windows 构建

需要 Python 3.9+、JDK 11+、Android SDK platform 34 与 build-tools 34.0.0。当前脚本使用 Windows `.exe` 工具，不支持直接在 Linux / macOS 构建。

```powershell
$env:ANDROID_SDK_ROOT = 'C:\Android\Sdk'
$env:JAVA_HOME = 'C:\Java\jdk-17'
python android/build.py
```

命令在仓库根目录执行。依次进行资源打包、Java 编译、D8、zipalign、签名和校验。输出 `dist/NijigenMusicMaster-1.0.0-preview7.apk`、同名 `.sha256` 与 `apk-verification.txt`。这些产物不提交到 Git，请上传到 GitHub Releases。

首次构建自动生成 `android/signing/preview.jks`，使用公开的 Android 调试口令；只用于本地试用，不适合正式分发身份。该文件必须留在本机。相同签名与包名可覆盖安装；更换签名可能需要卸载旧版本。正式发布前应改为独立管理的发布签名，勿上传私钥。

## 行为与验证范围

- 内置网页、图标、卡背和热场音频；不包含歌包。
- 使用系统文件选择器与持久 URI 授权记忆 ZIP，不复制整个曲包；原生分块读取按需提取资源。
- 前台媒体服务与 MediaSession 支持后台播放、通知控制、进度定位与耳机拔出暂停。
- 使用 FOREGROUND_SERVICE、FOREGROUND_SERVICE_MEDIA_PLAYBACK、WAKE_LOCK；不申请联网、麦克风或整盘存储权限。
- 横竖屏切换保留页面，返回键优先关闭菜单。

历史已记录编译、签名、对齐和桌面模拟桥接检查；尚未在 Android 真机或模拟器验证锁屏、厂商省电策略、来电焦点及文档提供器兼容性。详见 [历史验证记录](../docs/VALIDATION-HISTORY.md) 和 [Android 变更历史](../docs/ANDROID-HISTORY.md)。本次仓库整理不重建 APK。

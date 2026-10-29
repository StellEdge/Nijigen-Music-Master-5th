> 历史归档：以下保留原始开发记录，包含旧版本路径、截图位置和已变更行为。当前用法以根目录 README、USAGE 和 Android README 为准。

# Android 试用包

产物：`../dist/NijigenMusicMaster-1.0.0-preview3.apk`，Android 8.0+，使用系统 Android System WebView。请保持系统 WebView / Chrome 更新，以支持 ZIP 解压、容器尺寸单位和现代音频 API。

将 APK 传到手机并打开，按系统提示允许该来源安装应用。应用名称为「歌牌播放器」，包名 `com.stelledge.nijigenmusicmaster`。

## 已接入

- 完整离线内置 HTML / CSS / JS、五周年 LOGO、卡背和默认热场音乐。歌曲包不内置，通过系统文件选择器导入 ZIP；不申请网络、麦克风或整盘存储权限。
- WebView 本地资源使用保留的 HTTPS 域名和请求拦截，避免直接开放 file:// 访问，参考 [Android 本地内容加载文档](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)。音频支持字节范围响应。
- 系统文件选择器支持 ZIP 多选和热场音频选择；导出记录使用系统「另存为」对话框写 JSON。
- 横竖屏切换保留同一 WebView，不刷新已加载的曲包。系统状态栏 / 导航栏由原生窗口留边，网页继续使用响应式布局；前台保持屏幕常亮。
- 切到后台、锁屏或打开系统文件对话框时暂停播放 / 游戏倒计时，不提供后台播放服务。返回后手动继续。
- 返回键优先关闭已展开菜单，再退出页面。

## 构建

无需 Android Studio 或 Gradle 下载，直接使用已安装的 Android SDK 34 build-tools、android-34 平台和 JDK 11+：

```powershell
$env:ANDROID_SDK_ROOT = '你的 Android SDK 路径'
$env:JAVA_HOME = '你的 JDK 路径'
python build.py
```

在当前环境可从项目根目录运行 `python KarutaPlayer/android/build.py`，脚本会使用 Unity Android 模块附带的 SDK / OpenJDK。签名保存在本目录 `signing/preview.jks`，已被 `.gitignore` 排除；重建时复用，便于后续覆盖安装。此为本地试用签名，不用于应用商店正式发布。

构建过程：aapt2 编译资源和打包、javac 编译、D8 转换 DEX、zipalign 对齐、apksigner 签名并验证。输出 APK、SHA-256 与 `apk-verification.txt`。保留 signing 目录；更换签名后通常无法直接覆盖旧安装。

## 本轮验证范围

已通过 Java 编译、DEX 生成、APK CRC / 资源完整性、zipalign、v2 / v3 签名、包名 / 最低系统 / 启动 Activity 检查。已用桌面 Chromium 验证构建目录在同一虚拟 HTTPS 路径下的页面资源加载、ZIP 导入与播放、原生暂停事件、旋转保留数据以及 JSON 导出桥接分支。

本机没有可用真机连接或 Android 模拟器，本轮未实际安装启动 APK，也未验证厂商文件管理器行为、真机音频和系统 WebView 兼容性。这正是该试用包要收集的反馈。

preview.2 使用 assets/app-icon-5th-v2.png 作为桌面图标，默认热场音乐为 `GRAND CARD TOUR   -The Fifth Anniversary Anthem-.mp3`（TOUR 后三个空格）。包名与 preview.1 不同，会并存安装，不迁移旧包的浏览器偏好与会话。继续复用本地试用签名。

## preview.3：记住 ZIP

升级可直接覆盖 preview.2（同包名、同签名）。旧版本没有保存导入文件授权，因此升级后请重新导入一次 ZIP。之后保存 Android 文档 URI 与持久读取授权，每次启动自动恢复，不复制整包文件，也不自动播放。

ZIP 通过本地 `/imports/<opaque-id>` 按字节范围读取，继续按需解压单首音频；不把数百 MB ZIP 转为 Base64 或一次复制进 JavaScript。移除已导入曲包会取消对应记忆；同一个 ZIP 内含多个歌包时，保留其余包的引用，已移除的子包不会自动复活。无效 ZIP 不保留恢复记录。

如原文件被移动、删除，或系统收回授权，会跳过该文件并在导入诊断中提示重新选择；不阻止其他曲包恢复。此行为遵循 [Android 文档文件与持久 URI 授权](https://developer.android.com/training/data-storage/shared/documents-files)。若文件提供方不支持长期授权，首次导入时会提示，下次可能仍需重新选择。

页面顶部增加从状态栏同色 `#e9f3fa` 向透明过渡的渐变，不改变状态栏操作安全区。

验证：Java / DEX / APK 签名和对齐通过；模拟原生桥接的浏览器集成验证自动恢复、按范围读取、播放、缺失授权隔离、防重复加载、删除后不再恢复和重新选择导入。仍未在真机上验证厂商文档提供器的持久权限。


## preview.4：后台播放

新增 mediaPlayback 前台服务、媒体通知和 MediaSession。应用切到后台或锁屏时不再主动暂停 WebView；服务保留当前音频页面，并通过原生时钟驱动片段结束、牌间等待与淡入淡出。播放期间使用部分唤醒锁，暂停或停止后释放；暂停通知最多保留十分钟。支持通知栏播放、暂停、上一首、下一首、停止及媒体会话进度定位；拔下耳机暂停。音频焦点继续由 WebView 的音频实现管理，避免另一个原生焦点请求与它竞争。

图片仍由 WebView 渲染，静态/动态 WebP 支持不变；后台暂停频谱和环境动画。记忆 ZIP 的方式与 preview.3 相同，可直接覆盖安装。不会在进程被系统杀死或用户强行停止后自行重播。

参考 [Android 后台媒体播放](https://developer.android.com/media/media3/session/background-playback) 的前台服务和媒体会话要求；此轻量封装保留现有 Web Audio 播放引擎，没有引入 Media3 依赖。新增权限为 FOREGROUND_SERVICE、FOREGROUND_SERVICE_MEDIA_PLAYBACK、WAKE_LOCK。

验证：22 项 Node 测试通过；桌面 Chromium 模拟 Android 桥接验证恢复时不自动播放、后台进度、通知控制、热场暂停继续、游戏片段及间隔自动结束。Java、DEX、APK 签名/对齐/CRC 通过。没有可用 Android 真机或模拟器，尚未实测锁屏、厂商省电策略、耳机/来电音频焦点与服务存活；浏览器桥接测试不能代替真机验证。


## preview.5：ZIP 原生分块读取

APK 优先使用 AndroidFiles.readPackRange 直接读取已授权的 SAF 文档，单次最多 1 MiB；避免通过 WebView 的合成 HTTPS URL 发起 fetch 时的 Failed to fetch。支持可定位的文件描述符；管道文件提供器回退顺序跳读。仍按需读取 ZIP 中央目录和单首资源，不复制整个曲包、不增加网络或存储权限。失败信息区分读取授权失效和文件变更/不完整。保留旧版范围请求回退，并显式限定 InputStream.read(byte[]) 的读取长度。

超扁横屏只扩展左侧歌牌容器，借用原来的上下留白，保留真实系统安全区和右侧控制台位置。模拟桥接验证 ZIP 无 fetch、分块读取及音频播放、后台控制和自动游戏结束；900×300、1000×360、800×250 竖版歌牌高度均达到视口 80%。22 项 Node 测试通过，原生代码编译及 APK 签名、对齐、CRC 通过。SAF 文件提供器仍需手机验证。

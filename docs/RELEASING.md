# 上传与发布

## 仓库边界

以 **KarutaPlayer 目录本身** 作为 GitHub 仓库根目录，不上传父目录的 MusicData、Unity、NAudio、output 或旧 portable.zip。

`.gitignore` 排除 dist、Android 构建输出、签名、私钥和本机环境配置。已有产物继续保存在本机，不需要删除。网页入口保持根目录，便于静态托管。

## 首次上传前

1. `assets/` 全部资产由 StellEdge 以 CC BY-NC-SA 4.0 授权，分发时保留素材署名及许可声明；核对 [素材说明](../ASSETS.md)，检查截图是否包含该目录之外的第三方曲包封面等内容。
2. 运行 `npm run check` 和 `npm test`；按需运行浏览器冒烟测试。
3. 执行 `git status --short` 和 `git status --short --ignored`，确认密钥、APK、真实歌曲均未进入待提交列表。
4. 创建 GitHub 空仓库后，在本目录配置对应 remote，再提交和推送。仓库地址、可见性由维护者选择。

## 版本发布

对齐 package.json（网页版本）、AndroidManifest.xml（Android versionName / versionCode）及 build.py 输出文件名。当前网页 package.json 为 1.0.0，Android 为 1.0.0-preview.7，两者分别标识。

先完成代码与真机验证，再构建 APK。使用脚本生成的 SHA-256 校验文件；GitHub Release 中附 APK、校验文件、验证范围和已知限制。不要上传 signing 目录、.jks、.idsig 或 android/build。

构建脚本目前生成的是本地试用签名 APK，正式分发需先改用妥善保管的发布密钥。历史 APK 与当前源码是否一致，应重新构建核验，不能仅凭文件名判断。

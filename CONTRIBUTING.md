# 参与开发 / Contributing

感谢愿意帮忙！这份文档只写"怎么在本机跑起来、怎么提改动"这些必须知道的事。

## 环境

| 需要 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | 20+（CI 用 22） | 前端构建 |
| JDK | 21 | Gradle / Android 构建 |
| Android SDK | platform 36 + build-tools 36 | 只构建 Web 端时不需要 |
| Gradle | 8.14（或用仓库里的 `gradlew`） | |

## 常用命令

```bash
npm ci                       # 安装依赖（严格按 package-lock）
npm run dev                  # 浏览器里跑（Web 端）
npm run typecheck            # tsc --noEmit
npm run lint:eslint          # eslint src
npm run lint                 # 上面两个一起
```

构建 APK（本机脚本会自动找工具链，也可用 `-ToolsRoot` 指定）：

```powershell
pwsh tools/build-apk.ps1                 # 完整版（要求 public/songs 里有歌曲资产）
pwsh tools/build-apk.ps1 -NoSongs        # 无歌曲版（约 4 MB）
```

## 提改动前请确认

1. `npm run typecheck` 与 `npm run lint:eslint` 都通过（CI 会跑，PR 不通过会红）
2. 改到界面时附一张截图，说明改了哪一屏
3. **绝对不要提交**：`public/songs/*.mp3`（曲目版权）、`android/keystore.properties`（签名密码）、任何令牌、`.env` 文件
4. 行尾按 `.gitattributes` 走：源码 LF、Windows 脚本 CRLF。从 Windows 检出改动时不要手工"统一换行符"，否则会产生整文件 diff

## 代码结构速览

```
src/pages/HomePage/      五页外壳：滑动切换、Dock、MiniPlayer
src/components/player/   各页面与播放器组件
src/lib/                 数据与能力层：db / parser / music / lyrics / playlists /
                         player-context / media-scanner / terminal-config / theme
android/                 Capacitor 原生工程（MediaScannerPlugin / SystemBarsPlugin）
tools/                   本机构建脚本与歌曲索引生成器
```

- 曲库与播放序列存 IndexedDB，偏好存 localStorage
- 设备音频走原生 MediaStore；播放时读成 Blob 再播（ColorOS 的 Range 不可靠）
- 歌词：扫描只读同目录 `.lrc`/`.txt`，联网获取必须由用户在歌词页主动触发

## 提交信息

用 `<type>(<scope>): <说明>` 的形式，例如：

```
fix(settings): 设置页可滚动，自定义配色面板常驻
feat(build): 新增 -NoSongs 构建开关
docs: 同步功能说明
```

常见 type：`feat` / `fix` / `docs` / `chore` / `refactor` / `perf` / `ci`。

## 发布

- 推送到 `main`：跑检查 + 构建 debug APK（Actions 构件可下载）
- 推 `v*` 标签：由 `Release` 工作流构建签名 APK，并创建/更新对应 Release

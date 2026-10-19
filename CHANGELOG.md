# 更新日志 / Changelog

> 从 v1.4.2 起，**每个版本的详细说明以 [GitHub Releases](https://github.com/TATHPE/endfield-music-terminal/releases) 为准**（`Release` 工作流会自动生成），本文件只记录里程碑。

## [未发布]

### 计划中
- 单元测试（歌词解析、检索语法、工具函数）
- `PlayerProvider` 拆分（音频引擎 / 曲库 / 序列 / 扫描）
- 界面文案集中管理（`src/lib/strings.ts`）
- 联网歌词来源抽成 provider，带超时与降级提示

## [1.4.5] — 2026-10-19

### 新增
- **主题跟随系统**：外观三档 `深色 / 浅色 / 跟随系统`；系统切换深浅色时界面与状态栏/导航栏实时跟随（无需重启），冷启动按系统外观解析。
- **睡眠定时器**：设置页可选 15 / 30 / 45 / 60 / 90 分钟或「播完当前曲停止」，显示剩余时间、可随时取消；到点先淡出再暂停（保留进度）；后台/锁屏按绝对时间戳计时。
- **歌词逐曲偏移**：每首歌独立保存偏移（±0.1s / ±0.5s），全局值作为新歌默认；新增「对齐」一键校准、「归零」、歌词页随时导入本地 LRC；同名 `.lrc` 仍优先于在线歌词。
- **锁屏 / 熄屏持续播放**：新增原生 `PlaybackGuard` 插件——播放时持有 PARTIAL_WAKE_LOCK；`MainActivity` 播放中不暂停 WebView；设置页新增「电池优化设置」入口（来电/其他应用/拔耳机由系统与 WebView 处理）。
- **右划两次退出**：返回手势统一到 `handleBack()`——首页第一次右滑提示「再滑一次退出」，2 秒内第二次退出；有页面历史时先返回。

### 修复
- **播放无声 / 无法播放**：`PlaybackGuard` 不再自行申请 `AUDIOFOCUS_GAIN`（WebView / Chromium 已持有音频焦点，同进程重复申请会让它收到 LOSS 并暂停）。
- **息屏 / 切后台崩溃断播**：`MainActivity.onPause()` 曾跳过 `super.onPause()`，Android 抛 `SuperNotCalledException` 直接杀进程；已恢复 `super.onPause()`（Capacitor 的 `KeepRunning` 默认 true，WebView 不会被暂停）。
- **「跟随系统」不生效 / 提示不刷新**：改为原生在启动与 `onConfigurationChanged` 时把 `uiMode` 写入 `window.__endfieldSystemDark` 并派发 `endfield:system-scheme-changed`，JS 重新解析主题；设置页监听同一事件重渲染。

### 改进
- 「跟随系统」下状态栏颜色随 `uiMode` 变化即时刷新（`onConfigurationChanged`）。
- 新增 `theme` / `sleep-timer` / `lyric-offset` 单元测试，测试总数 181 项全部通过。

## [1.4.2] — 2026-10-09

### 新增
- 系统配置页新增终端行为开关：扫描线（4–24s 转速）、按键蜂鸣、日志级别、IDLE 待机
- 歌词页工具栏：±0.5s / ±1s 时间轴微调、SCROLL 居中滚动、LOG 全量日志
- 全域检索支持高级语法：`artist:` / `album:` / `tag:` / `duration:<秒数>`
- 介质库分类页签（ALL / 战场记录 / 通讯日志 / BGM / 环境音）与行内标签编辑

### 修复
- ColorOS 17 锁屏拖动进度条回弹（原生回调透传 + 秒级 `seekTime`）
- 频谱空白、终端行为开关不实时生效、MiniPlayer 遮挡设置项、歌词滚动滞后
- 设置页布局：改为可上下滚动，自定义配色面板常驻，底部控件不再被悬浮播放条遮挡
- 终端 LOG 级别此前是空操作，现已真正过滤日志输出
- 两处 lint 错误（渲染期写 ref、组件文件多余导出）

### 改进
- 界面文案统一为终端页名（介质库 / 播放序列 / 全域检索 / 音频输出 / 系统配置）
- 构建：新增 `tools/build-apk.ps1`（含 `-NoSongs` 无歌曲版），版本号改为 `package.json` 单一来源
- CI：流水线增加类型检查与 ESLint；新增按标签自动发版工作流
- 清理：删除 44 个未引用 UI 组件、示例页、10 个未使用依赖
- 维护：预置曲库清单不再入库（改由 `tools/gen-song-manifest.mjs` 生成），播放器加载时校验音轨是否真实存在
- 安全：关闭应用数据备份与设备间迁移，收窄 FileProvider 暴露路径

### 安全与隐私
- 新增 `SECURITY.md` 与「权限与隐私」说明
- GitHub 令牌改用仅限本仓库的细粒度 PAT

## [1.4.1] — 2026-10-07

- 歌词获取流程重构：扫描只读同目录 `.lrc`/`.txt`，联网匹配由用户在歌词页主动触发
- 封面匹配改为后台异步执行

## [1.4.0] — 2026-10-06

- 设备音乐自动化：「扫描设备」导入、歌词/封面匹配、Blob 播放修复（因播放体验问题随后被 v1.4.1 取代）

## [1.3.9] — 2026-10-05

- 应用图标重绘为黑胶唱片式，全密度位图嵌入

## [1.3.8] — 2026-10-04

- 全版本强制 edge-to-edge，根治浅色状态栏黑条

[未发布]: https://github.com/TATHPE/endfield-music-terminal/compare/v1.4.2...main
[1.4.2]: https://github.com/TATHPE/endfield-music-terminal/releases/tag/v1.4.2
[1.4.1]: https://github.com/TATHPE/endfield-music-terminal/releases/tag/v1.4.1
[1.4.0]: https://github.com/TATHPE/endfield-music-terminal/releases/tag/v1.4.0
[1.3.9]: https://github.com/TATHPE/endfield-music-terminal/releases/tag/v1.0.0
[1.3.8]: https://github.com/TATHPE/endfield-music-terminal/releases/tag/v1.0.0

# 终末地音乐终端 · Endfield Music Terminal

一款以《明日方舟：终末地》为视觉灵感、可打包为 Android APK 的**本地音乐播放器**：本地曲库 / 播放序列 / 歌词 / 频谱 / 在线地址与网络电台。

![配色](https://img.shields.io/badge/配色-黄%20F2C200%20%2F%20黑%200A0A0C%20%2F%20暖白%20F1F0EA-F2C200?style=for-the-badge&labelColor=0A0A0C)

[![Release](https://img.shields.io/github/v/release/TATHPE/endfield-music-terminal?style=for-the-badge&label=RELEASE&labelColor=0A0A0C&color=F2C200)](https://github.com/TATHPE/endfield-music-terminal/releases)
[![License](https://img.shields.io/github/license/TATHPE/endfield-music-terminal?style=for-the-badge&label=LICENSE&labelColor=0A0A0C&color=F2C200)](LICENSE)

## 下载

| 版本 | 说明 | 下载 |
| --- | --- | --- |
| v1.4.3 (release · 正式版) | 正式签名版，**应用图标重设计（信息终端 × 音乐 × 终末地）+ R8 压缩瘦身（无歌曲版 4.09 MB → 1.84 MB）+ 在线流媒体（自填合法 http/https 音频流）+ 界面文案集中管理 + 单元测试与 CI + 长列表窗口化 + 存储管理 + 歌词 provider 化与失败提示区分**；不含预置歌曲（通过扫描设备从手机导入） | [EndfieldMusicTerminal-v1.4.3-release-lite.apk](https://github.com/TATHPE/endfield-music-terminal/releases/download/v1.4.3/EndfieldMusicTerminal-v1.4.3-release-lite.apk) · [完整版 97.68 MB](https://github.com/TATHPE/endfield-music-terminal/releases/download/v1.4.3/EndfieldMusicTerminal-v1.4.3-release-full.apk) |
| v1.4.2 (release · 正式版) | 正式签名版，**锁屏拖动进度条回弹修复 + 频谱 / 终端行为开关 / 布局 / 歌词同步 / 多 ROM 适配修复**（详见 [更新日志](docs/更新日志.md) 的 v1.4.2 更新内容）；不含预置歌曲（通过扫描设备从手机导入） | [EndfieldMusicTerminal-v1.4.2.apk](https://github.com/TATHPE/endfield-music-terminal/releases/download/v1.4.2/EndfieldMusicTerminal-v1.4.2.apk) |
| v1.4.1 (release · 正式版) | 正式签名版，**歌词获取流程重构**：扫描歌曲仅读取本地同名 .lrc/.txt、**不自动联网匹配**；无歌词歌曲在歌词页自主选择「联网获取歌词」或「导入歌词文件」；封面在线匹配改为后台线程池异步执行；修复曲库副标题 ORIGIN NODE — 本地音频存储 在安卓上的错误断行；不含预置歌曲（通过扫描设备从手机导入） | [EndfieldMusicTerminal-v1.4.1.apk](https://github.com/TATHPE/endfield-music-terminal/releases/download/v1.4.1/EndfieldMusicTerminal-v1.4.1.apk) |

> 历史版本（v1.4.0 及更早）的更新内容与下载见 [更新日志](docs/更新日志.md)。

## 功能

- **本地曲库**：手动导入（支持多选、可拖入多个文件）与「扫描设备」批量入库，解析 ID3 / FLAC / MP4 / OGG / WAV / APE 标签与内嵌封面，按 ALL / 战场记录 / 通讯日志 / BGM / 环境音 标签分类。
- **播放序列**：收藏清单与自定义序列（新建 / 重命名 / 展开 / 删除、整单播放），播放队列可移出曲目并存为快照。
- **同步歌词**：内置 LRC 解析（时间戳 / offset），逐行高亮居中；±0.5s / ±1s 时间轴微调与 SCROLL / LOG 两种阅读模式，可联网获取（网易云 → QQ 音乐双源）或导入本地 `.lrc`。
- **频谱与音频输出**：ARTWORK（整幅封面）/ LYRICS 双面板 + SPECTRUM 实时频谱，`TRACK / 格式 / 采样率 / 码率` 读数、26 段刻度进度条、音量滑块与三种播放模式（序列循环 / 无序序列 / 单介质循环）。
- **在线地址与网络电台**：粘贴你自己提供的合法 `http/https` 音频流即可播放并自动回写真实时长；「网络电台」页签可在 radio-browser.info 公开电台目录里搜索、点选收听——**只做「播放流」，不内置、不托管、不代理任何音乐资源**。
- **全域检索**：关键词过滤本地介质库（歌曲 / 艺术家 / 专辑 / 序列），支持 `artist:` / `album:` / `tag:` / `duration:<秒数>` 高级检索语法。
- **后台播放与锁屏控制**：Media Session + Android 前台媒体服务，通知栏 / 锁屏显示歌曲、封面与进度，支持播放 / 暂停 / 上一曲 / 下一曲 / ±10s / 拖动进度。
- **主题与终端行为**：黑色 / 白色外壳，T-01 标准终端 / T-02 棱镜频谱 / T-04 基地夜间终端 / T-03 自定义配色；扫描线、按键蜂鸣、LOG 级别、IDLE 待机；终末地风格启动动画与应用图标。
- **系统适配与无障碍**：Android 8–16 全版本强制 edge-to-edge、系统栏明暗双通道同步、ColorOS / HyperOS / OriginOS / 鸿蒙 / One UI 适配，进度条支持键盘无障碍操作（←/→ ±5s，Shift ±15s，Home/End）。
- **离线与持久化**：除用户主动发起的歌词 / 封面联网匹配外全程离线；曲库与序列存 IndexedDB，主题与偏好存 localStorage，重启自动恢复。

> 逐条完整功能说明见 [功能说明](docs/功能说明.md)。

## 使用

1. **安装**：下载上表中的 APK 侧载安装。若系统提示「未知来源」（如 ColorOS 17），在系统设置中允许安装即可。
2. **导入曲目**：进入「介质库」`[01]` →「+ 导入曲目」，在文件选择器中**长按可多选**，也可以把**多个音频文件直接拖入**应用窗口；导入时自动解析标签、时长与内嵌封面 / 歌词（mp3 / flac / m4a / wav / ogg / aac / opus / ape / wma / aiff）。
3. **扫描设备**：介质库页首「扫描设备」直接读取手机媒体库批量入库（自动去重、跳过已入库曲目；Android 13+ 首次请求音频读取权限，被拒可一键跳转系统设置），结果与失败原因回显在页首。
4. **播放序列**：曲目行内点 **♥** 加入收藏、点「加入序列」选择或即时新建序列；「播放序列」`[02]` 页可整单播放；音频输出页 **QUEUE** 展开队列、`SAVE SNAPSHOT` 存快照。
5. **歌词**：音频输出页切到 **LYRICS** 面板——同名 `.lrc` / `.txt` 会自动读取；无歌词时点 **REQUEST REMOTE LYRIC** 联网获取（网易云 → QQ 音乐），或 **IMPORT LOCAL SCRIPT** 导入本地 `.lrc` / `.txt`；`±0.5s / ±1s` 微调时间轴（偏移自动保存）。
6. **在线地址与网络电台**：介质库点「在线地址（流媒体）」→ **在线地址** 页签粘贴合法公开的 `http/https` 音频直链，或切到 **网络电台** 页签搜索公开电台目录（如 `jazz` / `news` / `中国`）后点选收听（详见 [在线流媒体说明](docs/在线流媒体.md)）。
7. **系统配置与切页**：`[04]` 页切换黑色 / 白色外壳与主题，调整扫描线、蜂鸣、LOG 级别与 IDLE 待机；五个页面可在主体区域左右滑动切换。

## 界面

> 截图取自 ColorOS 17 真机实拍（竖屏，v1.4.2 浅色主题），与实际 APK 界面一致：介质库 / 播放序列 / 全域检索 / 音频输出（封面 · 歌词）/ 系统配置。

| | |
| --- | --- |
| **① 介质库** —— AUDIO TERMINAL // MEDIA NODE：TRACKS 14 · TOTAL 49:51 · READY 状态；分类页签 **ALL · 战场记录 · 通讯日志 · BGM · 环境音**；右上角「扫描设备」与「+ 导入曲目」；播放中曲目高亮（序号改频谱条），行内可编辑标签 / 收藏 / 加入序列 / 移除；底部毛玻璃 Dock 常驻。<br><br><img src="docs/screenshots/phone/v1.4.2/01-library.jpg" width="220" alt="介质库" /> | **② 播放序列** —— SEQUENCE NODE 播放队列清单：「新建播放序列名称…」输入框 + 「+」；「收藏」清单（0 TRACKS · 0:00）与播放键；未创建序列时显示空状态引导，页脚提示「介质库中点击 ♥ 可将介质加入收藏清单」。<br><br><img src="docs/screenshots/phone/v1.4.2/02-playlists.jpg" width="220" alt="播放序列" /> |
| **③ 全域检索** —— SEARCH 页：搜索「歌曲 / 艺术家 / 播放序列」输入框（滑入页面不自动弹键盘）；**高级检索语法**折叠面板；未输入时显示空状态「输入关键词检索本地介质库与播放序列」。<br><br><img src="docs/screenshots/phone/v1.4.2/03-search.jpg" width="220" alt="全域检索" /> | **④ 音频输出 · 封面** —— OUTPUT STREAM / ARTWORK 面板：专辑封面整幅正方形显示，SPECTRUM 频谱，TRACK 1/14 · MP3 · 48.0kHz · 265kbps 四列参数，分段刻度进度条与时间，循环 / 上一曲 / 暂停 / 下一曲 / 音量（VOL 80%）。<br><br><img src="docs/screenshots/phone/v1.4.2/04-output-artwork.jpg" width="220" alt="音频输出·封面" /> |
| **⑤ 音频输出 · 歌词** —— LYRICS 面板：歌词同步工具栏（**−1s / −0.5s / +0.5s / +1s**、SYNC 0.0s、SCROLL 滚动、LOG）；LRC 逐行高亮并标注时间轴（01:19 / 01:28 / 01:34 …），浅色背景下清晰可读。<br><br><img src="docs/screenshots/phone/v1.4.2/05-output-lyrics.jpg" width="220" alt="音频输出·歌词" /> | **⑥ 系统配置** —— SETTINGS 页：**黑色 / 白色**背景切换；主题 **T-01 标准终端 · T-02 棱镜频谱 · T-03 自定义 · T-04 基地夜间终端**；自定义配色（主色 / 辅助色 / 点缀色）+ 预设色板 + 恢复默认；终端行为开关 **扫描线 ON · 蜂鸣 ON · SCAN SPD 9s · LOG ERROR · IDLE 常亮 / 1 分钟 / 5 分钟**。<br><br><img src="docs/screenshots/phone/v1.4.2/06-settings.jpg" width="220" alt="系统配置" /> |

## 声明

- 本项目为**粉丝向学习项目**，与《明日方舟：终末地》及其开发商（鹰角网络）**无关**；代码仓库本身不包含任何游戏素材。
- 本项目**源代码**以 [MIT License](LICENSE) 开源，可自由使用、修改与分发（含商用），须保留版权声明。**MIT 只覆盖源代码**。
- Release 里的歌曲资产包 **EndfieldSongs-v1.0.zip**（[下载](https://github.com/TATHPE/endfield-music-terminal/releases/download/v1.0.0/EndfieldSongs-v1.0.zip)，约 92 MB）**不在授权范围内**：其中的音乐、歌词与封面版权归原权利人（鹰角网络 / 塞壬唱片等）所有，仅供个人学习与本地试听，请勿二次分发或商用。
- 本项目只做**「播放流」**：不提供任何音乐资源，不内置任何平台源，不提供搜索 / 下载 / 解密 / 代理接口，也不改写请求绕过任何平台限制；在线地址来源由使用者自行确保合法并自负后果。
- 本项目由 **AI 辅助开发**，辅助开发所使用的 AI 包括「**豆包 + DeepSeek**」。欢迎把源码交给豆包或 DeepSeek 修改。

## 更多文档

- [更新日志](docs/更新日志.md) —— 逐版本更新内容与历史版本下载
- [功能说明](docs/功能说明.md) —— 完整功能特性逐条说明
- [功能按键说明](docs/功能按键说明.md) —— 界面与按键操作手册
- [开发者文档](docs/开发者文档.md) —— 技术栈 / 目录结构 / 构建 / 测试 / CI 与发布
- [权限与隐私](docs/权限与隐私.md) —— 权限用途与数据说明
- [在线流媒体说明](docs/在线流媒体.md) —— 在线地址与网络电台

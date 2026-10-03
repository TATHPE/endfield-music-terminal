# 终末地音乐终端 · Endfield Music Terminal

一款以《明日方舟：终末地》为视觉灵感、可打包为 Android APK 的**本地音乐播放器**。整体采用黄 / 黑 / 暖白三色，密集使用终末地风格的系统 UI 元素（警戒条纹、角括号面板、切角按钮、六边形徽章、BOOT 日志式启动动画）。

![UI 配色](https://img.shields.io/badge/配色-黄%20%23F2C200%20%2F%20黑%20%230A0A0C%20%2F%20暖白%20%23F1F0EA-0A0A0C)

[![Release](https://img.shields.io/github/v/release/TATHPE/endfield-music-terminal)](https://github.com/TATHPE/endfield-music-terminal/releases)
[![Downloads](https://img.shields.io/github/downloads/TATHPE/endfield-music-terminal/total)](https://github.com/TATHPE/endfield-music-terminal/releases)
[![License](https://img.shields.io/github/license/TATHPE/endfield-music-terminal)](LICENSE)
[![Stars](https://img.shields.io/github/stars/TATHPE/endfield-music-terminal)](https://github.com/TATHPE/endfield-music-terminal)
[![Last Commit](https://img.shields.io/github/last-commit/TATHPE/endfield-music-terminal)](https://github.com/TATHPE/endfield-music-terminal)
[![Build APK](https://github.com/TATHPE/endfield-music-terminal/actions/workflows/build-apk.yml/badge.svg)](https://github.com/TATHPE/endfield-music-terminal/actions)
[![Top Language](https://img.shields.io/github/languages/top/TATHPE/endfield-music-terminal)](https://github.com/TATHPE/endfield-music-terminal)

## 功能特性

- **本地歌曲导入**：从设备文件系统批量导入音频，曲库持久化存储在浏览器 IndexedDB
- **专辑封面解析**：用 `music-metadata` 解析 ID3 / FLAC / MP4 / OGG / WAV / APE 等标签与内嵌封面；无内嵌封面时以 iTunes Search 兜底搜索
- **双 Tab 界面**：曲库列表 + 正在播放（频谱动画、分段刻度进度条、循环 / 随机 / 单曲模式）
- **终末地风格启动动画**：六边形徽章脉冲 + 扫描光带 + 逐行 BOOT 日志 + 24 段进度条，约 2.6 秒，可点击跳过
- **Android / ColorOS 17 适配**：沉浸式状态栏与导航栏、安全区预留（`pt-safe` / `pb-safe`）、深色主题、自绘终末地黄黑应用图标
- **离线可用**：Web 端与 APK 均不依赖云端服务

## 下载

| 版本 | 说明 | 下载 |
| --- | --- | --- |
| v1.0.0 (release) | 正式签名版，适用于日常安装 | [EndfieldMusicTerminal-v1.0.apk](https://github.com/TATHPE/endfield-music-terminal/releases/download/v1.0.0/EndfieldMusicTerminal-v1.0.apk) |
| v1.0.0 (debug) | 调试签名版，仅用于体验 | [EndfieldMusicTerminal-v1.0-debug.apk](https://github.com/TATHPE/endfield-music-terminal/releases/download/v1.0.0/EndfieldMusicTerminal-v1.0-debug.apk) |

> ColorOS 17 侧载时若提示「未知来源」，在设置中允许安装即可。

## 技术栈

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)
![Capacitor](https://img.shields.io/badge/Capacitor-8-119EFF?logo=capacitor)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)
![music-metadata](https://img.shields.io/badge/music--metadata-11-4FC08D)

| 层 | 技术 |
| --- | --- |
| Web 前端 | React 19 + TypeScript + Tailwind CSS v4 |
| 播放引擎 | HTML5 Audio + Web Audio API（频谱动画） |
| 标签解析 | music-metadata（浏览器 WASM 构建） |
| 数据存储 | IndexedDB（曲库） / localStorage（偏好） |
| 移动端封装 | Capacitor 8（Android 平台） |
| 构建 | Vite（Web）+ Gradle 8.14 / AGP 8.13（APK） |

## 目录结构

```
endfield-player/
├── src/                    # Web 源码
│   ├── pages/HomePage/     # 主页面（曲库 + 正在播放）
│   ├── components/player/  # 播放器组件（SplashScreen / BottomNav / NowPlayingView ...）
│   └── lib/                # 数据层（db.ts / parser.ts / player-context.ts）
├── android/                # Capacitor Android 原生工程
├── public/
├── capacitor.config.ts     # Capacitor 配置（appId: com.endfield.audio.terminal）
├── vite.config.ts          # Web 构建配置
└── vite.capacitor.config.ts# APK 专用构建配置（输出 dist/apk）
```

## 本地运行（Web）

```bash
npm install
npm run dev
```

## 构建 Android APK

需要 JDK 17+（推荐 21）、Android SDK（platform 36 / build-tools 36）、Gradle 8.14+。

```bash
# 1. 构建 Web 产物（专用配置，产出 dist/apk）
npx vite build --config vite.capacitor.config.ts

# 2. 同步到 Android 工程
npx cap sync android

# 3. 构建 debug APK（产物在 android/app/build/outputs/apk/debug/）
cd android
gradle assembleDebug
```

### GitHub Actions 自动构建

每次 push 到 `main` 会自动构建 debug APK，产物上传为 Actions Artifact（仓库 Actions 页面可下载最新版）。

如需自动构建**正式签名版**，在仓库 Settings → Secrets and variables → Actions 新增：

| Secret | 值 |
| --- | --- |
| `KEYSTORE_BASE64` | 密钥库文件 base64 编码（`base64 -w0 release.keystore` 或 `certutil -encode` 输出） |
| `KEYSTORE_PASSWORD` | 密钥库密码（storePassword = keyPassword） |
| `KEYSTORE_ALIAS` | 密钥别名（本项目为 `endfield`） |

配置后，每次 push 的 `release` job 会自动用该密钥构建并上传正式签名 APK。

## 应用信息

- 应用名：终末地音乐终端
- 包名 / applicationId：`com.endfield.audio.terminal`
- minSdk 24 / targetSdk 36
- Android 版本：v1.0

## License

本项目以 [MIT License](LICENSE) 开源，可自由使用、修改与分发（含商用），须保留版权声明。

## 免责声明

本项目为粉丝向学习项目，与《明日方舟：终末地》及其开发商无关，不包含任何游戏素材与版权资源。

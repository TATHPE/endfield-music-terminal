# 终末地音乐终端 · Endfield Music Terminal

一款以《明日方舟：终末地》为视觉灵感、可打包为 Android APK 的**本地音乐播放器**。整体采用黄 / 黑 / 暖白三色，密集使用终末地风格的系统 UI 元素（警戒条纹、角括号面板、切角按钮、六边形徽章、BOOT 日志式启动动画）。

![UI 配色](https://img.shields.io/badge/配色-黄%20%23F2C200%20%2F%20黑%20%230A0A0C%20%2F%20暖白%20%23F1F0EA-0A0A0C)

## 功能特性

- **本地歌曲导入**：从设备文件系统批量导入音频，曲库持久化存储在浏览器 IndexedDB
- **专辑封面解析**：用 `music-metadata` 解析 ID3 / FLAC / MP4 / OGG / WAV / APE 等标签与内嵌封面；无内嵌封面时以 iTunes Search 兜底搜索
- **双 Tab 界面**：曲库列表 + 正在播放（频谱动画、分段刻度进度条、循环 / 随机 / 单曲模式）
- **终末地风格启动动画**：六边形徽章脉冲 + 扫描光带 + 逐行 BOOT 日志 + 24 段进度条，约 2.6 秒，可点击跳过
- **Android / ColorOS 17 适配**：沉浸式状态栏与导航栏、安全区预留（`pt-safe` / `pb-safe`）、深色主题、自绘终末地黄黑应用图标
- **离线可用**：Web 端与 APK 均不依赖云端服务

## 技术栈

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

## 应用信息

- 应用名：终末地音乐终端
- 包名 / applicationId：`com.endfield.audio.terminal`
- minSdk 24 / targetSdk 36
- Android 版本：v1.0

## 免责声明

本项目为粉丝向学习项目，与《明日方舟：终末地》及其开发商无关，不包含任何游戏素材与版权资源。

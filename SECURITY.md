# 安全策略 / Security Policy

## 报告问题

如果你发现了安全或隐私问题，请**不要**直接开公开 issue，改用下面任一方式：

1. GitHub 的 [Security Advisories](https://github.com/TATHPE/endfield-music-terminal/security/advisories/new)（推荐，私密且能一起讨论修复）
2. 或先开一个 issue 只说"想私下报告安全问题"，我会给出联系方式

请附上：影响版本、复现步骤、影响范围（例如"任何应用都能读走曲库"）。收到后我会尽快确认并给出修复计划。

## 支持范围

只维护最新的 Release（当前 `v1.4.2` 及后续版本）。

## 本项目关心的风险

| 类型 | 说明 |
| --- | --- |
| 权限滥用 | 应用只应请求 READ_MEDIA_AUDIO / READ_EXTERNAL_STORAGE（≤12）、POST_NOTIFICATIONS、前台服务与网络权限 |
| 数据外泄 | 曲库、播放序列与偏好必须留在本机；除用户主动发起的歌词/封面匹配外不应联网 |
| 凭据泄漏 | 仓库中绝不能出现签名密钥、`keyPassword`、个人访问令牌 |
| 危险导出 | 组件、FileProvider 等导出面应尽量小，且不暴露用户文件 |

## 已知非问题

- 应用读取手机音频库是本项目的核心功能，属预期行为
- 联网歌词/封面匹配使用公开接口（网易云 / QQ 音乐 / iTunes），只在用户主动触发时发起

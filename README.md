<div align="center">

# CPA-Codex-Manager
---
<img src="https://github.com/user-attachments/assets/4106fb61-5359-4d05-b666-9aa3e6e7a0f3" width="200" />

一款专为 OpenAI 账号池设计的高性能管理面板，集成全自动批量注册、CLIProxyAPI 平台账号池实时监控与智能维护系统。
本项目核心基于 [cnlimiter/codex-manager](https://github.com/cnlimiter/codex-manager) 以及 [DestinyCycloid/codex-console](https://github.com/DestinyCycloid/codex-console) 开发。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)

</div>

---

## 核心特性

- **多模式并发注册**：
  - **并行模式**：支持最高 50 线程同时发起 1000 条注册任务，极速扩充账号规模。
  - **流水线模式**：支持设置随机启动间隔，模拟真实用户行为，规避风控。
- **CLIProxyAPI 账号自动巡检**：
  - 支持 **401 认证失效检测** 与 **Quota 额度耗尽检测**。
  - 自动根据配置执行 **物理删除** 异常账号，保持账号池可用性。
- **智能自动补货系统**：
  - **实时号池监控**：当 CPA 在线账号低于阈值时，自动触发补货。
  - **自动任务挂载**：补货任务自动在首页控制台展示进度，无需人工干预。
  - **详细补货日志**：在检测历史中清晰标注触发补货的具体方式、邮箱服务及补货数量。
- **全栈监控面板**：
  - **实时日志流**：基于 WebSocket 的逐行日志推送，随时监控注册细节。
  - **进度可视化**：直接显示成功、失败、剩余数与进度百分比。
- **多邮箱生态支持**：集成 Outlook、TempMail、CloudMail 邮箱服务。
- **紧急防御与异常熔断**：
  - **动态阈值保护**：巡检时发现就绪账号比例低于设定值（如 50%，可配置）时，自动触发紧急防御，随机清理半量账号。
  - **自定义冷却重试**：紧急防御触发后，系统将进入预设的冷却期（如 5 分钟，可配置）后重新开始检测。
  - **异常账号全自动清理**：自动移除检测过程中产生 Network Error 或 API 报错的“僵尸”账号。

## 集成 CLIProxyAPI 管理
- **[CLI Proxy API Management Center](https://github.com/router-for-me/CLIProxyAPI)**


## 技术栈

- **后端**: `Python 3.10+`, `FastAPI`, `SQLAlchemy`
- **前端**: `Vanilla JS`, `WebSocket`
- **数据**: `SQLite` / `PostgreSQL`
- **并发**: `asyncio` + `ThreadPoolExecutor`

## 快速开始

### 1. 环境准备
确保已安装 Python 3.10 或更高版本。

```bash
# 使用 uv（推荐）
uv sync

# 或使用 pip
pip install -r requirements.txt
```

### 2. 配置环境
复制 `.env.example` 为 `.env` 后按需修改:

```bash
cp .env.example .env
```

### 3. 运行项目
```bash
python webui.py
```

访问 `http://localhost:8000` 即可进入管理面板。

进入系统设置页添加 CPA 服务，即可使用。

### 4. 桌面版运行

如果你想以桌面窗口方式运行，而不是手动打开浏览器：

```bash
pip install pywebview
python desktop.py
```

桌面模式会：
- 后台自动启动本地 FastAPI 服务
- 使用 `pywebview` 打开内嵌窗口
- 默认仅监听 `127.0.0.1`
- 默认使用本地 SQLite，无需配置 `.env`

## 桌面版打包

### macOS 桌面版打包

请在 **macOS** 上执行：

```bash
chmod +x scripts/build_macos_dmg.sh
./scripts/build_macos_dmg.sh
```

打包完成后产物位于：

- `dist/CPA-Codex-Manager.app`
- `dist/CPA-Codex-Manager.dmg`


### Windows 桌面版打包

请在 **Windows 系统** 上执行：

```bat
scripts\build_windows.bat
```

打包完成后产物通常位于：

- `dist\CPA-Codex-Manager\CPA-Codex-Manager.exe`



## 页面展示
<img width="1064" height="511" alt="截屏2026-03-25 22 39 46" src="https://github.com/user-attachments/assets/4a019320-6a86-44d6-b465-c53e74f97ac1" />
<img width="1795" height="877" alt="截屏2026-03-25 22 35 12" src="https://github.com/user-attachments/assets/ed34f98e-3b39-44f8-9ac5-19bce792ded4" />
<img width="1791" height="881" alt="截屏2026-03-25 22 39 10" src="https://github.com/user-attachments/assets/f4388533-43a1-4d27-a626-83ecc582dfcd" />
<img width="1801" height="887" alt="截屏2026-03-25 22 34 33" src="https://github.com/user-attachments/assets/81d998df-e109-4836-9482-95d2659948d6" />
<img width="1792" height="877" alt="截屏2026-03-25 22 39 29" src="https://github.com/user-attachments/assets/21c7d6a6-e367-410c-a180-84cfe1ef74c6" />

## 巡检与补货配置建议

1. **巡检频率**：建议设置为 60 分钟一次，配合账户状态（401/Quota）清理。
2. **补货方案**：
   - 建议在 CPA 检测页面开启“自动补货”。
   - 当就绪账号少于指定数量时，触发一次补货。
   - 补货模式推荐使用“并行模式”以提高效率。

## 免责声明

本项目仅供学习、研究和技术交流使用，请遵守 OpenAI 相关服务条款。

因使用本项目产生的任何风险和后果，由使用者自行承担。

## Star History

<p align="center">
  <a href="https://www.star-history.com/#maoleio/CPA-Codex-Manager&Date">
    <img src="https://api.star-history.com/svg?repos=maoleio/CPA-Codex-Manager&type=Date" alt="Star History Chart" />
  </a>
</p>

---
**CPA-Codex-Manager** - 让 CLIProxyAPI 号池管理变得优雅而自动化。

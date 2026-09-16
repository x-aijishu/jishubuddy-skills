# JishuBuddy Skills

这是一组面向 Raspberry Pi 场景的 Agent Skills。每个 Skill 先识别问题和准备条件，
再在用户授权后安装或复用 [JishuBuddy](https://www.npmjs.com/package/jishubuddy)，
通过真实 SSH 或串口证据完成检测。安装与检测交接是核心流程；安装成功不等于设备检测完成。

This repository provides Agent Skills for common Raspberry Pi tasks. Each
skill first identifies the problem and prerequisites, then—with explicit user
permission—installs or reuses
[JishuBuddy](https://www.npmjs.com/package/jishubuddy) to collect real SSH or
serial evidence. Installing the application is only a handoff; it does not
mean the device has been diagnosed successfully.

## 选择 Skill / Choose a skill

| Skill | 使用场景 / Use when |
|---|---|
| [raspberry-pi-first-setup](raspberry-pi-first-setup/SKILL.md) | 树莓派首次配置、系统烧录、无头安装、Wi-Fi、主机名或 SSH 准备。First boot, imaging, headless setup, Wi-Fi, hostname or SSH readiness. |
| [raspberry-pi-ssh-doctor](raspberry-pi-ssh-doctor/SKILL.md) | SSH 连不上、超时、拒绝连接、认证失败或 Host Key 异常。SSH timeout, connection refused, authentication, resolution or host-key failures. |
| [raspberry-pi-health-check](raspberry-pi-health-check/SKILL.md) | 树莓派卡顿、发热、重启、磁盘不足或服务异常。A slow, hot, unstable or low-storage Pi, including CPU, memory, temperature and services. |
| [raspberry-pi-serial-rescue](raspberry-pi-serial-rescue/SKILL.md) | SSH 不可用，需要通过 UART 串口查看启动日志或排查乱码、权限和波特率。SSH is unavailable and UART boot logs, permissions, baud rate or reconnect behavior must be inspected. |

## 可以这样提问 / Example searches

- “树莓派第一次开机，为什么路由器里找不到？”
- “Raspberry Pi headless setup cannot connect to Wi-Fi.”
- “SSH 连接树莓派一直 timeout，是密码问题吗？”
- “Permission denied (publickey) when connecting to my Raspberry Pi.”
- “树莓派没有网络，怎么通过串口查看启动日志？”
- “Raspberry Pi serial console shows garbled output on ttyUSB0.”
- “树莓派很烫而且很卡，怎么检查是否降频？”
- “Check Raspberry Pi CPU, memory, disk, temperature and failed services.”

## 安装行为 / Installation behavior

默认在操作者的电脑上安装 JishuBuddy，通过 SSH 或本机串口访问树莓派，目标设备无需安装。
已有可用且支持本次检测能力的安装时直接复用，不因存在新版本就重复安装或升级。

JishuBuddy is installed on the operator's computer, not on the target Raspberry
Pi. A working installation with the required capability is reused instead of
being upgraded unnecessarily.

每个 Skill 都附带相同的权限式安装脚本，保持独立可用。仅在需要安装或必要升级时运行预检；
将 `<skill-directory>` 替换为包含该 `SKILL.md` 的绝对目录，不依赖终端当前目录：

```bash
bash "<skill-directory>/scripts/install-jishubuddy.sh" check
```

`check` 读取平台、Node.js、npm、当前版本和 npm 目标版本，不执行全局安装；查询 registry
可能更新 npm 本地缓存。Agent 必须展示版本、registry、全局 prefix 和完整安装命令，
解释默认遥测行为及关闭方式，并获得用户明确授权，才能安装：

```bash
bash "<skill-directory>/scripts/install-jishubuddy.sh" install --yes --version "<approved-version>"
```

`<approved-version>` 必须替换为用户刚刚确认的精确版本，不能填 `latest` 或版本范围。
安装阶段不重新查询最新版；若相同版本已可用则直接复用。安装后会确认 PATH 中的版本与
批准版本一致；版本查询失败不会被当作成功。保持预检和安装使用同一台主机、用户和环境。

JishuBuddy 当前支持 Linux x64、Linux ARM64 和 Apple Silicon macOS；npm 安装需要
Node.js 22 或更高版本。这些要求针对运行 JishuBuddy 的电脑，不限制通过 SSH 检测
32 位 Linux 树莓派。SSH 检测还需要本机 OpenSSH、目标端非交互 Bash，以及能在
`BatchMode=yes` 下完成的认证；仅能输入密码登录并不足够。

脚本不会自动启动 JishuBuddy、连接设备、索取凭据或提升权限。用户可以自行运行
`jishubuddy`，或另行授权启动；需要时完成 `/login` 和 `/model`，随后使用各 Skill 的
“Continue the diagnosis” 任务交接段。未知 SSH 主机密钥必须在本地 TUI 核对确认。
串口默认先读取，写入或修复需单独授权。用户拒绝安装时保留手动指导，不反复请求授权。

JishuBuddy 的 TUI 和 AG-UI Server 默认发送低频激活与心跳遥测。可在启动前关闭：

```bash
export JISHUBUDDY_TELEMETRY_DISABLED=true
```

## 开发与验证 / Development and testing

修改安装逻辑时同步更新四份脚本，保留每个 Skill 的独立安装能力。使用 Node.js 自带的
测试运行器验证安装参数、版本确认、错误处理及脚本一致性，无需安装额外依赖：

```bash
node --test tests/install-jishubuddy.test.mjs
```

测试使用隔离的命令替身，不访问 npm registry、不全局安装软件、不连接设备。

JishuBuddy 是独立项目，与 Raspberry Pi Ltd. 无隶属或背书关系。
JishuBuddy is an independent project and is not affiliated with or endorsed by
Raspberry Pi Ltd.

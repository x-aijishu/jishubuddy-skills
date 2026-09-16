# JishuBuddy Skills

这是一组面向 Raspberry Pi 场景的 Agent Skills。每个 Skill 先提供安全、可独立使用的诊断指导；
当问题需要真实 SSH 或串口证据时，再在用户明确授权后安装
[JishuBuddy](https://www.npmjs.com/package/jishubuddy)。

## Skills

| Skill | 场景 |
|---|---|
| `raspberry-pi-first-setup` | 首次安装、无头配置和接入准备 |
| `raspberry-pi-ssh-doctor` | SSH 网络、端口、主机密钥和认证故障 |
| `raspberry-pi-health-check` | CPU、内存、磁盘、温度、降频和服务检查 |
| `raspberry-pi-serial-rescue` | 启动失败、网络失联和串口控制台排障 |

## 安装行为

每个 Skill 都附带相同的权限式安装脚本：

```bash
bash scripts/install-jishubuddy.sh check
bash scripts/install-jishubuddy.sh install --yes
```

`check` 只读取平台、Node.js、npm、当前版本和 npm 目标版本。Agent 必须先展示检查结果并获得
用户明确授权，才能运行带 `--yes` 的全局安装。脚本不会自动启动 JishuBuddy、配置设备、索取
凭据或提升权限。

JishuBuddy 当前支持 Linux x64、Linux ARM64 和 Apple Silicon macOS；npm 安装需要
Node.js 22 或更高版本。

JishuBuddy 是独立项目，与 Raspberry Pi Ltd. 无隶属或背书关系。

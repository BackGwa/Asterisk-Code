<div align="center">

# Asterisk-Code

Asterisk is a multi-agent orchestration toolkit for OpenCode, providing a structured system that enables multiple specialized agents to systematically divide and execute complex tasks.

<br>

[![GitHub Contributors](https://img.shields.io/github/contributors/BackGwa/Asterisk-Code)](https://github.com/BackGwa/Asterisk-Code/graphs/contributors)
[![GitHub Forks](https://img.shields.io/github/forks/BackGwa/Asterisk-Code)](https://github.com/BackGwa/Asterisk-Code/network/members)
[![GitHub Stars](https://img.shields.io/github/stars/BackGwa/Asterisk-Code)](https://github.com/BackGwa/Asterisk-Code/stargazers)
[![License](https://img.shields.io/github/license/BackGwa/Asterisk-Code)](https://github.com/BackGwa/Asterisk-Code/blob/main/LICENSE)

<br>

</div>

## Install

- macOS/Linux:
  ```
  curl -fsSL https://raw.githubusercontent.com/BackGwa/Asterisk-Code/main/install.sh | bash
  ```
- Windows (PowerShell):
  ```
  irm https://raw.githubusercontent.com/BackGwa/Asterisk-Code/main/install.ps1 | iex
  ```

## Usage

After installation, start an OpenCode session and use the Asterisk agents.

- To start a new project or modify an existing one, assign either `Asterisk-Planner` or `Asterisk-Builder` as the active agent.
- `Asterisk-Planner` stores the approved plan in `.asterisk/PLANS.md`, starts a new `Asterisk-Builder` session with concise task context, and switches to that session when supported by OpenCode.
- Enter `/asterisk` in the TUI to configure and control Asterisk.
- Use `/autotask <requirements>` to start Auto Task Mode for an autonomous Planner-to-Builder workflow. Natural-language Auto Task requests are activated through the `asterisk_auto_task` tool.

## Agents

| Agent | Role |
|---|---|
| Asterisk-Planner | Creates structured implementation plans |
| Asterisk-Builder | Carries out implementation from plans |
| Asterisk-Explorer | Explores the codebase for context |
| Asterisk-Research | Researches approaches and external docs |
| Asterisk-Validator | Reviews requirements and risky code |
| Asterisk-Thread | Focused implementation sub-agent |

## Contributing

Thank you for contributing to Asterisk-Code!

![Contributors](https://contrib.rocks/image?repo=BackGwa/Asterisk-Code)

## License

This project is distributed under the MIT License. See the [LICENSE](./LICENSE) file for more details.

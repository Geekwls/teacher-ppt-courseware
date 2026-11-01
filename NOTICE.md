# NOTICE

本项目的**插件工程架构**(marketplace.json + plugin.json + skills/ 布局、rendering/ 入口文档模式、
LLM-as-judge 评测协议)借鉴自 Anthropic 开源的
[k12-teacher-skills](https://github.com/anthropics/k12-teacher-skills)(Apache-2.0 License),
并针对中国人教版小学教学场景重写与本地化。

- `plugin/knowledge/` 内的五层教材知识库(157 单元 / 556 知识点)vendored 自
  同工作区的 `primary-school-practice-skill` 项目(人教版教材证据链工程),
  仅复制结构化事实层,不含任何教材/教参扫描件。
- 未使用 k12-teacher-skills 的 Learning Commons Knowledge Graph 连接器与第三方 MCP 配置;
  内容取材全部由本地知识库与宿主大模型完成。

两个上游项目的贡献者对本项目内容不承担任何责任。

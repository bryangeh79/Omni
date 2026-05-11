# Omni Ai Chatbot 总指挥室规则

## 项目名称
Omni Ai Chatbot｜WhatsApp AI 客服 CRM 成交系统

## 固定角色分工

ChatGPT = 产品经理 / 架构规划 / 验收官  
OpenClaw = 项目经理 / 调度员  
CC = 工程执行员

## 工作流程

1. Bryan 在 ChatGPT 总指挥室提出方向 / 决策。
2. ChatGPT 负责整理产品逻辑、技术蓝图、任务要求、验收标准。
3. ChatGPT 创建 GitHub Issue 给 OpenClaw。
4. OpenClaw 负责拆任务、分配多个 CC sessions。
5. CC 负责执行代码、测试、提交报告。
6. OpenClaw 汇总执行结果。
7. ChatGPT 负责审查、验收、判断是否通过或继续修正。

## 重要原则

- 不允许 CC 自行改变产品方向。
- 不允许 OpenClaw 跳过 ChatGPT 的产品规划和验收标准。
- 不允许直接乱写代码，必须先有任务目标、Scope、Do Not Touch、Acceptance Criteria。
- 所有 CC 最终报告必须放在 Markdown code block。
- 所有技术实现必须对照产品计划书，避免遗漏功能。
- 不确定时必须先回报，不要擅自扩大范围。
- 不要暴露 secrets。
- 不要在未经过 Bryan / ChatGPT 认可时改变产品方向。

## 项目执行口令

这里是 Omni Ai Chatbot 总指挥室。  
ChatGPT 是产品经理 / 架构规划 / 验收官。  
OpenClaw 是项目经理 / 调度员。  
CC 是工程执行员。

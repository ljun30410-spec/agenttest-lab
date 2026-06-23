# AgentTest Lab

AgentTest Lab 是一个面向 AI Agent / AI 问答系统的轻量级测试平台，用于构建、运行和分析测试用例，验证回答质量、工具调用链和多轮对话行为是否符合预期。

## 核心能力

- 批量执行测试用例，支持并发运行
- 支持 Markdown / JSON / CSV / Excel 测试用例导入
- 支持自然语言用例 AI 转换为标准 JSON
- 支持关键词软断言、状态码、响应时间和内容长度校验
- 支持 AI 语义裁判
- 支持单轮 / 多轮对话测试
- 支持 Agent Trace 工具调用链断言，例如必须调用或禁止调用 `web_search`
- 支持历史报告保存与回归对比

## 适用场景

- 验证联网搜索是否按预期触发
- 验证知识库问答是否引用正确资料
- 验证多轮上下文是否连续
- 验证 Agent 工具调用链是否符合设计
- 验证 Agent 行为一致性是否稳定
- 沉淀可重复执行的 AI 应用回归测试集

## 快速开始

```bash
npm install
cp .env.example .env
npm start
```

启动后访问：

```text
http://localhost:5001/
```

`.env`、`judge.config.json`、`reports/` 和 `node_modules/` 已在 `.gitignore` 中排除，请不要提交真实 API Key。

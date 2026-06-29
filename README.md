# AgentTest Lab

AgentTest Lab 是一套面向 AI Agent / AI 问答系统的**轻量级本地测试平台**，包含两个互补工具：

| 工具 | 地址 | 用途 |
|------|------|------|
| **AgentTest Lab** | http://localhost:5001/ | 对已部署的 Agent API 做批量回归（curl + 断言 + Trace） |
| **Prompt Diff Lab** | http://localhost:5001/prompt_diff.html | 对同一批问题做 A/B Prompt（及模型）对比 |

覆盖「**Prompt 迭代验证**」和「**Agent 接口回归**」两条测试链路，本地一条命令启动，浏览器即用。

## AgentTest Lab — 核心能力

- 粘贴 curl 即可接入，自动解析 URL / Headers / Body
- 批量执行测试用例，单次模式支持并发
- 支持 Markdown / JSON / CSV / Excel 用例导入
- 自然语言用例 **AI 转换** 为标准 JSON（强制条数一致）
- 自然语言需求 **AI 生成** 用例草稿
- 关键词软断言、状态码、响应时间、内容长度校验
- **AI 语义裁判**（pass / score / reason）
- **单轮 / 多轮对话**测试（多轮自动复用 conversationId）
- **Agent Trace 工具链断言**（required_tools / forbidden_tools / required_steps / 耗时上限）
- 历史报告保存、回归 diff、失败汇总、HTML / CSV 导出
- 暗色模式、进度条、Toast 通知；**页面切换后表单与报告自动恢复**

## Prompt Diff Lab — 核心能力

- 同一批问题分别跑 **版本 A（基线）** 与 **版本 B（候选）**
- 可配置不同的 System Prompt 和可选模型
- 并排对比回答、耗时、字数
- 可选 **AI 裁判**，对比通过率与均分变化
- **关键词命中率**统计（JSON 用例可带 keywords）
- 报告自动保存至 `reports/prompt-diff-{timestamp}.json`

## 两个工具如何配合

```text
Prompt 迭代阶段     →  Prompt Diff Lab（快速 A/B，成本低）
Prompt 定稿接入 API →  AgentTest Lab（测真实接口 + Trace）
发版 / 改代码后     →  AgentTest Lab 全量回归
```

## 适用场景

- 验证联网搜索是否按预期触发（`web_search` Trace 断言）
- 验证知识库问答是否引用正确资料
- 验证多轮上下文是否连续
- 验证 Agent 工具调用链是否符合设计
- 评估 System Prompt 或模型变更后的回答质量
- 沉淀可重复执行的 AI 应用回归测试集

## 快速开始

```bash
git clone https://github.com/ljun30410-spec/agenttest-lab.git
cd agenttest-lab
npm install
cp .env.example .env   # 填入 TOKENHUB_API_KEY
npm start
```

启动后访问：

| 页面 | 地址 |
|------|------|
| AgentTest Lab | http://localhost:5001/ |
| Prompt Diff Lab | http://localhost:5001/prompt_diff.html |
| 使用手册 | http://localhost:5001/使用手册.html |

## 模型配置

AI 断言、AI 生成/转换用例、Prompt Diff Lab **共用同一套模型配置**，推荐在服务端 `.env` 中配置：

```env
TOKENHUB_API_KEY=sk-your-key-here
TOKENHUB_BASE_URL=https://tokenhub.tencentmaas.com/v1
TOKENHUB_MODEL=deepseek-v4-flash
```

也可使用 `judge.config.json` 或在前端临时填写 API Key（仅存 sessionStorage）。

## 技术栈

- **后端**：`server.js`（CORS 代理、报告存储、AI 调用）
- **前端**：原生 HTML / JS（`test_tool.html`、`prompt_diff.html`）
- **共享逻辑**：`test_tool.helpers.js`
- **模型接入**：Vercel AI SDK + 腾讯云 TokenHub（OpenAI 兼容）

## 安全说明

以下文件/目录已在 `.gitignore` 中排除，**请勿提交真实 API Key**：

- `.env`
- `judge.config.json`
- `reports/`

curl 中的 Cookie / Token 仅存于浏览器 localStorage / sessionStorage，不会写入代码库。

## 仓库

https://github.com/ljun30410-spec/agenttest-lab

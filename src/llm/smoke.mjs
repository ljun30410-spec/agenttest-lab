/**
 * TokenHub 连通性自测（单次问答）
 * 用法：
 *   1) 复制 .env.example 为 .env 并填入 TOKENHUB_API_KEY
 *   2) npm run smoke   （或 node src/llm/smoke.mjs）
 */
import 'dotenv/config';
import { chatComplete, resolveTokenHubConfig } from './tokenhub.mjs';

async function main() {
    const cfg = resolveTokenHubConfig();
    if (!cfg.apiKey) {
        console.error('✗ 未找到 TOKENHUB_API_KEY，请在 .env 中配置后重试。');
        process.exit(1);
    }
    console.log('→ BaseURL:', cfg.baseUrl);
    console.log('→ Model  :', cfg.model);
    console.log('→ 发送测试问题：1 加 1 等于几？\n');

    try {
        const { text, usage } = await chatComplete({
            ...cfg,
            messages: [
                { role: 'system', content: '你是一个简洁的助手，只用一句话回答。' },
                { role: 'user', content: '1 加 1 等于几？' }
            ],
            maxTokens: 64,
            temperature: 0
        });
        console.log('✓ TokenHub 连通成功，回答：');
        console.log(text);
        if (usage) console.log('\nusage:', JSON.stringify(usage));
    } catch (e) {
        console.error('✗ 调用失败：', e && e.message ? e.message : e);
        if (e && e.statusCode) console.error('  HTTP 状态码：', e.statusCode);
        if (e && e.responseBody) console.error('  响应体：', String(e.responseBody).slice(0, 300));
        process.exit(1);
    }
}

main();

/**
 * TokenHub（腾讯云，OpenAI 兼容）调用封装
 * 用 Vercel AI SDK 替换手写 HTTP。被 server.js 通过动态 import() 调用。
 */
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

const DEFAULT_BASE_URL = 'https://tokenhub.tencentmaas.com/v1';
const DEFAULT_MODEL = 'deepseek-v4-flash';

/**
 * 解析配置：传入 > 环境变量 > 默认值
 */
export function resolveTokenHubConfig(override = {}) {
    const pick = (...vals) => {
        for (const v of vals) {
            if (v != null && String(v).trim()) return String(v).trim();
        }
        return '';
    };
    return {
        baseUrl: pick(override.baseUrl, process.env.TOKENHUB_BASE_URL) || DEFAULT_BASE_URL,
        apiKey: pick(override.apiKey, process.env.TOKENHUB_API_KEY),
        model: pick(override.model, process.env.TOKENHUB_MODEL) || DEFAULT_MODEL
    };
}

/**
 * 单次（非流式）对话补全，返回纯文本。
 * @param {object} opts
 * @param {string} [opts.baseUrl]
 * @param {string} [opts.apiKey]
 * @param {string} [opts.model]
 * @param {Array<{role:string,content:string}>} opts.messages
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.temperature]
 * @returns {Promise<{text:string, usage?:object}>}
 */
export async function chatComplete({ baseUrl, apiKey, model, messages, maxTokens, temperature } = {}) {
    if (!apiKey) throw new Error('缺少 TokenHub API Key');
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('messages 不能为空');
    }
    const provider = createOpenAICompatible({
        name: 'tokenhub',
        apiKey,
        baseURL: (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
    });
    const { text, usage } = await generateText({
        model: provider(model || DEFAULT_MODEL),
        messages,
        maxTokens,
        temperature: temperature != null ? temperature : 0
    });
    return { text, usage };
}

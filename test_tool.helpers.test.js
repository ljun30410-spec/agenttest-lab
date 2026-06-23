/**
 * test_tool.helpers.js 回归测试
 * 运行: node test_tool.helpers.test.js
 */
const assert = require('assert');
const H = require('./test_tool.helpers.js');

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
    } catch (err) {
        console.error(`  ✗ ${name}`);
        throw err;
    }
}

console.log('test_tool.helpers.test.js');

test('normalizeSingleTurnCases 忽略 turns[]，仅保留 question', () => {
    const cases = H.normalizeSingleTurnCases([
        {
            id: 'X-001',
            question: '单次问题',
            turns: [
                { question: '多轮第1轮' },
                { question: '多轮第2轮' }
            ]
        }
    ]);
    assert.strictEqual(cases.length, 1);
    assert.strictEqual(cases[0].isMultiTurn, false);
    assert.strictEqual(cases[0].turns.length, 1);
    assert.strictEqual(cases[0].turns[0].question, '单次问题');
});

test('normalizeMultiTurnScenarios 要求 turns[] 非空', () => {
    assert.throws(() => {
        H.normalizeMultiTurnScenarios([{ id: 'BAD-001', question: '只有单次' }]);
    }, /缺少 turns\[\]/);
});

test('normalizeMultiTurnScenarios 正确标记多轮场景', () => {
    const cases = H.normalizeMultiTurnScenarios([
        {
            id: 'MT-001',
            turns: [
                { question: '第一轮' },
                { question: '第二轮' }
            ]
        }
    ]);
    assert.strictEqual(cases[0].isMultiTurn, true);
    assert.strictEqual(cases[0].turns.length, 2);
});

test('validateDatasetForMode 单次模式提示 turns[]', () => {
    const issues = H.validateDatasetForMode([
        { id: 'A', turns: [{ question: 'q' }] }
    ], 'single');
    assert.ok(issues.some(msg => msg.includes('turns[]')));
});

test('validateDatasetForMode 多轮模式拒绝无 turns[]', () => {
    const issues = H.validateDatasetForMode([
        { id: 'B', question: 'q' }
    ], 'multi');
    assert.ok(issues.some(msg => msg.includes('缺少 turns[]')));
});

test('isPlaceholderKnowledgeId 不覆盖 curl 真实 knowledgeId', () => {
    const curl = { body: { message: { content: 'orig' }, knowledgeId: 's_real123' } };
    const inj = { questionPath: 'message.content', knowledgePath: 'knowledgeId', conversationPath: 'conversationId' };
    const scenario = H.normalizeSingleTurnCases([
        { id: 'FT-001', question: 'test', knowledgeId: 's_xxxxxxxxxxxx' }
    ])[0];
    const state = H.createSessionState(curl, inj);
    const body = H.buildTurnRequestBody(curl, scenario.turns[0], scenario, state, inj);
    assert.strictEqual(body.knowledgeId, 's_real123');
});

test('splitNaturalCaseItems 按自然语言条目拆分且不按句号误拆', () => {
    const items = H.splitNaturalCaseItems([
        '1. 用户问“今天北京天气怎么样？”，应该触发联网搜索。',
        '',
        '2、用户问“什么是 RAG？请解释原理。”，不应强制联网。'
    ].join('\n'));
    assert.deepStrictEqual(items, [
        '用户问“今天北京天气怎么样？”，应该触发联网搜索。',
        '用户问“什么是 RAG？请解释原理。”，不应强制联网。'
    ]);
});

test('splitNaturalCaseItems 支持 --- 分隔长用例', () => {
    const items = H.splitNaturalCaseItems([
        '输入：根据资料回答重低音测试是什么。',
        '期望：回答要引用资料，不要联网。',
        '---',
        '输入：资料无关时回答今天热点新闻。',
        '期望：应调用 web_search。'
    ].join('\n'));
    assert.strictEqual(items.length, 2);
    assert.ok(items[0].includes('重低音测试'));
    assert.ok(items[1].includes('web_search'));
});

test('ensureExactCaseCount 拦截模型返回数量不一致', () => {
    assert.throws(() => {
        H.ensureExactCaseCount([{ id: 'A' }, { id: 'B' }], 1);
    }, /识别到 1 条输入，但模型返回 2 条/);
});

test('inferTraceExpectationFromText 从自然语言推断联网工具断言', () => {
    assert.deepStrictEqual(
        H.inferTraceExpectationFromText('用户问天气怎么样，期望工具链调用中触发联网搜索'),
        { required_tools: ['web_search'] }
    );
    assert.deepStrictEqual(
        H.inferTraceExpectationFromText('资料可完整回答时不应联网，也不要调用 web_search'),
        { forbidden_tools: ['web_search'] }
    );
});

test('applyInferredTraceExpectations 为转换用例补齐 expected.trace', () => {
    const cases = H.applyInferredTraceExpectations([
        { id: 'A', expected: { status_code: 200, keywords: [] } },
        { id: 'B', expected: { status_code: 200, keywords: [], trace: { required_tools: ['custom_tool'] } } }
    ], [
        '用户问天气怎么样，期望触发联网搜索',
        '保留模型已经返回的自定义 trace'
    ]);

    assert.deepStrictEqual(cases[0].expected.trace, { required_tools: ['web_search'] });
    assert.deepStrictEqual(cases[1].expected.trace, { required_tools: ['custom_tool'] });
});

test('normalizeResponseContent 从 SSE 提取文本', () => {
    const raw = 'data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n';
    const result = H.normalizeResponseContent(raw, { 'content-type': 'text/event-stream' });
    assert.strictEqual(result.normalized_content, '你好');
});

test('无原始 conversationId 时不伪造会话 ID，避免产品端未发现数据', () => {
    const curl = { body: { question: 'orig', knowledgeId: 's_real123' } };
    const inj = { questionPath: 'question', knowledgePath: 'knowledgeId', conversationPath: 'conversationId' };
    const state = H.createSessionState(curl, inj);
    const scenario = H.normalizeMultiTurnScenarios([
        {
            id: 'MT-001',
            turns: [{ question: '第一轮' }, { question: '第二轮' }]
        }
    ])[0];

    const firstBody = H.buildTurnRequestBody(curl, scenario.turns[0], scenario, state, inj);
    const secondBody = H.buildTurnRequestBody(curl, scenario.turns[1], scenario, state, inj);

    assert.strictEqual(firstBody.conversationId, undefined);
    assert.strictEqual(secondBody.conversationId, undefined);
});

test('createSessionState 不应通过 ensureConversationId 伪造产品端会话 ID', () => {
    const curl = { body: { question: 'orig', knowledgeId: 's_real123' } };
    const inj = { questionPath: 'question', knowledgePath: 'knowledgeId', conversationPath: 'conversationId' };
    const state = H.createSessionState(curl, inj, { ensureConversationId: true });
    assert.strictEqual(state.conversationId, '');
});

test('首轮响应返回真实 conversationId 后，后续轮次复用该 ID', () => {
    const curl = { body: { question: 'orig', knowledgeId: 's_real123' } };
    const inj = { questionPath: 'question', knowledgePath: 'knowledgeId', conversationPath: 'conversationId' };
    const state = H.createSessionState(curl, inj);
    const scenario = H.normalizeMultiTurnScenarios([
        {
            id: 'MT-001',
            turns: [{ question: '第一轮' }, { question: '第二轮' }]
        }
    ])[0];

    const firstBody = H.buildTurnRequestBody(curl, scenario.turns[0], scenario, state, inj);
    H.updateSessionStateFromResponse(
        state,
        'data: {"data":{"conversation_id":"ac_realFromServer"}}\n\n',
        { 'content-type': 'text/event-stream' }
    );
    const secondBody = H.buildTurnRequestBody(curl, scenario.turns[1], scenario, state, inj);

    assert.strictEqual(firstBody.conversationId, undefined);
    assert.strictEqual(secondBody.conversationId, 'ac_realFromServer');
});

test('extractConversationIdFromResponse 支持 SSE 中的 conversation_id 别名', () => {
    const raw = 'data: {"data":{"conversation_id":"ac_response123"}}\n\ndata: [DONE]\n';
    assert.strictEqual(
        H.extractConversationIdFromResponse(raw, { 'content-type': 'text/event-stream' }),
        'ac_response123'
    );
});

test('normalizeTrace 从 JSON trace.steps 提取步骤与耗时', () => {
    const raw = JSON.stringify({
        trace: {
            steps: [
                { name: 'retrieve', type: 'retriever', duration_ms: 120, status: 'success' },
                { name: 'web_search', type: 'tool', duration_ms: 450, status: 'success' },
                { name: 'answer', type: 'llm', duration_ms: 300, status: 'success' }
            ]
        }
    });
    const trace = H.normalizeTrace(raw, { 'content-type': 'application/json' });
    assert.strictEqual(trace.found, true);
    assert.deepStrictEqual(trace.summary.stepNames, ['retrieve', 'web_search', 'answer']);
    assert.deepStrictEqual(trace.summary.tools, ['web_search']);
    assert.strictEqual(trace.summary.totalDurationMs, 870);
});

test('normalizeTrace 从 SSE debug.trace.tool_calls 提取工具调用', () => {
    const raw = [
        'data: {"debug":{"trace":{"tool_calls":[{"name":"web_search","duration_ms":800,"status":"success"}]}}}',
        '',
        'data: [DONE]'
    ].join('\n');
    const trace = H.normalizeTrace(raw, { 'content-type': 'text/event-stream' });
    assert.strictEqual(trace.found, true);
    assert.strictEqual(trace.steps.length, 1);
    assert.strictEqual(trace.steps[0].name, 'web_search');
    assert.strictEqual(trace.steps[0].type, 'tool');
    assert.deepStrictEqual(trace.summary.tools, ['web_search']);
});

test('normalizeTrace 缺失 trace 时返回空摘要', () => {
    const trace = H.normalizeTrace(JSON.stringify({ answer: 'hello' }), { 'content-type': 'application/json' });
    assert.strictEqual(trace.found, false);
    assert.deepStrictEqual(trace.steps, []);
    assert.deepStrictEqual(trace.summary.tools, []);
});

test('extractRealToolChain 只保留 start/end 成对且成功的真实工具调用', () => {
    const raw = [
        'event: event',
        'data: {"type":"tool_call","phase":"start","name":"knowledge_search","toolCallId":"call-1","input":{"query":"q1"}}',
        '',
        'event: event',
        'data: {"type":"tool_call_intent","name":"web_search","toolCallId":"intent-only","message":"准备调用"}',
        '',
        'event: event',
        'data: {"type":"reasoning","delta":"这里是思考文本，不应进入真实调用链"}',
        '',
        'event: event',
        'data: {"type":"tool_call","phase":"end","name":"knowledge_search","toolCallId":"call-1","success":true,"output":{"count":2},"latencyMs":123}',
        '',
        'event: event',
        'data: {"type":"tool_call","phase":"start","name":"web_search","toolCallId":"call-2","input":{"query":"q2"}}',
        '',
        'event: event',
        'data: {"type":"tool_call","phase":"end","name":"web_search","toolCallId":"call-2","success":false,"output":{"error":"fail"},"latencyMs":456}',
        '',
        'event: event',
        'data: {"type":"tool_call","phase":"end","name":"orphan_tool","toolCallId":"call-3","success":true,"output":{"ok":true},"latencyMs":1}'
    ].join('\n');
    const chain = H.extractRealToolChain(raw, { 'content-type': 'text/event-stream' });
    assert.match(chain.filter_explain, /reasoning/);
    assert.strictEqual(chain.real_tool_chain.length, 1);
    assert.deepStrictEqual(chain.real_tool_chain[0], {
        sequence: 1,
        tool_call_id: 'call-1',
        tool_name: 'knowledge_search',
        request_params: '{"query":"q1"}',
        latency_ms: 123,
        execute_status: 'success',
        result_summary: '{"count":2}'
    });
});

test('normalizeTrace 在真实 tool_call 事件存在时优先使用严格真实调用链', () => {
    const raw = [
        'data: {"type":"tool_call","phase":"start","name":"knowledge_search","toolCallId":"call-1","input":{"query":"q1"}}',
        '',
        'data: {"type":"tool_call","phase":"end","name":"knowledge_search","toolCallId":"call-1","success":true,"output":{"count":2},"latencyMs":123}',
        '',
        'data: {"type":"reasoning","delta":"预规划"}'
    ].join('\n');
    const trace = H.normalizeTrace(raw, { 'content-type': 'text/event-stream' });
    assert.strictEqual(trace.found, true);
    assert.strictEqual(trace.steps.length, 1);
    assert.strictEqual(trace.steps[0].name, 'knowledge_search');
    assert.strictEqual(trace.steps[0].type, 'tool');
    assert.strictEqual(trace.steps[0].duration_ms, 123);
    assert.strictEqual(trace.real_tool_chain.real_tool_chain[0].tool_call_id, 'call-1');
});

test('evaluateTraceExpectations 校验必需工具、禁用工具和步骤顺序', () => {
    const trace = H.normalizeTrace(JSON.stringify({
        trace: {
            steps: [
                { name: 'retrieve', type: 'retriever', duration_ms: 100 },
                { name: 'web_search', type: 'tool', duration_ms: 200 },
                { name: 'answer', type: 'llm', duration_ms: 300 }
            ]
        }
    }), { 'content-type': 'application/json' });
    const checks = H.evaluateTraceExpectations(trace, {
        required_tools: ['web_search'],
        forbidden_tools: ['calculator'],
        required_steps: ['retrieve', 'web_search', 'answer'],
        max_total_time_ms: 1000,
        max_tool_time_ms: 500
    });
    assert.strictEqual(checks.every(check => check.passed), true);
});

test('evaluateTraceExpectations trace 缺失时返回失败', () => {
    const checks = H.evaluateTraceExpectations(H.normalizeTrace('{}', {}), {
        required_tools: ['web_search']
    });
    assert.strictEqual(checks[0].passed, false);
    assert.match(checks[0].actual, /未发现/);
});

console.log('\nAll tests passed.');

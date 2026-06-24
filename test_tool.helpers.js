/**
 * AgentTest Lab — 可复用辅助函数（多轮会话 / SSE 归一化）
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TestToolHelpers = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    function deepClone(value) {
        if (value === null || value === undefined) return value;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch {
            return value;
        }
    }

    function parseFieldPath(path) {
        return String(path || '')
            .trim()
            .split('.')
            .map(part => part.trim())
            .filter(Boolean);
    }

    function hasPath(target, path) {
        const parts = parseFieldPath(path);
        let current = target;
        for (const part of parts) {
            if (current === null || current === undefined || !(part in current)) {
                return false;
            }
            current = current[part];
        }
        return true;
    }

    function getPath(target, path) {
        const parts = parseFieldPath(path);
        let current = target;
        for (const part of parts) {
            if (current === null || current === undefined) return undefined;
            current = current[part];
        }
        return current;
    }

    function setPath(target, path, value) {
        const parts = parseFieldPath(path);
        if (parts.length === 0) return;

        let current = target;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            const nextPart = parts[i + 1];
            if (current[part] === undefined || current[part] === null || typeof current[part] !== 'object') {
                current[part] = /^\d+$/.test(nextPart) ? [] : {};
            }
            current = current[part];
        }
        current[parts[parts.length - 1]] = value;
    }

    function resolveQuestionPath(body, configuredPath) {
        const normalizedPath = String(configuredPath || 'auto').trim();
        if (normalizedPath && normalizedPath.toLowerCase() !== 'auto') {
            return normalizedPath;
        }
        const candidates = [
            'message.content',
            'question',
            'query',
            'input',
            'prompt',
            'content',
            'messages.0.content'
        ];
        return candidates.find(path => hasPath(body, path)) || 'question';
    }

    function normalizeContextPath(body, configuredPath) {
        const normalizedPath = String(configuredPath || '').trim();
        // 空值 / none / auto → 自动检测
        if (!normalizedPath || normalizedPath.toLowerCase() === 'none' || normalizedPath.toLowerCase() === 'auto') {
            if (!body || typeof body !== 'object') return '';
            const candidates = [
                'conversationId',
                'conversation_id',
                'sessionId',
                'session_id',
                'chatId',
                'chat_id'
            ];
            for (const key of candidates) {
                if (hasPath(body, key)) return key;
            }
            // 递归搜索嵌套对象
            function deepSearch(obj, prefix) {
                if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
                for (const k of Object.keys(obj)) {
                    const fullKey = prefix ? prefix + '.' + k : k;
                    if (candidates.some(c => k.toLowerCase() === c.toLowerCase())) return fullKey;
                    if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
                        const found = deepSearch(obj[k], fullKey);
                        if (found) return found;
                    }
                }
                return null;
            }
            return deepSearch(body, '') || '';
        }
        return normalizedPath;
    }

    function isPlaceholderKnowledgeId(knowledgeId) {
        const value = String(knowledgeId == null ? '' : knowledgeId).trim();
        if (!value) return true;
        return /^s_x+$/i.test(value) || value === 's_xxxxxxxxxxxx';
    }

    function defaultExpected(overrides) {
        return {
            status_code: 200,
            keywords: [],
            min_length: 10,
            max_time: 50,
            ...(overrides || {})
        };
    }

    function stripNaturalCasePrefix(line) {
        return String(line || '')
            .trim()
            .replace(/^[-*+]\s+/, '')
            .replace(/^\d+[\.\uff0e、\)]\s*/, '')
            .trim();
    }

    function splitNaturalCaseItems(input) {
        const text = String(input || '').replace(/\r\n?/g, '\n').trim();
        if (!text) return [];

        if (/^---+\s*$/m.test(text)) {
            return text
                .split(/^---+\s*$/m)
                .map(part => part.split('\n').map(line => line.trim()).filter(Boolean).join('\n').trim())
                .filter(Boolean)
                .map(stripNaturalCasePrefix);
        }

        return text
            .split('\n')
            .map(stripNaturalCasePrefix)
            .filter(Boolean);
    }

    function ensureExactCaseCount(cases, expectedCount) {
        const actualCount = Array.isArray(cases) ? cases.length : 0;
        const wanted = parseInt(expectedCount) || 0;
        if (actualCount !== wanted) {
            throw new Error(`识别到 ${wanted} 条输入，但模型返回 ${actualCount} 条，请调整输入格式后重试`);
        }
        return cases;
    }

    function uniqueStrings(items) {
        return [...new Set((items || []).map(item => String(item || '').trim()).filter(Boolean))];
    }

    function normalizeTraceExpectation(trace) {
        if (!trace || typeof trace !== 'object' || Array.isArray(trace)) return null;
        const normalized = {};
        const requiredTools = uniqueStrings(trace.required_tools || trace.requiredTools);
        const forbiddenTools = uniqueStrings(trace.forbidden_tools || trace.forbiddenTools);
        const requiredSteps = uniqueStrings(trace.required_steps || trace.requiredSteps);
        if (requiredTools.length) normalized.required_tools = requiredTools;
        if (forbiddenTools.length) normalized.forbidden_tools = forbiddenTools;
        if (requiredSteps.length) normalized.required_steps = requiredSteps;
        if (trace.max_total_time_ms != null || trace.maxTotalTimeMs != null) {
            const value = Number(trace.max_total_time_ms != null ? trace.max_total_time_ms : trace.maxTotalTimeMs);
            if (Number.isFinite(value)) normalized.max_total_time_ms = value;
        }
        if (trace.max_tool_time_ms != null || trace.maxToolTimeMs != null) {
            const value = Number(trace.max_tool_time_ms != null ? trace.max_tool_time_ms : trace.maxToolTimeMs);
            if (Number.isFinite(value)) normalized.max_tool_time_ms = value;
        }
        return Object.keys(normalized).length ? normalized : null;
    }

    function inferTraceExpectationFromText(text) {
        const value = String(text || '').toLowerCase();
        const mentionsWebSearch = /web[_\s-]?search|联网搜索|网络搜索|调用搜索|触发搜索|搜索工具|联网/.test(value);
        if (!mentionsWebSearch) return null;

        const forbidsWebSearch = /不应联网|不要联网|无需联网|不需要联网|禁止联网|不调用\s*web[_\s-]?search|不要调用\s*web[_\s-]?search|禁止调用\s*web[_\s-]?search/.test(value);
        if (forbidsWebSearch) return { forbidden_tools: ['web_search'] };

        const requiresWebSearch = /应联网|需要联网|触发联网搜索|调用联网搜索|必须联网|应调用\s*web[_\s-]?search|需要调用\s*web[_\s-]?search|调用\s*web[_\s-]?search/.test(value);
        if (requiresWebSearch) return { required_tools: ['web_search'] };

        return null;
    }

    function applyInferredTraceExpectations(cases, sourceItems) {
        if (!Array.isArray(cases)) return cases;
        return cases.map((testCase, index) => {
            const expected = { ...((testCase && testCase.expected) || {}) };
            const existingTrace = normalizeTraceExpectation(expected.trace);
            const inferredTrace = inferTraceExpectationFromText(sourceItems && sourceItems[index]);
            const nextTrace = existingTrace || inferredTrace;
            if (!nextTrace) return testCase;
            return {
                ...testCase,
                expected: {
                    ...expected,
                    trace: nextTrace
                }
            };
        });
    }

    function normalizeTurn(turn, parentCase, index) {
        const parentExpected = defaultExpected(parentCase.expected);
        const turnExpected = defaultExpected(turn && turn.expected);
        return {
            turnIndex: index,
            question: String((turn && turn.question) || '').trim(),
            knowledgeId: turn && turn.knowledgeId != null ? turn.knowledgeId : (parentCase.knowledgeId || null),
            expected: {
                ...parentExpected,
                ...turnExpected,
                keywords: turnExpected.keywords.length ? turnExpected.keywords : parentExpected.keywords
            },
            validation_points: (turn && turn.validation_points) || parentCase.validation_points || []
        };
    }

    function normalizeScenario(testCase, index) {
        const base = {
            id: String(testCase.id || `CASE-${index + 1}`),
            title: testCase.title || '',
            type: testCase.type || '功能测试',
            priority: testCase.priority || 'P1',
            knowledgeId: testCase.knowledgeId != null ? testCase.knowledgeId : null,
            conversation: testCase.conversation || { mode: 'same_context' },
            validation_points: testCase.validation_points || [],
            expected: defaultExpected(testCase.expected)
        };

        const rawTurns = Array.isArray(testCase.turns) && testCase.turns.length > 0
            ? testCase.turns
            : [{
                question: testCase.question || '',
                knowledgeId: testCase.knowledgeId,
                expected: testCase.expected,
                validation_points: testCase.validation_points
            }];

        const turns = rawTurns.map((turn, i) => normalizeTurn(turn, base, i + 1));
        return {
            ...base,
            turns,
            isMultiTurn: turns.length > 1,
            question: turns[0] ? turns[0].question : (testCase.question || ''),
            expected: turns[0] ? turns[0].expected : base.expected
        };
    }

    function normalizeScenarios(testCases) {
        if (!Array.isArray(testCases)) return [];
        return testCases.map((tc, i) => normalizeScenario(tc, i));
    }

    function hasTurnsArray(testCase) {
        return Array.isArray(testCase && testCase.turns) && testCase.turns.length > 0;
    }

    /** 单次对话：仅使用顶层 question，忽略 turns[] */
    function normalizeSingleTurnCases(testCases) {
        if (!Array.isArray(testCases)) return [];
        return testCases.map((tc, i) => {
            const scenario = normalizeScenario({
                id: tc.id,
                title: tc.title,
                type: tc.type,
                priority: tc.priority,
                knowledgeId: tc.knowledgeId,
                question: tc.question != null ? tc.question : '',
                expected: tc.expected,
                validation_points: tc.validation_points
            }, i);
            return {
                ...scenario,
                turns: scenario.turns.slice(0, 1),
                isMultiTurn: false,
                turnCount: 1
            };
        });
    }

    /** 多轮对话：要求 turns[] 非空 */
    function normalizeMultiTurnScenarios(testCases) {
        if (!Array.isArray(testCases)) return [];
        return testCases.map((tc, i) => {
            if (!hasTurnsArray(tc)) {
                const id = tc && tc.id ? tc.id : `CASE-${i + 1}`;
                throw new Error(`用例 ${id} 缺少 turns[]，多轮对话模式需要至少一轮追问`);
            }
            const scenario = normalizeScenario(tc, i);
            return {
                ...scenario,
                isMultiTurn: scenario.turns.length > 1,
                turnCount: scenario.turns.length
            };
        });
    }

    function validateDatasetForMode(rawCases, mode) {
        const issues = [];
        if (!Array.isArray(rawCases)) return issues;
        rawCases.forEach((tc, i) => {
            const id = (tc && tc.id) || `CASE-${i + 1}`;
            if (mode === 'single' && hasTurnsArray(tc)) {
                issues.push(`用例 ${id} 包含 turns[]，单次模式将忽略多轮结构，仅使用 question 字段`);
            }
            if (mode === 'multi' && !hasTurnsArray(tc)) {
                issues.push(`用例 ${id} 缺少 turns[]，多轮模式无法执行`);
            }
        });
        return issues;
    }

    function buildTurnRequestBody(parsedCurl, turn, scenario, sessionState, injectionConfig) {
        const originalBody = typeof parsedCurl.body === 'object' && parsedCurl.body !== null
            ? deepClone(parsedCurl.body)
            : {};
        const body = originalBody && typeof originalBody === 'object' ? originalBody : {};

        const questionPath = resolveQuestionPath(body, injectionConfig.questionPath);
        const contextPath = normalizeContextPath(body, injectionConfig.contextPath);

        setPath(body, questionPath, turn.question);

        if (contextPath && sessionState && sessionState.conversationId != null && sessionState.conversationId !== '') {
            setPath(body, contextPath, sessionState.conversationId);
        }

        return body;
    }

    function createSessionState(parsedCurl, injectionConfig) {
        const body = typeof parsedCurl.body === 'object' && parsedCurl.body !== null
            ? parsedCurl.body
            : {};
        const contextPath = normalizeContextPath(body, injectionConfig.contextPath);
        const conversationId = contextPath ? getPath(body, contextPath) : undefined;
        return {
            conversationId: conversationId == null || conversationId === '' ? '' : String(conversationId),
            turnIndex: 0
        };
    }

    function extractTextFromJsonValue(value, parts) {
        if (value == null) return;
        if (typeof value === 'string') {
            if (value.trim()) parts.push(value);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(item => extractTextFromJsonValue(item, parts));
            return;
        }
        if (typeof value === 'object') {
            const preferredKeys = ['content', 'text', 'answer', 'message', 'delta', 'reasoning_content', 'output_text'];
            for (const key of preferredKeys) {
                if (key in value) extractTextFromJsonValue(value[key], parts);
            }
            if ('choices' in value && Array.isArray(value.choices)) {
                value.choices.forEach(choice => {
                    extractTextFromJsonValue(choice.delta || choice.message || choice, parts);
                });
            }
            if ('data' in value && value.data !== value) {
                extractTextFromJsonValue(value.data, parts);
            }
        }
    }

    function normalizeResponseContent(rawContent, headers) {
        const raw = String(rawContent || '');
        const contentType = (headers && (headers['content-type'] || headers['Content-Type'])) || '';
        const isSse = /text\/event-stream/i.test(contentType) || /(^|\n)data:\s*/.test(raw);

        if (!isSse) {
            return {
                content: raw,
                normalized_content: raw,
                content_length: raw.length
            };
        }

        const parts = [];
        for (const line of raw.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
                extractTextFromJsonValue(JSON.parse(payload), parts);
            } catch {
                if (payload) parts.push(payload);
            }
        }

        const normalized = parts.join('');
        return {
            content: raw,
            normalized_content: normalized || raw,
            content_length: (normalized || raw).length
        };
    }

    function parseResponsePayloads(rawContent) {
        const raw = String(rawContent || '');
        const payloads = [];
        try {
            payloads.push(JSON.parse(raw));
        } catch { /* not a full JSON response */ }

        for (const line of raw.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
                payloads.push(JSON.parse(payload));
            } catch { /* ignore non-JSON SSE payload */ }
        }
        return payloads;
    }

    function parseResponseEvents(rawContent) {
        const raw = String(rawContent || '');
        const events = [];
        let order = 0;
        try {
            events.push({ payload: JSON.parse(raw), order: order++ });
        } catch { /* not a full JSON response */ }

        for (const line of raw.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payloadText = trimmed.slice(5).trim();
            if (!payloadText || payloadText === '[DONE]') continue;
            try {
                events.push({ payload: JSON.parse(payloadText), order: order++ });
            } catch { /* ignore non-JSON SSE payload */ }
        }
        return events;
    }

    function isStepLike(value) {
        return !!(value && typeof value === 'object' && !Array.isArray(value) && (
            value.name || value.step || value.type || value.tool || value.tool_name ||
            value.toolName || value.function || value.duration_ms || value.durationMs ||
            value.elapsed_ms || value.status
        ));
    }

    function findTraceCandidates(value, candidates, depth, seen) {
        if (value == null || depth > 8) return;
        if (typeof value !== 'object') return;
        if (seen.has(value)) return;
        seen.add(value);

        if (Array.isArray(value)) {
            if (value.some(isStepLike)) {
                candidates.push({ value, source: 'array', defaultType: '' });
            }
            value.forEach(item => findTraceCandidates(item, candidates, depth + 1, seen));
            return;
        }

        const traceKeys = [
            ['trace', ''],
            ['steps', ''],
            ['tool_calls', 'tool'],
            ['toolCalls', 'tool'],
            ['events', 'event'],
            ['spans', 'span']
        ];
        traceKeys.forEach(([key, defaultType]) => {
            if (value[key] != null) {
                candidates.push({ value: value[key], source: key, defaultType });
            }
        });

        Object.values(value).forEach(child => findTraceCandidates(child, candidates, depth + 1, seen));
    }

    function readDurationMs(step) {
        const candidates = [
            step.duration_ms,
            step.durationMs,
            step.elapsed_ms,
            step.elapsedMs,
            step.latency_ms,
            step.latencyMs,
            step.time_ms,
            step.timeMs
        ];
        for (const value of candidates) {
            const n = Number(value);
            if (Number.isFinite(n)) return n;
        }
        const duration = Number(step.duration);
        if (Number.isFinite(duration)) return duration;
        const start = Date.parse(step.start_time || step.startTime || step.start);
        const end = Date.parse(step.end_time || step.endTime || step.end);
        if (Number.isFinite(start) && Number.isFinite(end) && end >= start) return end - start;
        return null;
    }

    function summarizeValue(value, limit) {
        if (value == null) return '';
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        return String(text || '').slice(0, limit || 240);
    }

    function extractEventTime(payload, fallbackOrder) {
        const rawTime = payload && (
            payload.created_at ||
            payload.createdAt ||
            payload.timestamp ||
            payload.time ||
            payload.ts
        );
        if (rawTime != null) {
            const parsedDate = Date.parse(rawTime);
            if (Number.isFinite(parsedDate)) return parsedDate;
            const numeric = Number(rawTime);
            if (Number.isFinite(numeric)) return numeric;
        }
        return fallbackOrder;
    }

    function extractRealToolChain(rawContent, headers) {
        const events = parseResponseEvents(rawContent, headers)
            .map(event => ({
                ...event,
                time: extractEventTime(event.payload, event.order)
            }));
        const starts = new Map();
        const ends = new Map();
        const idCounts = new Map();
        let reasoningEvents = 0;
        let intentEvents = 0;

        for (const event of events) {
            const payload = event.payload || {};
            if (/^reasoning/.test(String(payload.type || ''))) {
                reasoningEvents++;
                continue;
            }
            if (payload.type === 'tool_call_intent') {
                intentEvents++;
                continue;
            }
            if (payload.type !== 'tool_call' || !payload.toolCallId) continue;

            const id = String(payload.toolCallId);
            idCounts.set(id, (idCounts.get(id) || 0) + 1);
            const target = payload.phase === 'start' ? starts : payload.phase === 'end' ? ends : null;
            if (target) {
                if (!target.has(id)) target.set(id, []);
                target.get(id).push({ payload, order: event.order, time: event.time });
            }
        }

        const validCalls = [];
        for (const [id, startEvents] of starts.entries()) {
            const endEvents = ends.get(id) || [];
            if (startEvents.length !== 1 || endEvents.length !== 1) continue;
            const start = startEvents[0];
            const end = endEvents[0];
            const outputExists = Object.prototype.hasOwnProperty.call(end.payload, 'output') && end.payload.output != null;
            const latency = Number(end.payload.latencyMs != null ? end.payload.latencyMs : end.payload.latency_ms);
            if (end.payload.success !== true || !Number.isFinite(latency) || !outputExists) continue;
            validCalls.push({
                sortTime: Math.min(start.time, end.time),
                sortOrder: Math.min(start.order, end.order),
                start,
                end,
                latency
            });
        }

        validCalls.sort((a, b) => (a.sortTime - b.sortTime) || (a.sortOrder - b.sortOrder));

        const realToolChain = validCalls.map((call, index) => ({
            sequence: index + 1,
            tool_call_id: String(call.start.payload.toolCallId),
            tool_name: String(call.end.payload.name || call.start.payload.name || ''),
            request_params: summarizeValue(call.start.payload.input || call.start.payload.args || call.start.payload.arguments || {}, 1000),
            latency_ms: call.latency,
            execute_status: 'success',
            result_summary: summarizeValue(call.end.payload.output, 1000)
        }));

        return {
            filter_explain: `已过滤 ${reasoningEvents} 条 reasoning 类模型思考事件和 ${intentEvents} 条 tool_call_intent 意图事件；真实调用仅保留唯一 toolCallId 且同时存在 tool_call start/end、success=true、latencyMs 与 output 的成功执行记录。`,
            real_tool_chain: realToolChain
        };
    }

    function normalizeTraceStep(step, index, defaultType) {
        const fn = step && step.function;
        const name = step.name
            || step.step
            || step.tool
            || step.tool_name
            || step.toolName
            || (fn && (fn.name || fn.toolName))
            || step.event
            || step.action
            || `step_${index + 1}`;
        const type = step.type || defaultType || (step.tool || step.tool_name || step.toolName || fn ? 'tool' : 'step');
        const durationMs = readDurationMs(step);
        return {
            name: String(name),
            type: String(type || 'step'),
            status: String(step.status || step.state || step.result || ''),
            start_time: step.start_time || step.startTime || step.start || null,
            end_time: step.end_time || step.endTime || step.end || null,
            duration_ms: durationMs,
            input_summary: summarizeValue(step.input || step.args || step.arguments || step.params, 240),
            output_summary: summarizeValue(step.output || step.result_data || step.response || step.observation, 240),
            raw: step
        };
    }

    function extractTraceSteps(candidate) {
        const value = candidate && candidate.value;
        const defaultType = candidate && candidate.defaultType;
        if (!value) return [];
        if (Array.isArray(value)) {
            return value.filter(isStepLike).map((step, i) => normalizeTraceStep(step, i, defaultType));
        }
        if (typeof value !== 'object') return [];

        const arrays = [
            ['steps', ''],
            ['tool_calls', 'tool'],
            ['toolCalls', 'tool'],
            ['events', 'event'],
            ['spans', 'span']
        ];
        for (const [key, type] of arrays) {
            if (Array.isArray(value[key])) {
                return value[key].filter(isStepLike).map((step, i) => normalizeTraceStep(step, i, type));
            }
        }
        if (isStepLike(value)) {
            return [normalizeTraceStep(value, 0, defaultType)];
        }
        return [];
    }

    function summarizeTrace(trace) {
        const steps = (trace && Array.isArray(trace.steps)) ? trace.steps : [];
        const stepNames = steps.map(step => step.name).filter(Boolean);
        const tools = Array.from(new Set(steps
            .filter(step => /tool/i.test(step.type || '') || /tool|search|browser/i.test(step.name || ''))
            .map(step => step.name)
            .filter(Boolean)));
        const durations = steps
            .map(step => Number(step.duration_ms))
            .filter(n => Number.isFinite(n));
        const totalDurationMs = durations.length ? durations.reduce((sum, n) => sum + n, 0) : null;
        const failedSteps = steps.filter(step => /fail|error|exception/i.test(step.status || '')).length;
        return {
            stepNames,
            tools,
            totalDurationMs,
            failedSteps,
            stepCount: steps.length,
            traceHashSource: JSON.stringify(steps.map(step => ({
                name: step.name,
                type: step.type,
                status: step.status,
                duration_ms: step.duration_ms
            })))
        };
    }

    function normalizeTrace(rawContent, headers) {
        const realToolChain = extractRealToolChain(rawContent, headers);
        if (realToolChain.real_tool_chain.length > 0) {
            const steps = realToolChain.real_tool_chain.map(call => ({
                name: call.tool_name,
                type: 'tool',
                status: call.execute_status,
                start_time: null,
                end_time: null,
                duration_ms: call.latency_ms,
                input_summary: call.request_params,
                output_summary: call.result_summary,
                raw: call
            }));
            const trace = {
                found: true,
                steps,
                raw: realToolChain.real_tool_chain,
                real_tool_chain: realToolChain
            };
            trace.summary = summarizeTrace(trace);
            return trace;
        }

        const payloads = parseResponsePayloads(rawContent, headers);
        const candidates = [];
        payloads.forEach(payload => findTraceCandidates(payload, candidates, 0, new Set()));

        const steps = [];
        const rawCandidates = [];
        const seenStepKeys = new Set();
        for (const candidate of candidates) {
            const extracted = extractTraceSteps(candidate);
            if (extracted.length > 0) {
                rawCandidates.push(candidate.value);
                extracted.forEach(step => {
                    const key = JSON.stringify({
                        name: step.name,
                        status: step.status,
                        duration_ms: step.duration_ms,
                        input_summary: step.input_summary,
                        output_summary: step.output_summary,
                        raw: step.raw
                    });
                    if (!seenStepKeys.has(key)) {
                        seenStepKeys.add(key);
                        steps.push(step);
                    }
                });
            }
        }

        const trace = {
            found: steps.length > 0,
            steps,
            raw: rawCandidates.slice(0, 5)
        };
        trace.summary = summarizeTrace(trace);
        trace.real_tool_chain = realToolChain;
        return trace;
    }

    function includesByName(items, expectedName) {
        const target = String(expectedName || '').toLowerCase();
        return items.some(item => String(item || '').toLowerCase() === target);
    }

    function containsOrderedSequence(actualNames, expectedNames) {
        let cursor = 0;
        for (const actual of actualNames) {
            if (String(actual).toLowerCase() === String(expectedNames[cursor]).toLowerCase()) {
                cursor++;
                if (cursor >= expectedNames.length) return true;
            }
        }
        return expectedNames.length === 0;
    }

    function evaluateTraceExpectations(trace, expectedTrace) {
        const exp = expectedTrace || {};
        const checks = [];
        const summary = (trace && trace.summary) || summarizeTrace(trace);
        const tools = summary.tools || [];
        const stepNames = summary.stepNames || [];
        const steps = (trace && trace.steps) || [];

        if ((!trace || !trace.found) && Object.keys(exp).length > 0) {
            checks.push({
                name: 'Trace 数据存在',
                expected: '响应包含 trace 数据',
                actual: '未发现 trace 数据',
                passed: false
            });
            return checks;
        }

        (exp.required_tools || []).forEach(tool => {
            const passed = includesByName(tools, tool);
            checks.push({
                name: `Trace 必需工具: ${tool}`,
                expected: `包含工具 ${tool}`,
                actual: tools.length ? tools.join(', ') : '无工具调用',
                passed
            });
        });

        (exp.forbidden_tools || []).forEach(tool => {
            const passed = !includesByName(tools, tool);
            checks.push({
                name: `Trace 禁用工具: ${tool}`,
                expected: `不包含工具 ${tool}`,
                actual: tools.length ? tools.join(', ') : '无工具调用',
                passed
            });
        });

        if (Array.isArray(exp.required_steps) && exp.required_steps.length > 0) {
            const passed = containsOrderedSequence(stepNames, exp.required_steps);
            checks.push({
                name: 'Trace 步骤顺序',
                expected: exp.required_steps.join(' → '),
                actual: stepNames.length ? stepNames.join(' → ') : '无步骤',
                passed
            });
        }

        if (exp.max_total_time_ms != null) {
            const max = Number(exp.max_total_time_ms);
            const actual = Number(summary.totalDurationMs);
            const passed = Number.isFinite(actual) && actual <= max;
            checks.push({
                name: 'Trace 总耗时',
                expected: `<= ${max} ms`,
                actual: Number.isFinite(actual) ? `${actual} ms` : '未知',
                passed
            });
        }

        if (exp.max_tool_time_ms != null) {
            const max = Number(exp.max_tool_time_ms);
            const toolDurations = steps
                .filter(step => /tool/i.test(step.type || '') || includesByName(tools, step.name))
                .map(step => Number(step.duration_ms))
                .filter(Number.isFinite);
            const actual = toolDurations.length ? Math.max(...toolDurations) : null;
            const passed = actual != null && actual <= max;
            checks.push({
                name: 'Trace 单工具最大耗时',
                expected: `<= ${max} ms`,
                actual: actual != null ? `${actual} ms` : '无工具耗时',
                passed
            });
        }

        return checks;
    }

    function findConversationId(value) {
        if (value == null) return null;
        if (Array.isArray(value)) {
            for (const item of value) {
                const found = findConversationId(item);
                if (found) return found;
            }
            return null;
        }
        if (typeof value !== 'object') return null;

        const directKeys = [
            'conversationId',
            'conversation_id',
            'conversationID',
            'convId',
            'conv_id'
        ];
        for (const key of directKeys) {
            if (value[key] != null && String(value[key]).trim()) {
                return String(value[key]).trim();
            }
        }
        if (value.conversation && typeof value.conversation === 'object') {
            const nested = value.conversation.id || value.conversation.conversationId || value.conversation.conversation_id;
            if (nested != null && String(nested).trim()) return String(nested).trim();
        }
        for (const child of Object.values(value)) {
            const found = findConversationId(child);
            if (found) return found;
        }
        return null;
    }

    function extractConversationIdFromResponse(rawContent, headers) {
        const normalized = normalizeResponseContent(rawContent, headers).normalized_content;
        const sources = [String(rawContent || ''), normalized];
        for (const source of sources) {
            for (const line of source.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const payload = trimmed.slice(5).trim();
                if (!payload || payload === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(payload);
                    const id = findConversationId(parsed);
                    if (id) return String(id);
                } catch { /* ignore */ }
            }
            try {
                const parsed = JSON.parse(source);
                const id = findConversationId(parsed);
                if (id) return String(id);
            } catch { /* ignore */ }
        }
        return null;
    }

    function updateSessionStateFromResponse(sessionState, rawContent, headers) {
        const nextId = extractConversationIdFromResponse(rawContent, headers);
        if (nextId) sessionState.conversationId = nextId;
        return sessionState;
    }

    function getAssertionContent(result) {
        return (result && (result.normalized_content || result.content)) || '';
    }

    return {
        deepClone,
        parseFieldPath,
        hasPath,
        getPath,
        setPath,
        resolveQuestionPath,
        normalizeContextPath,
        isPlaceholderKnowledgeId,
        normalizeTurn,
        normalizeScenario,
        normalizeScenarios,
        hasTurnsArray,
        normalizeSingleTurnCases,
        normalizeMultiTurnScenarios,
        validateDatasetForMode,
        buildTurnRequestBody,
        createSessionState,
        normalizeResponseContent,
        normalizeTrace,
        summarizeTrace,
        extractRealToolChain,
        evaluateTraceExpectations,
        extractConversationIdFromResponse,
        updateSessionStateFromResponse,
        getAssertionContent,
        splitNaturalCaseItems,
        ensureExactCaseCount,
        normalizeTraceExpectation,
        inferTraceExpectationFromText,
        applyInferredTraceExpectations,
        defaultExpected
    };
}));

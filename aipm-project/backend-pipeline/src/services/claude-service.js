import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

let _client = null;
function getClient() {
  if (!_client) {
    const opts = { apiKey: config.anthropicApiKey };
    if (config.anthropicBaseUrl) opts.baseURL = config.anthropicBaseUrl;
    opts.timeout = 900000; // 15 min SDK-level timeout
    _client = new Anthropic(opts);
  }
  return _client;
}

/**
 * Strip markdown code fences from LLM output
 */
function stripCodeFences(text) {
  let cleaned = text;
  if (cleaned.startsWith('```html')) cleaned = cleaned.substring(7);
  else if (cleaned.startsWith('```HTML')) cleaned = cleaned.substring(7);
  else if (cleaned.startsWith('```markdown')) cleaned = cleaned.substring(12);
  else if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
  if (cleaned.trimEnd().endsWith('```')) cleaned = cleaned.trimEnd().slice(0, -3);
  return cleaned.trim();
}

/**
 * Call Claude/Kimi via raw fetch with SSE streaming.
 * Works around Node v24 ReadableStream encoding issues and proxy timeouts.
 */
export async function callClaude(systemPrompt, userMessage, options = {}) {
  if (config.useMock) return null;
  const timeoutMs = options.timeout || 600000;
  const maxTokens = options.maxTokens || 4096;

  const baseURL = config.anthropicBaseUrl || 'https://api.anthropic.com';
  const endpoint = `${baseURL.replace(/\/$/, '')}/v1/messages`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.claudeModel,
        max_tokens: maxTokens,
        stream: true,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API error ${res.status}: ${errText.substring(0, 200)}`);
    }

    // Parse SSE stream
    let fullText = '';
    let buffer = '';

    for await (const chunk of res.body) {
      let text;
      if (typeof chunk === 'string') {
        text = chunk;
      } else if (Buffer.isBuffer(chunk)) {
        text = chunk.toString('utf8');
      } else if (chunk instanceof Uint8Array) {
        text = Buffer.from(chunk).toString('utf8');
      } else {
        text = String(chunk);
      }

      buffer += text;
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const evt = JSON.parse(data);
              if (evt.type === 'content_block_delta' && evt.delta?.text) {
                fullText += evt.delta.text;
              }
            } catch {}
          }
        }
      }
    }

    return fullText;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Claude API 超时（${timeoutMs}ms）`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

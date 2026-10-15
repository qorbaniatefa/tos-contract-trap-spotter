import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGeminiProvider,
  DEFAULT_GEMINI_MODEL,
  GeminiError,
  geminiCandidateSchema,
} from '../src/analysis/gemini';

const chunk = {
  id: 0,
  text: 'Your subscription automatically renews each month until you cancel.',
  start: 0,
  end: 65,
};
const candidate = JSON.stringify({
  findings: [{ category: 'autoRenewal', quote: chunk.text, chunkId: 0 }],
});
afterEach(() => vi.unstubAllGlobals());
describe('Gemini server-only adapter', () => {
  it('uses a fixed Google endpoint, header-only credential, and structured JSON schema', async () => {
    const fakeFetch = vi.fn(async () =>
      Response.json({
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'text', text: candidate }],
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fakeFetch);
    const result = await createGeminiProvider({ apiKey: 'private-test-key' })(
      chunk,
      AbortSignal.timeout(1000),
    );
    expect(result).toBe(candidate);
    const [url, options] = fakeFetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
    );
    expect(url).not.toContain('private-test-key');
    expect((options.headers as Record<string, string>)['x-goog-api-key']).toBe(
      'private-test-key',
    );
    const body = JSON.parse(String(options.body));
    expect(body.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(body.response_format.mime_type).toBe('application/json');
    expect(body.response_format.schema).toEqual(geminiCandidateSchema);
    expect(body.store).toBe(false);
    expect(body.tools).toBeUndefined();
    expect(body.generation_config.tool_choice).toBeUndefined();
    expect(String(options.body)).not.toContain('private-test-key');
  });
  it.each([
    [400, 'invalidRequest'],
    [401, 'authentication'],
    [403, 'authentication'],
    [404, 'modelUnavailable'],
    [429, 'quotaExceeded'],
    [500, 'unavailable'],
    [503, 'unavailable'],
  ])('sanitizes HTTP %s and never retries', async (status, code) => {
    const fakeFetch = vi.fn(
      async () =>
        new Response('secret-bearing upstream error private-test-key', {
          status: Number(status),
          headers: { 'retry-after': '30' },
        }),
    );
    vi.stubGlobal('fetch', fakeFetch);
    const provider = createGeminiProvider({ apiKey: 'private-test-key' });
    const error = await provider(chunk, AbortSignal.timeout(1000)).catch(
      (value) => value,
    );
    expect(error).toBeInstanceOf(GeminiError);
    expect(error.code).toBe(code);
    expect(error.message).not.toContain('private-test-key');
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });
  it('rejects missing key, blocked/truncated output, network failures, and oversized data', async () => {
    const fakeFetch = vi.fn();
    vi.stubGlobal('fetch', fakeFetch);
    await expect(
      createGeminiProvider({ apiKey: '' })(chunk, AbortSignal.timeout(1000)),
    ).rejects.toMatchObject({ code: 'missingKey' });
    expect(fakeFetch).not.toHaveBeenCalled();
    for (const envelope of [
      { status: 'failed', steps: [] },
      {
        status: 'completed',
        steps: [{ type: 'function_call', name: 'exfiltrate' }],
      },
      {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [
              { type: 'text', text: candidate },
              { type: 'refusal', refusal: 'blocked' },
            ],
          },
        ],
      },
    ]) {
      fakeFetch.mockResolvedValue(Response.json(envelope));
      await expect(
        createGeminiProvider({ apiKey: 'key' })(
          chunk,
          AbortSignal.timeout(1000),
        ),
      ).rejects.toBeInstanceOf(GeminiError);
    }
    fakeFetch.mockRejectedValue(new Error('https://secret-key-in-message'));
    await expect(
      createGeminiProvider({ apiKey: 'key' })(chunk, AbortSignal.timeout(1000)),
    ).rejects.toMatchObject({ code: 'network' });
    fakeFetch.mockResolvedValue(new Response('x'.repeat(250001)));
    await expect(
      createGeminiProvider({ apiKey: 'key' })(chunk, AbortSignal.timeout(1000)),
    ).rejects.toMatchObject({ code: 'invalidResponse' });
  });
  it('classifies an invalid key in HTTP 400 without exposing upstream text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            error: {
              message: 'API key not valid. private-test-key',
              details: [{ reason: 'API_KEY_INVALID' }],
            },
          },
          { status: 400 },
        ),
      ),
    );
    await expect(
      createGeminiProvider({ apiKey: 'private-test-key' })(
        chunk,
        AbortSignal.timeout(1000),
      ),
    ).rejects.toMatchObject({ code: 'authentication', status: 400 });
  });
});

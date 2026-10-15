import { describe, expect, it } from 'vitest';
import { createService } from '../src/server/app';
import { makeSnapshot } from '../src/analysis/snapshot';

const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const token = 'a'.repeat(64);
const text =
  'Your subscription automatically renews each month until you cancel.';
const headers = {
  origin,
  host: '127.0.0.1:4318',
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
};

describe('local service boundaries', () => {
  it('requires auth and exact origin/host before any provider call', async () => {
    let calls = 0;
    const app = createService({
      token,
      origin,
      provider: async () => {
        calls++;
        return '{"findings":[]}';
      },
    });
    const payload = {
      snapshot: await makeSnapshot(
        text,
        'https://example.com',
        'Terms',
        'main',
      ),
    };
    for (const extra of [
      { authorization: '' },
      { origin: 'https://evil.invalid' },
      { host: 'evil.invalid:4318' },
    ]) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/analyze',
            headers: { ...headers, ...extra },
            payload,
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(calls).toBe(0);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/analyze',
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(200);
    await app.close();
  });
  it('rejects snapshot hash tampering and extraneous input', async () => {
    const app = createService({
      token,
      origin,
      provider: async () => '{"findings":[]}',
    });
    const source = await makeSnapshot(
      text,
      'https://example.com',
      'Terms',
      'main',
    );
    for (const payload of [
      { snapshot: { ...source, text: 'tampered' } },
      { snapshot: source, urlToFetch: 'https://evil.invalid' },
    ]) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/analyze',
            headers,
            payload,
          })
        ).statusCode,
      ).toBe(400);
    }
    await app.close();
  });
  it('enforces rate limits', async () => {
    const app = createService({
      token,
      origin,
      maxRequests: 1,
      provider: async () => '{"findings":[]}',
    });
    const payload = {
      snapshot: await makeSnapshot(
        text,
        'https://example.com',
        'Terms',
        'main',
      ),
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/analyze',
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/analyze',
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(429);
    await app.close();
  });
});

import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { analyze, type Provider } from '../analysis/pipeline';
import { hashText, type Snapshot } from '../analysis/snapshot';
import { snapshotSchema } from '../analysis/schema';

interface ServiceConfig {
  token: string;
  origin: string;
  provider: Provider;
  maxRequests?: number;
  mode?: 'live' | 'fixture';
}

export function createService(config: ServiceConfig) {
  if (
    !/^[a-z0-9]{32,128}$/i.test(config.token) ||
    !/^chrome-extension:\/\/[a-p]{32}$/.test(config.origin)
  )
    throw new Error('Valid pairing token and extension origin required');
  const app = Fastify({
    logger: false,
    bodyLimit: 900000,
    requestTimeout: 190000,
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: false,
        useDefaults: false,
      },
    },
  });
  let running = 0;
  const requests: number[] = [];
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (request.headers.host !== '127.0.0.1:4318' || origin !== config.origin)
      return reply.code(403).send({ error: 'forbidden' });
    reply
      .header('Access-Control-Allow-Origin', config.origin)
      .header('Vary', 'Origin');
    if (request.method === 'OPTIONS') {
      return reply
        .header('Access-Control-Allow-Methods', 'POST')
        .header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        .code(204)
        .send();
    }
    const incoming = Buffer.from(request.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${config.token}`);
    if (
      incoming.length !== expected.length ||
      !timingSafeEqual(incoming, expected)
    )
      return reply.code(403).send({ error: 'forbidden' });
    if (request.headers['content-type']?.split(';')[0] !== 'application/json')
      return reply.code(415).send({ error: 'jsonRequired' });
  });
  app.post<{ Body: { snapshot: Snapshot } }>(
    '/v1/analyze',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['snapshot'],
          properties: { snapshot: snapshotSchema },
        },
      },
    },
    async (request, reply) => {
      const source = request.body.snapshot;
      let url: URL;
      try {
        url = new URL(source.url);
      } catch {
        return reply.code(400).send({ error: 'invalidSource' });
      }
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.search ||
        url.hash ||
        url.username ||
        url.password ||
        !source.text.trim() ||
        (await hashText(source.text)) !== source.hash
      )
        return reply.code(400).send({ error: 'invalidSource' });
      const now = Date.now();
      while (requests.length && requests[0] < now - 60000) requests.shift();
      if (requests.length >= (config.maxRequests ?? 10) || running >= 1)
        return reply.code(429).send({ error: 'rateLimited' });
      requests.push(now);
      running++;
      const controller = new AbortController();
      const abort = () => {
        if (!reply.raw.writableFinished) controller.abort();
      };
      reply.raw.on('close', abort);
      try {
        return await analyze(
          source,
          config.provider,
          config.mode ?? 'live',
          controller.signal,
        );
      } finally {
        running--;
        reply.raw.removeListener('close', abort);
      }
    },
  );
  app.setErrorHandler((_error, _request, reply) => {
    reply.code(400).send({ error: 'invalidRequest' });
  });
  return app;
}

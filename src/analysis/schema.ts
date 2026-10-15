import { categories } from './rules';

const string = (maxLength: number, minLength = 1) => ({
  type: 'string',
  minLength,
  maxLength,
});
export const snapshotSchema = {
  $id: 'snapshot',
  type: 'object',
  additionalProperties: false,
  required: [
    'text',
    'url',
    'title',
    'capturedAt',
    'region',
    'hash',
    'warnings',
  ],
  properties: {
    text: string(200000),
    url: string(4096),
    title: string(300, 0),
    capturedAt: string(40),
    region: { enum: ['selection', 'main', 'body', 'eval'] },
    hash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    warnings: { type: 'array', maxItems: 20, items: string(80) },
  },
};
export const candidateSchema = {
  $id: 'candidate',
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      maxItems: 60,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'quote', 'chunkId'],
        properties: {
          category: { enum: categories },
          quote: string(6000, 20),
          chunkId: { type: 'integer', minimum: 0, maximum: 11 },
        },
      },
    },
  },
};
export const reportSchema = {
  $id: 'report',
  type: 'object',
  additionalProperties: false,
  required: [
    'version',
    'snapshotHash',
    'status',
    'score',
    'coverage',
    'processed',
    'total',
    'rejected',
    'findings',
    'warnings',
    'providerMode',
  ],
  properties: {
    version: { const: '1.0' },
    snapshotHash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    status: { enum: ['complete', 'partial', 'inconclusive', 'error'] },
    score: {
      anyOf: [{ type: 'integer', minimum: 0, maximum: 100 }, { type: 'null' }],
    },
    coverage: { type: 'number', minimum: 0, maximum: 1 },
    processed: { type: 'integer', minimum: 0, maximum: 12 },
    total: { type: 'integer', minimum: 1, maximum: 12 },
    rejected: { type: 'integer', minimum: 0, maximum: 720 },
    providerMode: { enum: ['live', 'fixture'] },
    warnings: { type: 'array', maxItems: 100, items: string(100) },
    findings: {
      type: 'array',
      maxItems: 720,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'category',
          'quote',
          'start',
          'end',
          'title',
          'explanation',
          'weight',
        ],
        properties: {
          category: { enum: categories },
          quote: string(6000, 20),
          start: { type: 'integer', minimum: 0, maximum: 200000 },
          end: { type: 'integer', minimum: 1, maximum: 200000 },
          title: string(100),
          explanation: string(600),
          weight: { type: 'integer', minimum: 5, maximum: 15 },
        },
      },
    },
  },
};

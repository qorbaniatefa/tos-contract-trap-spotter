import { candidateSchema } from './schema';
import { systemPrompt } from './provider';
import type { Provider } from './pipeline';

// Verified against Google's official model/pricing/structured-output docs on 2026-10-15.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/interactions';
export type GeminiErrorCode =
  | 'missingKey'
  | 'authentication'
  | 'quotaExceeded'
  | 'modelUnavailable'
  | 'invalidRequest'
  | 'unavailable'
  | 'network'
  | 'timeout'
  | 'invalidResponse'
  | 'blocked';
export class GeminiError extends Error {
  constructor(
    public readonly code: GeminiErrorCode,
    public readonly status?: number,
    public readonly diagnostic?: string,
  ) {
    super(`Gemini request failed: ${code}`);
    this.name = 'GeminiError';
  }
}

function supportedSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(supportedSchema);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            ![
              '$id',
              'minLength',
              'maxLength',
              'minItems',
              'maxItems',
              'minimum',
              'maximum',
              'additionalProperties',
            ].includes(key),
        )
        .map(([key, entry]) => [key, supportedSchema(entry)]),
    );
  return value;
}
// Google supports a JSON Schema subset. All stricter constraints remain mandatory
// in Ajv after generation; none are removed from the committed local schema.
export const geminiCandidateSchema = supportedSchema(candidateSchema);

async function readEnvelope(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new GeminiError('invalidResponse');
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 250000) throw new GeminiError('invalidResponse');
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch (error) {
    if (error instanceof GeminiError) throw error;
    throw new GeminiError('invalidResponse');
  } finally {
    await reader.cancel();
  }
}

export function createGeminiProvider(config: {
  apiKey: string;
  model?: string;
}): Provider {
  const model = config.model || DEFAULT_GEMINI_MODEL;
  if (!/^gemini-[a-z0-9.-]+$/.test(model))
    throw new GeminiError('invalidRequest');
  return async (chunk, signal) => {
    if (!config.apiKey.trim()) throw new GeminiError('missingKey');
    try {
      signal.throwIfAborted();
      const response = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.apiKey,
        },
        body: JSON.stringify({
          model,
          store: false,
          system_instruction: systemPrompt,
          input: JSON.stringify({
            chunkId: chunk.id,
            untrustedPageText: chunk.text,
          }),
          generation_config: {
            max_output_tokens: 6000,
            thinking_summaries: 'none',
          },
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: geminiCandidateSchema,
          },
        }),
      });
      if (!response.ok) {
        const errorData = await readEnvelope(response).catch(() => null);
        const internalText = JSON.stringify(errorData);
        const badKey =
          /API_KEY_INVALID|API key not valid|API key expired|API_KEY_EXPIRED/i.test(
            internalText,
          );
        const unknownField = [
          'store',
          'system_instruction',
          'response_format',
          'generation_config',
          'max_output_tokens',
          'thinking_summaries',
          'tool_choice',
          'additionalProperties',
        ].find(
          (field) =>
            internalText.includes(`Unknown name \\"${field}\\"`) ||
            internalText.includes(`Unknown name "${field}"`),
        );
        const code: GeminiErrorCode =
          badKey || response.status === 401 || response.status === 403
            ? 'authentication'
            : response.status === 429
              ? 'quotaExceeded'
              : response.status === 404
                ? 'modelUnavailable'
                : response.status >= 500
                  ? 'unavailable'
                  : 'invalidRequest';
        // Do not copy upstream bodies, URL query strings, headers or error causes.
        const markers = [
          'unknown',
          'schema',
          'model',
          'billing',
          'quota',
          'generation_config',
          'response_format',
          'tool_choice',
          'thinking_summaries',
          'store',
          'not supported',
          'not found',
          'invalid argument',
        ].filter((marker) => internalText.toLowerCase().includes(marker));
        throw new GeminiError(
          code,
          response.status,
          unknownField
            ? `unsupportedField:${unknownField}`
            : markers.join(',') || undefined,
        );
      }
      const envelope = (await readEnvelope(response)) as {
        status?: string;
        steps?: {
          type?: string;
          content?: { type?: string; text?: string }[];
        }[];
      };
      if (envelope.status !== 'completed' || !Array.isArray(envelope.steps))
        throw new GeminiError('blocked');
      const outputs = envelope.steps.filter(
        (step) => step.type === 'model_output',
      );
      if (
        envelope.steps.some(
          (step) => !['model_output', 'thought'].includes(step.type ?? ''),
        ) ||
        outputs.length !== 1 ||
        !Array.isArray(outputs[0].content)
      )
        throw new GeminiError('invalidResponse');
      const content = outputs[0].content;
      if (
        !content.length ||
        content.some(
          (part) => part.type !== 'text' || typeof part.text !== 'string',
        )
      )
        throw new GeminiError('blocked');
      const text = content.map((part) => part.text).join('');
      if (!text || text.length > 100000)
        throw new GeminiError('invalidResponse');
      return text;
    } catch (error) {
      if (error instanceof GeminiError) throw error;
      throw new GeminiError(signal.aborted ? 'timeout' : 'network');
    }
  };
}

import { config } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  createGeminiProvider,
  DEFAULT_GEMINI_MODEL,
  GeminiError,
} from '../src/analysis/gemini';
import { analyze, chunkText, validateReport } from '../src/analysis/pipeline';
import { candidateValid } from '../src/analysis/validators';
import { makeSnapshot } from '../src/analysis/snapshot';

config({ quiet: true });
const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
const apiKey = process.env.GEMINI_API_KEY || '';
const checks: Record<string, boolean> = {};
let requestsSucceeded = 0;
let status = 'pendingKey';
let failure: string | undefined;
let httpStatus: number | undefined;
let diagnostic: string | undefined;
if (apiKey.trim()) {
  try {
    const text =
      'Your subscription automatically renews each month until you cancel.';
    const source = await makeSnapshot(
      text,
      'https://example.invalid/live-verification',
      'Gemini live verification',
      'main',
    );
    const provider = createGeminiProvider({ apiKey, model });
    const raw = await provider(chunkText(text)[0], AbortSignal.timeout(45000));
    requestsSucceeded++;
    checks.connectivity = true;
    const candidate: unknown = JSON.parse(raw);
    checks.structuredJson = candidateValid(candidate) as boolean;
    const report = await analyze(source, async () => raw);
    checks.sourceQuotation =
      validateReport(report, source) &&
      report.findings.some(
        (finding) =>
          finding.category === 'autoRenewal' &&
          source.text.slice(finding.start, finding.end) === finding.quote,
      );
    checks.deterministicScore =
      report.status === 'complete' && report.score === 10;
    const forged = await analyze(source, async () =>
      JSON.stringify({
        findings: [
          {
            category: 'autoRenewal',
            quote: 'This invented clause is not in the policy.',
            chunkId: 0,
          },
        ],
      }),
    );
    checks.mismatchedQuoteRejected =
      forged.findings.length === 0 &&
      forged.score === null &&
      forged.rejected === 1;
    const invalidJson = await analyze(source, async () => 'not JSON');
    checks.malformedJsonRejected =
      invalidJson.status === 'inconclusive' && invalidJson.score === null;
    const missing = await createGeminiProvider({ apiKey: '', model })(
      chunkText(text)[0],
      AbortSignal.timeout(1000),
    ).catch((error: unknown) => error);
    checks.missingKeyHandled =
      missing instanceof GeminiError && missing.code === 'missingKey';
    // Actual HTTP authentication failure, using a deliberately invalid NON-secret.
    const invalid = await createGeminiProvider({
      apiKey: 'invalid-key-negative-verification',
      model,
    })(chunkText(text)[0], AbortSignal.timeout(15000)).catch(
      (error: unknown) => error,
    );
    checks.liveAuthenticationError =
      invalid instanceof GeminiError &&
      ['authentication', 'invalidRequest'].includes(invalid.code) &&
      [400, 401, 403].includes(invalid.status ?? 0);
    status = Object.values(checks).every(Boolean) ? 'passed' : 'failed';
  } catch (error) {
    status = 'failed';
    failure = error instanceof GeminiError ? error.code : 'validationFailed';
    httpStatus = error instanceof GeminiError ? error.status : undefined;
    diagnostic = error instanceof GeminiError ? error.diagnostic : undefined;
  }
}
await mkdir('artifacts', { recursive: true });
const result = {
  checkedAt: new Date().toISOString(),
  status,
  model,
  requestsSucceeded,
  checks,
  ...(failure ? { failure, httpStatus, diagnostic } : {}),
  note: 'This connectivity/validation smoke test is not the five-policy live evaluation. HTTP 429/5xx/abort behavior is additionally covered by unit tests.',
};
await writeFile(
  'artifacts/gemini-verification.json',
  JSON.stringify(result, null, 2) + '\n',
);
console.log(JSON.stringify(result, null, 2));
if (status !== 'passed') {
  console.log(
    status === 'pendingKey'
      ? 'Set GEMINI_API_KEY in the ignored .env file locally, then rerun npm.cmd run verify:gemini. No live request was made.'
      : 'Verification did not fully pass. Inspect only the sanitized status above; no automatic retry or model switch occurred.',
  );
  process.exitCode = 1;
}

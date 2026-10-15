import { config } from 'dotenv';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  createGeminiProvider,
  DEFAULT_GEMINI_MODEL,
} from '../src/analysis/gemini';
import { analyze } from '../src/analysis/pipeline';
import { hashText, makeSnapshot } from '../src/analysis/snapshot';
import { evaluateFindings, type Annotation } from './metrics';
import { promptVersion } from '../src/analysis/provider';

config({ quiet: true });
await mkdir('eval/results', { recursive: true });
const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
const key = process.env.GEMINI_API_KEY || '';
if (!key) {
  await writeFile(
    'eval/results/status.json',
    JSON.stringify(
      { status: 'pendingKey', model, successfulApiRequests: 0 },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'Live evaluation pending: set GEMINI_API_KEY in the ignored .env locally. No metrics fabricated.',
  );
  process.exitCode = 1;
} else {
  const provider = createGeminiProvider({ apiKey: key, model });
  const results = [];
  let successfulApiRequests = 0;
  let attemptedApiRequests = 0;
  for (const id of ['spotify', 'google', 'dropbox', 'github', 'mozilla']) {
    const data = JSON.parse(
      await readFile(`eval/annotations/${id}.json`, 'utf8'),
    ) as {
      text: string;
      hash: string;
      sourceUrl: string;
      sourceHash: string;
      annotations: Annotation[];
      scope: string;
    };
    if (
      (await hashText(data.text)) !== data.hash ||
      data.annotations.some(
        (annotation) =>
          data.text.slice(annotation.start, annotation.end) !==
          annotation.quote,
      )
    )
      throw new Error('Frozen annotation validation failed');
    const source = await makeSnapshot(data.text, data.sourceUrl, id, 'eval');
    const started = Date.now();
    const report = await analyze(source, async (chunk, signal) => {
      attemptedApiRequests++;
      const raw = await provider(chunk, signal);
      successfulApiRequests++;
      return raw;
    });
    const metrics = evaluateFindings(report.findings, data.annotations);
    results.push({
      id,
      scope: data.scope,
      sourceHash: data.sourceHash,
      excerptHash: data.hash,
      report,
      metrics,
      elapsedMs: Date.now() - started,
    });
    console.log(
      `${id}: ${report.status}, TP=${metrics.tp}, FP=${metrics.fp}, FN=${metrics.fn}, coverage=${Math.round(report.coverage * 100)}%`,
    );
    // Free-tier-friendly spacing, not a retry. Failed calls are recorded as failures.
    if (id !== 'mozilla')
      await new Promise((resolve) => setTimeout(resolve, 15000));
  }
  const tp = results.reduce((sum, row) => sum + row.metrics.tp, 0);
  const fp = results.reduce((sum, row) => sum + row.metrics.fp, 0);
  const fn = results.reduce((sum, row) => sum + row.metrics.fn, 0);
  const status =
    results.every((row) => row.report.status === 'complete') &&
    successfulApiRequests > 0
      ? 'complete'
      : 'partial';
  const output = {
    status,
    evaluatedAt: new Date().toISOString(),
    provider: 'Google Gemini',
    model,
    promptVersion,
    ruleVersion: '1.0',
    attemptedApiRequests,
    successfulApiRequests,
    tp,
    fp,
    fn,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
    results,
  };
  await writeFile(
    'eval/results/live.json',
    JSON.stringify(output, null, 2) + '\n',
  );
  await writeFile(
    'eval/results/status.json',
    JSON.stringify(
      { status, model, attemptedApiRequests, successfulApiRequests },
      null,
      2,
    ) + '\n',
  );
  const rows = results
    .map(
      (row) =>
        `| ${row.id} | ${row.report.status} | ${row.metrics.tp} | ${row.metrics.fn} | ${row.metrics.fp} | ${Math.round(row.report.coverage * 100)}% |`,
    )
    .join('\n');
  await writeFile(
    'eval/RESULTS.md',
    `# Live Gemini mini evaluation\n\nRun: ${output.evaluatedAt}. Model: ${model}. Status: ${status}. Actual successful API requests: ${successfulApiRequests}/${attemptedApiRequests}.\n\nSelected original paragraphs from five real policies; not full-policy legal validation. Gold annotations were frozen before model requests and were reviewed by the assistant, not a legal expert.\n\n| Source | Analysis | Detected (TP) | Missed (FN) | False alarms (FP) | Processed capture |\n|---|---|---:|---:|---:|---:|\n${rows}\n\nAggregate TP=${tp}, FN=${fn}, FP=${fp}; precision=${output.precision?.toFixed(3) ?? 'undefined'}, recall=${output.recall?.toFixed(3) ?? 'undefined'}. Ambiguous labels are excluded from scored matching and listed separately. Missing output and rejected candidates remain visible in live.json.\n\nThe full accepted quotations, detected/missed annotations and false alarms are in eval/results/live.json. Metrics include failures; a partial analysis does not become a safe contract. Do not tune the frozen set after viewing these results.\n`,
  );
  if (status !== 'complete') process.exitCode = 1;
}

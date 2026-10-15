import { rules, supports, type Category } from './rules';
import { candidateValid, reportValid } from './validators';
import type { Snapshot } from './snapshot';

export interface Chunk {
  id: number;
  text: string;
  start: number;
  end: number;
}
export type Provider = (chunk: Chunk, signal: AbortSignal) => Promise<string>;
export interface Finding {
  category: Category;
  quote: string;
  start: number;
  end: number;
  title: string;
  explanation: string;
  weight: number;
}
export interface Report {
  version: '1.0';
  snapshotHash: string;
  status: 'complete' | 'partial' | 'inconclusive' | 'error';
  score: number | null;
  coverage: number;
  processed: number;
  total: number;
  rejected: number;
  findings: Finding[];
  warnings: string[];
  providerMode: 'live' | 'fixture';
}

export function chunkText(text: string): Chunk[] {
  if (!text.trim() || text.length > 200000)
    throw new Error('Unsupported source length');
  const chunks: Chunk[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + 20000, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf('\n\n', end - 2);
      // At least 17k progress after overlap guarantees <=12 chunks for 200k.
      if (boundary > start + 18000) end = boundary + 2;
    }
    chunks.push({
      id: chunks.length,
      start,
      end,
      text: text.slice(start, end),
    });
    if (end === text.length) break;
    const boundary = text.indexOf('\n\n', end - 1000);
    start =
      boundary >= end - 1000 && boundary < end - 2 ? boundary + 2 : end - 1000;
  }
  return chunks;
}

function normalized(text: string) {
  let value = '';
  const starts: number[] = [];
  const ends: number[] = [];
  for (let index = 0; index < text.length; index++) {
    if (/\s/.test(text[index])) {
      const start = index;
      while (index + 1 < text.length && /\s/.test(text[index + 1])) index++;
      value += ' ';
      starts.push(start);
      ends.push(index + 1);
    } else {
      value += text[index];
      starts.push(index);
      ends.push(index + 1);
    }
  }
  return { value, starts, ends };
}

export function findEvidence(
  snapshot: Snapshot,
  chunk: Chunk,
  quote: string,
): { start: number; end: number; quote: string } | null {
  const source = normalized(chunk.text);
  const needle = quote.replace(/\s+/g, ' ').trim();
  const index = source.value.indexOf(needle);
  if (index < 0 || source.value.indexOf(needle, index + 1) >= 0) return null;
  const start = chunk.start + source.starts[index];
  const end = chunk.start + source.ends[index + needle.length - 1];
  // A complete paragraph preserves qualifications; no arbitrary clause fragments.
  const paragraphStart = snapshot.text.lastIndexOf('\n\n', start - 1) + 2;
  const next = snapshot.text.indexOf('\n\n', end);
  const before = snapshot.text.slice(
    Math.max(0, paragraphStart === 1 ? 0 : paragraphStart),
    start,
  );
  const after = snapshot.text.slice(
    end,
    next < 0 ? snapshot.text.length : next,
  );
  if (before.trim() || after.trim()) return null;
  return { start, end, quote: snapshot.text.slice(start, end) };
}

function score(findings: Finding[]) {
  return [...new Set(findings.map((finding) => finding.category))].reduce(
    (sum, category) => sum + rules[category].weight,
    0,
  );
}

function intervalCoverage(intervals: Chunk[], length: number) {
  let covered = 0;
  let end = 0;
  for (const interval of [...intervals].sort((a, b) => a.start - b.start)) {
    covered += Math.max(0, interval.end - Math.max(end, interval.start));
    end = Math.max(end, interval.end);
  }
  return covered / length;
}

export async function analyze(
  snapshot: Snapshot,
  provider: Provider,
  mode: 'live' | 'fixture' = 'live',
  signal?: AbortSignal,
): Promise<Report> {
  const chunks = chunkText(snapshot.text);
  const findings: Finding[] = [];
  const processed: Chunk[] = [];
  const warnings = new Set(snapshot.warnings);
  let rejected = 0;
  let failed = 0;
  const deadline = AbortSignal.timeout(180000);
  if (
    /ignore (?:all |previous )?instructions|system prompt|send secrets|önceki talimat|talimatları yok say/i.test(
      snapshot.text,
    )
  )
    warnings.add('instructionLikeText');
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(2, chunks.length) }, async () => {
      while (cursor < chunks.length) {
        const chunk = chunks[cursor++];
        const combined = AbortSignal.any([
          deadline,
          AbortSignal.timeout(45000),
          ...(signal ? [signal] : []),
        ]);
        try {
          combined.throwIfAborted();
          const raw = await new Promise<string>((resolve, reject) => {
            const abort = () => reject(new Error('timeout'));
            combined.addEventListener('abort', abort, { once: true });
            provider(chunk, combined)
              .then(resolve, reject)
              .finally(() => combined.removeEventListener('abort', abort));
          });
          if (raw.length > 100000) throw new Error('responseSize');
          let value: unknown;
          try {
            value = JSON.parse(raw);
          } catch {
            warnings.add('invalidJson');
            failed++;
            continue;
          }
          if (!candidateValid(value)) {
            warnings.add('invalidSchema');
            failed++;
            continue;
          }
          processed.push(chunk);
          const candidates = value as {
            findings: { category: Category; quote: string; chunkId: number }[];
          };
          for (const candidate of candidates.findings) {
            const evidence =
              candidate.chunkId === chunk.id
                ? findEvidence(snapshot, chunk, candidate.quote)
                : null;
            if (!evidence || !supports(candidate.category, evidence.quote)) {
              rejected++;
              warnings.add('unsupportedCandidate');
              continue;
            }
            if (
              findings.some(
                (item) =>
                  item.category === candidate.category &&
                  item.start === evidence.start &&
                  item.end === evidence.end,
              )
            )
              continue;
            const rule = rules[candidate.category];
            findings.push({
              category: candidate.category,
              ...evidence,
              title: rule.title,
              explanation: rule.explanation,
              weight: rule.weight,
            });
          }
        } catch (error) {
          failed++;
          warnings.add('providerFailure');
          const code =
            error && typeof error === 'object' && 'code' in error
              ? String(error.code)
              : '';
          if (
            [
              'missingKey',
              'authentication',
              'quotaExceeded',
              'modelUnavailable',
              'invalidRequest',
              'unavailable',
              'network',
              'timeout',
              'invalidResponse',
              'blocked',
            ].includes(code)
          )
            warnings.add(code);
        }
      }
    }),
  );
  const coverage = intervalCoverage(processed, snapshot.text.length);
  const uncertain = failed > 0 || rejected > 0;
  const status =
    processed.length === 0
      ? warnings.has('invalidJson') || warnings.has('invalidSchema')
        ? 'inconclusive'
        : 'error'
      : uncertain
        ? findings.length
          ? 'partial'
          : 'inconclusive'
        : 'complete';
  return {
    version: '1.0',
    snapshotHash: snapshot.hash,
    status,
    score:
      status === 'error' || status === 'inconclusive' ? null : score(findings),
    coverage,
    processed: processed.length,
    total: chunks.length,
    rejected,
    findings: findings.sort(
      (a, b) => a.start - b.start || a.category.localeCompare(b.category),
    ),
    warnings: [...warnings],
    providerMode: mode,
  };
}

export function validateReport(
  value: unknown,
  snapshot: Snapshot,
): value is Report {
  if (!reportValid(value)) return false;
  const report = value as unknown as Report;
  if (
    report.snapshotHash !== snapshot.hash ||
    report.total !== chunkText(snapshot.text).length ||
    report.processed > report.total
  )
    return false;
  if (
    (report.status === 'error' || report.status === 'inconclusive') !==
    (report.score === null)
  )
    return false;
  if (report.score !== null && report.score !== score(report.findings))
    return false;
  if (
    report.status === 'complete' &&
    (report.rejected > 0 ||
      report.coverage !== 1 ||
      report.processed !== report.total)
  )
    return false;
  const seen = new Set<string>();
  return report.findings.every((finding) => {
    const rule = rules[finding.category];
    const key = `${finding.category}:${finding.start}:${finding.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const evidence = findEvidence(
      snapshot,
      {
        id: 0,
        text: snapshot.text.slice(finding.start, finding.end),
        start: finding.start,
        end: finding.end,
      },
      finding.quote,
    );
    return (
      !!evidence &&
      snapshot.text.slice(finding.start, finding.end) === finding.quote &&
      supports(finding.category, finding.quote) &&
      finding.weight === rule.weight &&
      finding.title === rule.title &&
      finding.explanation === rule.explanation
    );
  });
}

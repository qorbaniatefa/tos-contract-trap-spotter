import type { Finding } from '../src/analysis/pipeline';
import type { Category } from '../src/analysis/rules';

export interface Annotation {
  label: 'positive' | 'negative' | 'ambiguous';
  category: Category | null;
  start: number;
  end: number;
  quote?: string;
  note?: string;
}
export function evaluateFindings(
  findings: Finding[],
  annotations: Annotation[],
) {
  const overlaps = (finding: Finding, annotation: Annotation) =>
    finding.category === annotation.category &&
    finding.start < annotation.end &&
    finding.end > annotation.start;
  const ignored = findings.filter((finding) =>
    annotations.some(
      (annotation) =>
        annotation.label === 'ambiguous' && overlaps(finding, annotation),
    ),
  );
  const scored = findings.filter((finding) => !ignored.includes(finding));
  const positives = annotations.filter(
    (annotation) => annotation.label === 'positive',
  );
  const owners = new Map<number, number>();
  function match(index: number, seen: Set<number>): boolean {
    for (let gold = 0; gold < positives.length; gold++) {
      if (seen.has(gold) || !overlaps(scored[index], positives[gold])) continue;
      seen.add(gold);
      const owner = owners.get(gold);
      if (owner === undefined || match(owner, seen)) {
        owners.set(gold, index);
        return true;
      }
    }
    return false;
  }
  scored.forEach((_, index) => match(index, new Set()));
  const matched = new Set(owners.values());
  const detected = [...owners.keys()].map((index) => positives[index]);
  const missed = positives.filter((_, index) => !owners.has(index));
  const falseAlarms = scored.filter((_, index) => !matched.has(index));
  const tp = detected.length;
  const fp = falseAlarms.length;
  const fn = missed.length;
  return {
    tp,
    fp,
    fn,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
    detected,
    missed,
    falseAlarms,
    ambiguousFindings: ignored,
  };
}

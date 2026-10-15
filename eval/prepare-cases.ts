import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { hashText } from '../src/analysis/snapshot';
import type { Annotation } from './metrics';

// These anchors were chosen by reading the real texts before running the model.
// Selected paragraphs are preserved verbatim, including exceptions and negatives.
const selections: Record<
  string,
  {
    anchor: string;
    category: Annotation['category'];
    label: Annotation['label'];
    note: string;
  }[]
> = {
  spotify: [
    {
      anchor: 'CERTAIN PAID SUBSCRIPTIONS CONTINUE INDEFINITELY',
      category: 'autoRenewal',
      label: 'positive',
      note: 'Recurring billing until cancellation; implied renewal, not necessarily the exact trigger phrase.',
    },
    {
      anchor: 'We reserve the right to modify the features',
      category: 'unilateralChange',
      label: 'positive',
      note: 'Provider reserves modification authority.',
    },
    {
      anchor: 'H. Note; If you are a holder',
      category: 'refundRestriction',
      label: 'positive',
      note: 'No refund on this specific plan change; retain the scope.',
    },
    {
      anchor: "For some Trials, we'll require",
      category: 'trialConversion',
      label: 'positive',
      note: 'Trial may charge automatically unless cancelled.',
    },
    {
      anchor: 'You may cancel your Paid Subscription at any time',
      category: 'cancellationRestriction',
      label: 'negative',
      note: 'Cancellation at any time; end-of-period effect alone is not an additional cancellation hurdle.',
    },
    {
      anchor: 'Paid Subscriptions, as defined',
      category: 'arbitration',
      label: 'ambiguous',
      note: 'Incorporates a separate arbitration agreement; its terms are not captured here.',
    },
  ],
  google: [
    {
      anchor: 'Ayarlarınıza bağlı olarak size ilgi alanlarınıza',
      category: 'advertisingProfiling',
      label: 'positive',
      note: 'Personalized ads conditional on settings; preserve the controls.',
    },
    {
      anchor: 'Irk, din, cinsel yönelim',
      category: 'advertisingProfiling',
      label: 'negative',
      note: 'Explicit prohibition for sensitive categories; must not reverse its meaning.',
    },
    {
      anchor: 'Kimlik bilgileri dışındaki bilgileri herkese açık',
      category: 'thirdPartySharing',
      label: 'positive',
      note: 'Sharing non-identifying information with partners; explanation must not claim identity is shared.',
    },
    {
      anchor: 'Kişisel bilgileriniz gibi bazı verileri',
      category: 'retention',
      label: 'ambiguous',
      note: 'Mixed retention windows and deletion conditions; inspect original context.',
    },
    {
      anchor: 'Google başka bir şirketle birleşme',
      category: 'thirdPartySharing',
      label: 'positive',
      note: 'Possible transfer during merger/acquisition, subject to notice.',
    },
  ],
  dropbox: [
    {
      anchor: 'Billing.',
      category: 'autoRenewal',
      label: 'positive',
      note: 'Automatic billing on periodic renewal until cancellation, with local-law qualification.',
    },
    {
      anchor: 'Cancellation.',
      category: 'refundRestriction',
      label: 'positive',
      note: 'Refunds only when legally required; EU example must remain visible.',
    },
    {
      anchor: 'Changes.',
      category: 'unilateralChange',
      label: 'positive',
      note: 'Fee changes on renewal with prior notice.',
    },
    {
      anchor: 'We Both Agree to Arbitrate.',
      category: 'arbitration',
      label: 'positive',
      note: 'Binding individual arbitration with separately described exceptions.',
    },
    {
      anchor: 'NO CLASS OR REPRESENTATIVE ACTIONS.',
      category: 'classActionWaiver',
      label: 'positive',
      note: 'Class/representative dispute proceedings restricted.',
    },
    {
      anchor: 'Opt out of Agreement to Arbitrate.',
      category: 'arbitration',
      label: 'negative',
      note: 'This paragraph describes opt-out, not a new mandatory-arbitration claim.',
    },
  ],
  github: [
    {
      anchor: 'Payment Based on Plan',
      category: 'refundRestriction',
      label: 'positive',
      note: 'Prepaid service generally non-refundable; preserve partial-month conditions.',
    },
    {
      anchor: 'Invoicing For invoiced Users',
      category: 'refundRestriction',
      label: 'positive',
      note: 'Invoice payment non-refundable with stated exceptions.',
    },
    {
      anchor: 'We reserve the right, at our sole discretion, to amend',
      category: 'unilateralChange',
      label: 'positive',
      note: 'Amendment right with 30-day notice for material changes.',
    },
    {
      anchor: 'You may change your level of service',
      category: 'unilateralChange',
      label: 'negative',
      note: 'User changes their own plan; not provider unilateral authority.',
    },
  ],
  mozilla: [
    {
      anchor: 'Every once in a while, Mozilla may decide',
      category: 'unilateralChange',
      label: 'positive',
      note: 'Updates and continued-use acceptance.',
    },
    {
      anchor: 'Firefox is free and open source web browser software',
      category: 'autoRenewal',
      label: 'negative',
      note: 'Free software statement is not a recurring paid subscription.',
    },
    {
      anchor: 'You give Mozilla the rights necessary to operate Firefox.',
      category: 'thirdPartySharing',
      label: 'negative',
      note: 'Processing referenced; no third-party sharing established by this paragraph.',
    },
  ],
};

await mkdir('eval/annotations', { recursive: true });
for (const [id, selected] of Object.entries(selections)) {
  const output = `eval/annotations/${id}.json`;
  if (existsSync(output)) {
    console.log(`${id}: frozen annotations preserved`);
    continue;
  }
  const fullText = await readFile(`eval/sources/${id}.txt`, 'utf8');
  const meta = JSON.parse(
    await readFile(`eval/sources/${id}.json`, 'utf8'),
  ) as { url: string; hash: string; language: string; retrievedAt: string };
  if ((await hashText(fullText)) !== meta.hash)
    throw new Error(`Source hash mismatch: ${id}`);
  const paragraphs = fullText
    .split(/\n\s*\n/)
    .map((text) => text.trim())
    .filter(Boolean);
  let text = '';
  const annotations: Annotation[] = [];
  const sourceSpans = [];
  for (const selection of selected) {
    const matches = paragraphs.filter((paragraph) =>
      paragraph.includes(selection.anchor),
    );
    if (matches.length !== 1)
      throw new Error(`Ambiguous or missing anchor: ${id}/${selection.anchor}`);
    const paragraph = matches[0];
    if (text) text += '\n\n';
    const start = text.length;
    text += paragraph;
    annotations.push({
      category: selection.category,
      label: selection.label,
      start,
      end: text.length,
      quote: paragraph,
      note: selection.note,
    });
    sourceSpans.push({
      excerptStart: start,
      excerptEnd: text.length,
      sourceStart: fullText.indexOf(paragraph),
      sourceEnd: fullText.indexOf(paragraph) + paragraph.length,
    });
  }
  await writeFile(
    output,
    JSON.stringify(
      {
        id,
        sourceUrl: meta.url,
        sourceHash: meta.hash,
        retrievedAt: meta.retrievedAt,
        language: meta.language,
        scope:
          'Selected original paragraphs, not the entire policy or linked documents',
        annotatedBy:
          'Assistant source review; human legal review not performed',
        frozenAt: new Date().toISOString(),
        text,
        hash: await hashText(text),
        annotations,
        sourceSpans,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `${id}: ${annotations.length} annotated paragraphs, ${text.length} characters`,
  );
}

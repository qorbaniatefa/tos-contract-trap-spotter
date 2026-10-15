import Ajv from 'ajv';
import { candidateSchema, reportSchema, snapshotSchema } from './schema';

const ajv = new Ajv({
  strict: true,
  allErrors: true,
  code: { source: true, esm: true },
});
export const candidateValid = ajv.compile(candidateSchema);
export const reportValid = ajv.compile(reportSchema);
export const snapshotValid = ajv.compile(snapshotSchema);
export { ajv };

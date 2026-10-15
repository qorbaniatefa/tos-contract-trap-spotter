import { config } from 'dotenv';
import { createService } from './app';
import { createGeminiProvider, DEFAULT_GEMINI_MODEL } from '../analysis/gemini';

config({ quiet: true });
const {
  PAIRING_TOKEN = '',
  EXTENSION_ORIGIN = '',
  GEMINI_MODEL = DEFAULT_GEMINI_MODEL,
  GEMINI_API_KEY = '',
} = process.env;
try {
  const app = createService({
    token: PAIRING_TOKEN,
    origin: EXTENSION_ORIGIN,
    provider: createGeminiProvider({
      model: GEMINI_MODEL,
      apiKey: GEMINI_API_KEY,
    }),
  });
  await app.listen({ host: '127.0.0.1', port: 4318 });
  console.log(
    'Analysis service: http://127.0.0.1:4318 · no source/key logging',
  );
  if (!GEMINI_API_KEY)
    console.log(
      'GEMINI_API_KEY is missing: live analysis and evaluation are pending.',
    );
  const stop = () => void app.close();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch {
  console.error(
    'Service could not start. Check .env.example, token, extension origin, provider URL and port 4318.',
  );
  process.exitCode = 1;
}

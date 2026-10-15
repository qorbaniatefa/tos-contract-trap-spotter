import { config } from 'dotenv';
config({ quiet: true });
const key = process.env.GEMINI_API_KEY || '';
const keyLooksLikeGoogleKey = /^AIza[A-Za-z0-9_-]{35}$/.test(key);
if (!key) {
  console.log({ configured: false });
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
      {
        headers: { 'x-goog-api-key': key },
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      },
    );
    const body = (await response.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    const models = (body.models ?? [])
      .map((model) => model.name)
      .filter(
        (name): name is string =>
          typeof name === 'string' && /^models\/gemini-[a-z0-9.-]+$/.test(name),
      );
    console.log(
      JSON.stringify(
        { httpStatus: response.status, keyLooksLikeGoogleKey, models },
        null,
        2,
      ),
    );
    if (!response.ok) process.exitCode = 1;
  } catch {
    console.log({ failure: 'network', keyLooksLikeGoogleKey });
    process.exitCode = 1;
  }
}

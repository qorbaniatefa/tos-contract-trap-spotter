export interface Snapshot {
  text: string;
  url: string;
  title: string;
  capturedAt: string;
  region: string;
  hash: string;
  warnings: string[];
}

export async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function makeSnapshot(
  text: string,
  url: string,
  title: string,
  region: string,
  warnings: string[] = [],
): Promise<Snapshot> {
  if (!text.trim() || text.length > 200000)
    throw new Error(
      'Metin boş veya 200.000 karakter sınırını aşıyor. Daha küçük bir bölüm seçin.',
    );
  const address = new URL(url);
  if (!['http:', 'https:'].includes(address.protocol))
    throw new Error('Yalnızca HTTP/HTTPS sayfaları desteklenir.');
  address.search = '';
  address.hash = '';
  address.username = '';
  address.password = '';
  return {
    text,
    url: address.href,
    title: title.slice(0, 300),
    region,
    capturedAt: new Date().toISOString(),
    hash: await hashText(text),
    warnings,
  };
}

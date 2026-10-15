import './report.css';
import { hashText, type Snapshot } from '../analysis/snapshot';
import { validateReport, type Report } from '../analysis/pipeline';
import { snapshotValid } from '../analysis/validators';

const element = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const setText = (id: string, text: string) => {
  element(id).textContent = text;
};
const id = new URLSearchParams(location.search).get('id');
let snapshot: Snapshot | undefined;
let controller: AbortController | undefined;
let epoch = 0;
let token = '';
const labels = {
  complete: 'Analiz tamamlandı',
  partial: 'Eksik analiz',
  inconclusive: 'Sonuç belirsiz',
  error: 'Analiz yapılamadı',
};
const warningLabels: Record<string, string> = {
  renderedHtmlOnly:
    'Yalnızca görünür HTML metni yakalandı; PDF, OCR ve kapalı gölge DOM kapsam dışı.',
  linkedDocumentsNotCaptured: 'Bağlantılı diğer sözleşmeler yakalanmadı.',
  framesExcluded: 'Sayfa içindeki çerçeveler kapsam dışı.',
  bodyFallback:
    'Ana metin bölgesi bulunamadı; görünür sayfa gövdesi kullanıldı.',
  instructionLikeText:
    'Kaynakta talimata benzeyen metin var. Sayfa metni güvenilmeyen veri olarak işlendi; saldırıların tamamının saptandığı garanti edilmez.',
  invalidJson: 'Modelin bir yanıtı geçerli JSON değildi.',
  invalidSchema: 'Modelin bir yanıtı beklenen veri şemasına uymadı.',
  unsupportedCandidate:
    'Bazı adaylar alıntı veya kategori doğrulamasını geçemedi; rapora alınmadı.',
  providerFailure:
    'Bazı metin bölümlerinde sağlayıcı yanıtı alınamadı veya süre doldu.',
  missingKey:
    'Yerel serviste GEMINI_API_KEY eksik. Anahtarı uzantıya değil, yerel .env dosyasına girin.',
  authentication:
    'Gemini kimlik doğrulamasını reddetti. API anahtarını ve proje izinlerini yerel .env dosyasında kontrol edin.',
  quotaExceeded:
    'Gemini ücretsiz kullanım kotası aşıldı. Google AI Studio kotasını kontrol edip daha sonra tekrar deneyin. Otomatik tekrar yapılmadı.',
  modelUnavailable:
    'Seçilen Gemini modeli bu proje için kullanılamıyor. GEMINI_MODEL ayarını kontrol edin.',
  invalidRequest:
    'Gemini isteği reddetti. Model ve yapılandırma ayarlarını kontrol edin.',
  unavailable:
    'Gemini geçici olarak yanıt veremiyor. Daha sonra tekrar deneyin.',
  network: 'Yerel servis Gemini API bağlantısını kuramadı.',
  timeout: 'Gemini isteğinin süresi doldu.',
  invalidResponse: 'Gemini yanıtı beklenen yapıya uymadı.',
  blocked: 'Gemini yanıtı engellendi veya tamamlanamadı.',
};

function message(text: string) {
  setText('status', text);
}
function highlight(start: number, end: number) {
  if (!snapshot) return;
  const preview = element('preview');
  const mark = document.createElement('mark');
  mark.textContent = snapshot.text.slice(start, end);
  preview.replaceChildren(
    document.createTextNode(snapshot.text.slice(0, start)),
    mark,
    document.createTextNode(snapshot.text.slice(end)),
  );
  mark.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  preview.focus();
}

function renderReport(report: Report) {
  setText('state-badge', labels[report.status]);
  element('state-badge').dataset.state = report.status;
  setText('score', report.score === null ? '—' : String(report.score));
  setText(
    'score-caption',
    report.status === 'complete' && report.score === 0
      ? 'Doğrulanmış risk bulunamadı; maddeler gözden kaçmış olabilir.'
      : labels[report.status],
  );
  setText('coverage', `%${Math.round(report.coverage * 100)}`);
  (element('coverage-bar') as HTMLProgressElement).value =
    report.coverage * 100;
  setText('findings-count', `${report.findings.length} doğrulanmış madde`);
  element('fixture-notice').hidden = report.providerMode !== 'fixture';
  message(
    report.status === 'complete'
      ? 'Bulgular kaynak alıntılarıyla doğrulandı. Bu sonuç sözleşmenin güvenli olduğunu göstermez.'
      : `Analiz kesin bir sonuç vermedi. ${report.processed}/${report.total} parça işlendi; ${report.rejected} aday doğrulanamadı. Eksikler sıfır risk anlamına gelmez.`,
  );
  setText(
    'warnings',
    [...new Set(report.warnings)]
      .map((warning) => warningLabels[warning] ?? 'Analiz kapsamı sınırlıdır.')
      .join(' ') + ' Maddeler gözden kaçabilir; kaynak metni ayrıca inceleyin.',
  );
  const target = element('findings');
  target.replaceChildren();
  for (const finding of report.findings) {
    const article = document.createElement('article');
    article.className = 'finding';
    const heading = document.createElement('h3');
    heading.textContent = finding.title;
    const weight = document.createElement('span');
    weight.className = 'finding-weight';
    weight.textContent = `${finding.weight} kategori puanı`;
    const quote = document.createElement('blockquote');
    quote.textContent = finding.quote;
    const explanation = document.createElement('p');
    explanation.textContent = finding.explanation;
    const button = document.createElement('button');
    button.className = 'source-button';
    button.textContent = `Kaynakta göster (${finding.start}–${finding.end})`;
    button.addEventListener('click', () =>
      highlight(finding.start, finding.end),
    );
    article.append(heading, weight, quote, explanation, button);
    target.append(article);
  }
}

async function readBounded(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('empty');
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 6000000) throw new Error('size');
      text += decoder.decode(part.value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(text + decoder.decode()) as unknown;
}

element('save-token').addEventListener('click', async () => {
  const value = element<HTMLInputElement>('token').value.trim();
  if (!/^[a-z0-9]{32,128}$/i.test(value)) {
    setText(
      'connection-status',
      'Servisteki 32–128 karakterlik eşleştirme tokenını girin.',
    );
    return;
  }
  token = value;
  await chrome.storage.session.set({ pairingToken: value });
  element<HTMLInputElement>('token').value = '';
  setText(
    'connection-status',
    'Token bu oturum için kaydedildi. Bağlantı analiz sırasında doğrulanacak.',
  );
  (element('connection') as HTMLDetailsElement).open = false;
});

element('analyze').addEventListener('click', async () => {
  if (!snapshot) return;
  if (!token) {
    (element('connection') as HTMLDetailsElement).open = true;
    element('token').focus();
    message('Önce yerel servisinizin eşleştirme tokenını kaydedin.');
    return;
  }
  controller?.abort();
  controller = new AbortController();
  const requestEpoch = ++epoch;
  const current = snapshot;
  element<HTMLButtonElement>('analyze').disabled = true;
  element('cancel').hidden = false;
  setText('state-badge', 'İnceleniyor');
  setText('score', '—');
  setText('coverage', '—');
  setText('score-caption', 'Kaynak ve alıntılar doğrulanıyor');
  (element('coverage-bar') as HTMLProgressElement).value = 0;
  element('findings').replaceChildren();
  setText('findings-count', 'Analiz sürüyor');
  message(
    'Metin inceleniyor. Büyük belgelerde bu işlem üç dakikaya kadar sürebilir.',
  );
  try {
    const response = await fetch('http://127.0.0.1:4318/v1/analyze', {
      method: 'POST',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(185000)]),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ snapshot: current }),
    });
    if (!response.ok)
      throw new Error(response.status === 429 ? 'rateLimit' : 'service');
    const report = await readBounded(response);
    if (requestEpoch !== epoch) return;
    if (!validateReport(report, current)) throw new Error('evidence');
    renderReport(report);
    // Results stay in this tab's memory. A late response cannot repopulate
    // session storage after another report clears the session.
  } catch (error) {
    if (requestEpoch !== epoch) return;
    setText('state-badge', 'Sonuç belirsiz');
    setText('score-caption', 'Analiz tamamlanamadı');
    message(
      error instanceof Error && error.message === 'evidence'
        ? 'Gelen rapor doğrulamadan geçemedi. Desteklenmeyen iddialar gösterilmedi.'
        : 'Analiz tamamlanamadı. Yerel servisi, tokenı ve LLM ayarlarını kontrol edin. Bu durum sıfır risk anlamına gelmez.',
    );
  } finally {
    if (requestEpoch === epoch) {
      element<HTMLButtonElement>('analyze').disabled = false;
      element('cancel').hidden = true;
    }
  }
});
element('cancel').addEventListener('click', () => controller?.abort());
function forgetSession() {
  epoch++;
  controller?.abort();
  snapshot = undefined;
  token = '';
  element<HTMLInputElement>('token').value = '';
  element('preview').replaceChildren();
  element('findings').replaceChildren();
  setText('score', '—');
  setText('coverage', '—');
  setText('source-title', 'Oturum verileri silindi');
  setText('source-url', '');
  setText('capture-time', '');
  setText('source-length', '');
  setText('capture-scope', '');
  setText('findings-count', '');
  setText('score-caption', 'Yeni bir sayfa yakalayın');
  (element('coverage-bar') as HTMLProgressElement).value = 0;
  setText('state-badge', 'Oturum temizlendi');
  element('fixture-notice').hidden = true;
  element('cancel').hidden = true;
  element<HTMLButtonElement>('analyze').disabled = true;
  message(
    'Yakalanan metinler, raporlar ve eşleştirme tokenı bu oturumdan silindi. Yeni bir politika sayfasında uzantıya tıklayın.',
  );
}
element('clear').addEventListener('click', async () => {
  forgetSession();
  await chrome.storage.session.clear();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session') return;
  const captureDeleted =
    id &&
    `capture:${id}` in changes &&
    changes[`capture:${id}`].newValue === undefined;
  const tokenDeleted =
    'pairingToken' in changes && changes.pairingToken.newValue === undefined;
  if (captureDeleted || tokenDeleted) forgetSession();
});

async function init() {
  const initEpoch = epoch;
  const stored = await chrome.storage.session.get([
    'pairingToken',
    `capture:${id}`,
  ]);
  if (initEpoch !== epoch) return;
  token = typeof stored.pairingToken === 'string' ? stored.pairingToken : '';
  (element('connection') as HTMLDetailsElement).open = !token;
  const source = stored[`capture:${id}`];
  if (!id || !snapshotValid(source)) throw new Error('missingCapture');
  const captured = source as unknown as Snapshot;
  if ((await hashText(captured.text)) !== captured.hash)
    throw new Error('invalidCapture');
  if (initEpoch !== epoch) return;
  snapshot = captured;
  setText('preview', captured.text);
  setText('source-title', captured.title || 'Başlıksız belge');
  setText('source-url', captured.url);
  setText(
    'source-length',
    `${captured.text.length.toLocaleString('tr-TR')} karakter`,
  );
  setText(
    'capture-scope',
    captured.region === 'selection'
      ? 'Seçilen bölüm'
      : captured.region === 'main'
        ? 'Ana metin bölgesi'
        : 'Görünür sayfa gövdesi',
  );
  setText(
    'capture-time',
    new Date(captured.capturedAt).toLocaleString('tr-TR'),
  );
  message(
    'Önizlemedeki metin analiz edilecek. Kaynağı ve kapsamı kontrol edip “Analiz et” seçin.',
  );
  element<HTMLButtonElement>('analyze').disabled = false;
}
void init().catch(() => {
  setText('source-title', 'Metin yakalanamadı');
  message(
    'Bu sayfa desteklenmiyor veya oturumdaki metin artık mevcut değil. Bir HTTP/HTTPS politika sayfası açıp uzantıya tıklayın.',
  );
});

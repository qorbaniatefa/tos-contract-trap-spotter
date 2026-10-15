export const rules = {
  autoRenewal: {
    weight: 10,
    title: 'Otomatik yenileme',
    explanation:
      'Abonelik kendiliğinden yenilenebilir. Bir sonraki ödeme tarihini ve iptal adımlarını kontrol edin.',
    pattern: /automat\w* renew|renew\w* automat|otomatik.{0,40}yenilen/i,
  },
  trialConversion: {
    weight: 10,
    title: 'Deneme sonunda ücretlendirme',
    explanation:
      'Deneme dönemi ücretli aboneliğe dönüşebilir. Ücretlendirme başlamadan önceki iptal süresini kontrol edin.',
    pattern:
      /(?:trial|deneme).{0,200}(?:charg|paid|ücret)|(?:charg|paid|ücret).{0,200}(?:trial|deneme)/i,
  },
  refundRestriction: {
    weight: 10,
    title: 'İade kısıtı',
    explanation:
      'Bu madde iade hakkını sınırlandırıyor olabilir. İstisnaları ve geçerli koşulları alıntıyla birlikte inceleyin.',
    pattern:
      /non.?refundable|no refunds|not.{0,30}refund|refunds.{0,40}(?:not|unavailable)|iade.{0,35}(?:yapılmaz|edilmez|yok|verilmez)/i,
  },
  cancellationRestriction: {
    weight: 15,
    title: 'İptal koşulu',
    explanation:
      'İptal için süre veya yöntem koşulu bulunabilir. İptalin hangi tarihte yürürlüğe girdiğini kontrol edin.',
    pattern:
      /cancel.{0,100}(?:at least|before.{0,25}(?:renew|bill)|written notice|days.{0,20}advance)|iptal.{0,100}(?:en az|önce|yazılı)/i,
  },
  unilateralChange: {
    weight: 10,
    title: 'Tek taraflı değişiklik',
    explanation:
      'Sağlayıcı koşulları veya hizmeti değiştirme yetkisi saklıyor olabilir. Bildirim ve ayrılma seçeneklerini kontrol edin.',
    pattern:
      /(?:we|spotify|dropbox|discord|github).{0,100}(?:may|reserve).{0,80}(?:change|modify|amend)|(?:koşulları|şartları|hizmeti|sözleşmeyi).{0,50}değiştirme.{0,30}hakk/i,
  },
  thirdPartySharing: {
    weight: 10,
    title: 'Üçüncü taraflarla paylaşım',
    explanation:
      'Bilgiler başka kuruluşlarla paylaşılabilir. Paylaşımın amacı, kapsamı ve seçimlerinizi inceleyin.',
    pattern:
      /(?:share|disclos).{0,120}(?:third.part|partner|affiliate)|(?:üçüncü taraf|iş ortak|iştirak).{0,120}paylaş|paylaş.{0,120}(?:üçüncü taraf|iş ortak|iştirak)/i,
  },
  advertisingProfiling: {
    weight: 10,
    title: 'Reklam ve profilleme',
    explanation:
      'Bilgiler reklam kişiselleştirmesi veya profil oluşturmak için kullanılabilir. İzin ve kapatma seçeneklerini kontrol edin.',
    pattern:
      /personali[sz]ed ads|targeted advertis|advertising profile|kişiselleştirilmiş reklam|hedefli reklam|reklam.{0,60}profil/i,
  },
  retention: {
    weight: 5,
    title: 'Uzun süreli veri saklama',
    explanation:
      'Verilerin hesap kapatıldıktan sonra veya belirsiz bir süre saklanması öngörülüyor olabilir. Silme koşullarını inceleyin.',
    pattern:
      /retain.{0,120}(?:after.{0,40}(?:terminat|clos|delet)|indefinit|as long as)|(?:veri|bilgi).{0,100}(?:süresiz|kapat.{0,30}sonra).{0,60}sakla/i,
  },
  arbitration: {
    weight: 10,
    title: 'Zorunlu tahkim',
    explanation:
      'Uyuşmazlık çözümü için tahkim şartı bulunabilir. Kapsamını ve varsa vazgeçme seçeneklerini inceleyin.',
    pattern:
      /(?:binding|mandatory|individual) arbitration|arbitration.{0,100}(?:must|shall)|zorunlu tahkim/i,
  },
  classActionWaiver: {
    weight: 10,
    title: 'Toplu dava hakkı kısıtı',
    explanation:
      'Toplu dava veya toplu başvuru yolları sınırlandırılmış olabilir. Maddenin size uygulanıp uygulanmadığını ayrıca değerlendirin.',
    pattern:
      /(?:waiv|not|no|only).{0,120}class action|class action.{0,100}(?:waiv|prohibit)|toplu dava.{0,70}(?:feragat|vazgeç|yasak)/i,
  },
} as const;

export type Category = keyof typeof rules;
export const categories = Object.keys(rules) as Category[];

export function supports(category: Category, quote: string): boolean {
  const text = quote.toLowerCase().replace(/\s+/g, ' ');
  // Conservative: negations and exceptions cause uncertainty, never a stronger claim.
  const negative =
    category === 'refundRestriction' || category === 'classActionWaiver'
      ? /(?:not non.?refundable|refunds are available|class action.{0,40}not waived)/i
      : /\b(?:does not|do not|will not|never|not required|not subject)\b|yenilenmez|paylaşılmaz|saklanmaz|uygulanmaz/i;
  return rules[category].pattern.test(text) && !negative.test(text);
}

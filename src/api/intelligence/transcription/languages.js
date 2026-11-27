/**
 * Whisper's language table. Providers disagree on what they return —
 * whisper.cpp and faster-whisper give codes ("en"), the OpenAI API gives
 * names ("english") — so everything is normalised to codes.
 * @module api/intelligence/transcription/languages
 */

const TABLE =
  'en:english,zh:chinese,de:german,es:spanish,ru:russian,ko:korean,fr:french,ja:japanese,' +
  'pt:portuguese,tr:turkish,pl:polish,ca:catalan,nl:dutch,ar:arabic,sv:swedish,it:italian,' +
  'id:indonesian,hi:hindi,fi:finnish,vi:vietnamese,he:hebrew,uk:ukrainian,el:greek,ms:malay,' +
  'cs:czech,ro:romanian,da:danish,hu:hungarian,ta:tamil,no:norwegian,th:thai,ur:urdu,' +
  'hr:croatian,bg:bulgarian,lt:lithuanian,la:latin,mi:maori,ml:malayalam,cy:welsh,sk:slovak,' +
  'te:telugu,fa:persian,lv:latvian,bn:bengali,sr:serbian,az:azerbaijani,sl:slovenian,' +
  'kn:kannada,et:estonian,mk:macedonian,br:breton,eu:basque,is:icelandic,hy:armenian,' +
  'ne:nepali,mn:mongolian,bs:bosnian,kk:kazakh,sq:albanian,sw:swahili,gl:galician,mr:marathi,' +
  'pa:punjabi,si:sinhala,km:khmer,sn:shona,yo:yoruba,so:somali,af:afrikaans,oc:occitan,' +
  'ka:georgian,be:belarusian,tg:tajik,sd:sindhi,gu:gujarati,am:amharic,yi:yiddish,lo:lao,' +
  'uz:uzbek,fo:faroese,ht:haitian creole,ps:pashto,tk:turkmen,nn:nynorsk,mt:maltese,' +
  'sa:sanskrit,lb:luxembourgish,my:myanmar,bo:tibetan,tl:tagalog,mg:malagasy,as:assamese,' +
  'tt:tatar,haw:hawaiian,ln:lingala,ha:hausa,ba:bashkir,jw:javanese,su:sundanese,yue:cantonese';

/** @type {Map<string, string>} name → code */
const BY_NAME = new Map();
/** @type {Set<string>} */
const CODES = new Set();
for (const pair of TABLE.split(',')) {
  const [code, name] = pair.split(':');
  CODES.add(code);
  BY_NAME.set(name, code);
}

/** Languages written without spaces between words. */
export const UNSPACED = new Set(['zh', 'ja', 'th', 'lo', 'my', 'km', 'bo', 'yue']);

/**
 * Normalise a language name or code to a Whisper language code.
 * @param {unknown} value - "English", "en", "en-US"…
 * @returns {string} '' when unknown or empty
 */
export function languageCode(value) {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!text) return '';
  if (CODES.has(text)) return text;
  if (BY_NAME.has(text)) return BY_NAME.get(text);
  const prefix = text.split(/[-_]/)[0];
  return CODES.has(prefix) ? prefix : '';
}

/**
 * True for a value that is safe to pass to a provider as a language option.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isLanguage(value) {
  return typeof value === 'string' && languageCode(value) !== '';
}

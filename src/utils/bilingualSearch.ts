/**
 * Intelligent Bilingual (Arabic / English) Search and Translation Engine
 * Enables searching for files, suppliers, documents, and checks in either Arabic or English,
 * and displaying dual-language names for maximum archive clarity.
 */

// Arabic-Indic digits to Western digits converter
export function normalizeDigits(str: string): string {
  if (!str) return '';
  const arabicIndic = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let res = str;
  for (let i = 0; i < 10; i++) {
    res = res.replaceAll(arabicIndic[i], String(i));
  }
  return res;
}

// Normalized Arabic character cleaner
export function cleanArabic(str: string): string {
  if (!str) return '';
  return normalizeDigits(str)
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/[\u064B-\u065F]/g, '') // remove Arabic vowels / diacritics
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ') // replace special chars with spaces
    .replace(/\s+/g, ' ')
    .trim();
}

// Clean English string
export function cleanEnglish(str: string): string {
  if (!str) return '';
  return normalizeDigits(str)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Remove Arabic "ال" prefix for fuzzy match (e.g. "الدومتي" -> "دومتي")
export function stripArabicDefiniteArticle(str: string): string {
  if (!str) return '';
  return str.replace(/(^|\s)ال/g, '$1').trim();
}

export function isMainlyEnglish(str: string): boolean {
  if (!str) return false;
  const englishChars = (str.match(/[a-zA-Z]/g) || []).length;
  const arabicChars = (str.match(/[\u0600-\u06FF]/g) || []).length;
  return englishChars > arabicChars;
}

// Arabic number words to digits mapping
const ARABIC_ORDINAL_MAP: Record<string, number> = {
  الاول: 1,
  الاولى: 1,
  واحد: 1,
  الثاني: 2,
  الثانيه: 2,
  اثنين: 2,
  الثالث: 3,
  الثالثه: 3,
  ثلاثة: 3,
  الرابع: 4,
  الرابعه: 4,
  اربعة: 4,
  الخامس: 5,
  الخامسه: 5,
  خمسة: 5,
  السادس: 6,
  السادسه: 6,
  ستة: 6,
  السابع: 7,
  السابعه: 7,
  سبعة: 7,
  الثامن: 8,
  الثامنه: 8,
  ثمانية: 8,
  التاسع: 9,
  التاسعه: 9,
  تسعة: 9,
  العاشر: 10,
  العاشره: 10,
  عشرة: 10,
};

/**
 * Parses any envelope label or file identifier into a dual-language (Arabic + English) format.
 * Examples:
 *  - "Image 1" -> { ar: "الظرف 1", en: "Image 1", combined: "الظرف 1 · Image 1", number: 1 }
 *  - "الصورة الأولى" -> { ar: "الظرف 1", en: "Image 1", combined: "الظرف 1 · Image 1", number: 1 }
 *  - "الظرف 12" -> { ar: "الظرف 12", en: "File 12", combined: "الظرف 12 · File 12", number: 12 }
 */
export function getBilingualFileLabel(
  envelopeLabel: string,
  fallbackFileNo?: number
): {
  ar: string;
  en: string;
  combined: string;
  number?: number;
  searchVariants: string[];
} {
  const raw = envelopeLabel || '';
  const clean = cleanArabic(raw);
  const normalizedDigitsStr = normalizeDigits(raw);

  // 1. Try to extract number from digits
  const digitMatch = normalizedDigitsStr.match(/\d+/);
  let num: number | undefined = digitMatch ? parseInt(digitMatch[0], 10) : undefined;

  // 2. Try to extract number from ordinal words (e.g. الأولى, الثاني)
  if (num === undefined) {
    for (const [word, val] of Object.entries(ARABIC_ORDINAL_MAP)) {
      if (clean.includes(word)) {
        num = val;
        break;
      }
    }
  }

  // 3. Fallback to fileNo if still not found
  if (num === undefined && fallbackFileNo !== undefined) {
    num = fallbackFileNo;
  }

  const isImageOrigin =
    /image|img|صورة|صوره/i.test(raw);

  let arLabel: string;
  let enLabel: string;

  if (num !== undefined) {
    if (isImageOrigin) {
      arLabel = `الظرف ${num} (صورة ${num})`;
      enLabel = `Image ${num}`;
    } else {
      arLabel = `الظرف ${num}`;
      enLabel = `File #${num}`;
    }
  } else {
    // If no number could be parsed, retain raw and translate generic terms
    if (isMainlyEnglish(raw)) {
      enLabel = raw;
      arLabel = raw.replace(/image/i, 'صورة').replace(/file/i, 'ملف').replace(/envelope/i, 'ظرف');
    } else {
      arLabel = raw;
      enLabel = raw.replace(/الظرف/g, 'Env').replace(/الصورة/g, 'Image').replace(/ملف/g, 'File');
    }
  }

  const combined = `${arLabel} · ${enLabel}`;

  // Generate all search variants so user can find it in any language or format
  const variants = new Set<string>();
  variants.add(raw.toLowerCase());
  variants.add(clean);
  variants.add(arLabel.toLowerCase());
  variants.add(enLabel.toLowerCase());
  variants.add(combined.toLowerCase());

  if (num !== undefined) {
    variants.add(String(num));
    variants.add(`#${num}`);
    variants.add(`الظرف ${num}`);
    variants.add(`ظرف ${num}`);
    variants.add(`ملف ${num}`);
    variants.add(`صورة ${num}`);
    variants.add(`صوره ${num}`);
    variants.add(`image ${num}`);
    variants.add(`img ${num}`);
    variants.add(`file ${num}`);
    variants.add(`envelope ${num}`);
    variants.add(`env ${num}`);
  }

  return {
    ar: arLabel,
    en: enLabel,
    combined,
    number: num,
    searchVariants: Array.from(variants),
  };
}

// Known company aliases and translation dictionary (Covering Egyptian archive & hotel suppliers)
export const BILINGUAL_DICTIONARY: Record<string, { ar: string; en: string }> = {
  amico: { en: 'Amico of Egypt', ar: 'أميكو مصر (الصناعات الطبية)' },
  aramex: { en: 'Aramex International Egypt', ar: 'أرامكس الدولية مصر' },
  domty: { en: 'Domty Food Industries', ar: 'دومتي للصناعات الغذائية' },
  'mohamed aziz': { en: 'Mohamed Aziz', ar: 'محمد عزيز' },
  "tip's": { en: "TIP'S (CEMO)", ar: 'تيبس (سيمو)' },
  tips: { en: "TIP'S", ar: 'تيبس' },
  basco: { en: 'Basco For Engineering & Trading', ar: 'باسكو للهندسة والتجارة' },
  bagheera: { en: 'BAGHEERA', ar: 'باغيرا / باجيرا' },
  beirut: { en: 'Beirut Co Dairy Cheese Supplies', ar: 'شركة بيروت لتوريدات الألبان والجبن' },
  'el badr': { en: 'EL Badr For Trading & Distribution Food', ar: 'البدر لتجارة وتوزيع الأغذية' },
  badr: { en: 'El Badr Food', ar: 'البدر للأغذية' },
  'al bassiouni': { en: 'AL Bassiouni and Partners Co.', ar: 'البسيوني وشركاه' },
  bassiouni: { en: 'Al Bassiouni', ar: 'البسيوني' },
  'gelato mio': { en: 'Berehan Adel (Gelato Mio)', ar: 'جيلاتو ميو (برهان عادل)' },
  bergan: { en: 'Bergan For Industry', ar: 'برجان للصناعة' },
  playend: { en: 'Playend And Shatter for Trading', ar: 'بلاي إند آند شاتر للتجارة' },
  'big data': { en: 'Big Data Egypt For System', ar: 'بيج داتا مصر لنظم المعلومات' },
  bishara: { en: 'Bishara Textile & Garment Manufacturing', ar: 'بشارة للمنسوجات والملابس الجاهزة' },
  benzo: { en: 'Benzo Egypt For Trading & Distribution', ar: 'بنزو مصر للتجارة والتوزيع' },
  senco: { en: 'Cairo Engineering Co (SENCO)', ar: 'القاهرة للهندسة (سينكو)' },
  'cairo engineering': { en: 'Cairo Engineering Co', ar: 'شركة القاهرة للهندسة' },
  'buout alazaa': { en: 'Buout Alazaa Atrakia', ar: 'بيوت العزاء التركية' },
  'borg elarabi': { en: 'Borg Elarabi For Integrated Food Indus.', ar: 'برج العرب للصناعات الغذائية المتكاملة' },
  'cairo marriot': { en: 'Cairo Marriot Hotel & Omar Khayyam', ar: 'فندق ماريوت القاهرة وعمر الخيام' },
  marriot: { en: 'Cairo Marriot Hotel', ar: 'فندق ماريوت' },
  candoula: { en: 'Candoula For Supplies & Candles', ar: 'قندولة للتوريدات والشموع' },
  'cable network': { en: 'Cable Network Egypt (C.N.E)', ar: 'الشركة المصرية للقنوات الفضائية والكابلات (CNE)' },
  cne: { en: 'Cable Network Egypt', ar: 'سي إن إي (CNE)' },
  'cairo west': { en: 'Cairo West For Advertising', ar: 'كايرو وست للدعاية والإعلان' },
  calvatis: { en: 'Calvatis Egypt L.L.C', ar: 'كالفاتيس مصر' },
  'candle connection': { en: 'Candle Connection', ar: 'كاندل كونكشن' },
  'cairo three': { en: 'Cairo Three For Distribution', ar: 'كايرو ثري (3) للتوزيع' },
  'cairo poultry': { en: 'Cairo Poultry Processing Co.', ar: 'القاهرة لتجهيز الدواجن' },
  'al-ashry': { en: 'Al-Ashry For Trading & Engineering', ar: 'العشري للتجارة والهندسة' },
  ashry: { en: 'Al-Ashry', ar: 'العشري' },
  arma: { en: 'Arma Trading', ar: 'أرما للتجارة' },
  'ayman afandy': { en: 'Ayman Afandy Co. Import & Export', ar: 'أيمن أفندي للاستيراد والتصدير' },
  'american chamber': { en: 'American Chamber of Commerce In Egypt', ar: 'غرفة التجارة الأمريكية في مصر' },
  'art shop': { en: 'Art Shop', ar: 'آرت شوب' },
  'amir mohamed sayed': { en: 'Amir Mohamed Sayed Ali', ar: 'أمير محمد سيد علي' },
  'the arabic house': { en: 'The Arabic House For Suppling Food', ar: 'البيت العربي لتوريد الأغذية' },
  'arabian construction': { en: 'Arabian Construction Co.', ar: 'المقاولات العربية / الإنشاءات العربية' },
  armashield: { en: 'Armashield Egypt', ar: 'أرما شيلد مصر' },
  'cairo runners': { en: 'Cairo Runners', ar: 'كايرو رانرز' },
  'arab co': { en: 'Arab Co. For General Supplies & Maintenance', ar: 'الشركة العربية للتوريدات العامة والصيانة' },
  petrotrade: { en: 'Petrotrade (Commercial Petroleum Services)', ar: 'بتروتريد (الخدمات التجارية البترولية)' },
  vodafone: { en: 'Vodafone Egypt', ar: 'فودافون مصر' },
  orange: { en: 'Orange Egypt', ar: 'أورانج مصر' },
  etisalat: { en: 'Etisalat Egypt', ar: 'اتصالات مصر' },
  we: { en: 'Telecom Egypt (WE)', ar: 'المصرية للاتصالات (وي)' },
  cib: { en: 'Commercial International Bank (CIB)', ar: 'البنك التجاري الدولي (CIB)' },
  schneider: { en: 'Schneider Electric', ar: 'شنايدر إليكتريك' },
  siemens: { en: 'Siemens Egypt', ar: 'سيمنس مصر' },
  total: { en: 'Total Energies Egypt', ar: 'توتال إنرجيز مصر' },
  mobil: { en: 'ExxonMobil Egypt', ar: 'إكسون موبيل مصر' },
  shell: { en: 'Shell Egypt', ar: 'شل مصر' },
  danone: { en: 'Danone Egypt', ar: 'دانون مصر' },
  nestle: { en: 'Nestle Egypt', ar: 'نستله مصر' },
  'nestle water': { en: 'Nestle Water Egypt', ar: 'نستله للمياه مصر' },
  allianz: { en: 'Allianz Insurance', ar: 'أليانز للتأمين' },
  mostafa: { en: 'Al Mostafa for Trading & Supplies', ar: 'المصطفى للتجارة والتوريدات' },
  mostala: { en: 'Al Mostafa for Trading & Supplies', ar: 'المصطفى للتجارة والتوريدات' },
  'al mostala': { en: 'Al Mostafa for Trading & Supplies', ar: 'المصطفى للتجارة والتوريدات' },
  'al mostafa': { en: 'Al Mostafa for Trading & Supplies', ar: 'المصطفى للتجارة والتوريدات' },
  regina: { en: 'Regina Co For Pasta & Food', ar: 'شركة ريجينا للمكرونة والأغذية' },
  'wadi food': { en: 'Wadi Food Industries Co.', ar: 'شركة وادي فود للصناعات الغذائية' },
  soudanco: { en: 'Port Said Co (Soudanco)', ar: 'شركة بورسعيد (سودانكو)' },
  quanta: { en: 'QUANTA IMPORT & TRADE', ar: 'كوانتا للاستيراد والتجارة' },
  quatro: { en: 'Quatro For Import & Export', ar: 'كواترو للاستيراد والتصدير' },
  'prime foods': { en: 'Prime Foods', ar: 'برايم فودز' },
  mambya: { en: 'Mambya Egypt', ar: 'مامبيا مصر' },
  'manger duty free': { en: 'Manger Duty Free', ar: 'منجر للأسواق الحرة' },
  'ritz carlton': { en: 'The Ritz-Carlton / Pen', ar: 'ريتز كارلتون / شركة شيلار' },
  'al mansour': { en: 'Al Mansour Co. For Trading', ar: 'المنصور للتجارة' },
  'farm cheese': { en: 'Farm Cheese Co.', ar: 'فارم تشيز (الألبان والجبن)' },
  'food brand': { en: 'Foodbrand Trading', ar: 'فود براند للتجارة' },
  foodbrand: { en: 'Foodbrand Trading', ar: 'فود براند للتجارة' },
  bupa: { en: 'Bupa Egypt Insurance', ar: 'بوبا للتأمين' },
  carrefour: { en: 'Carrefour Egypt', ar: 'كارفور مصر' },
  maadi: { en: 'Maadi Development Co.', ar: 'شركة المعادي للتنمية والتعمير' },
  pepsi: { en: 'Pepsi Cola Egypt', ar: 'بيبسي كولا مصر' },
  'pepsi coal': { en: 'Pepsi Cola Egypt', ar: 'بيبسي كولا مصر' },
  froneri: { en: 'Froneri Ice Cream Egypt', ar: 'فرونيري آيس كريم مصر' },
  grohe: { en: 'Grohe Trading Limited', ar: 'جروهي للتجارة' },
  maersk: { en: 'Maersk Solution', ar: 'ميرسك للملاحة واللوجستيات' },
  miraco: { en: 'Misr Refrig - Air Condition (Miraco Carrier)', ar: 'ميراكو كاريير للتبريد والتكييف' },
  mobaco: { en: 'Mobaco for Industries & Trading', ar: 'موباكو للصناعة والتجارة' },
  sednaoui: { en: 'Sednaoui Consumer Clothes & Products', ar: 'شركة صيدناوي للملابس والمنتجات الاستهلاكية' },
  halwani: { en: 'Halwani Bros Co.', ar: 'شركة حلواني إخوان' },
  hero: { en: 'Hero For Food Industries', ar: 'هيرو للصناعات الغذائية' },
  'ideal standard': { en: 'Ideal Standard Int. Egypt', ar: 'أيديال ستاندرد مصر' },
  metlife: { en: 'MetLife Life Insurance Co', ar: 'متلايف إيه آي جي لتأمينات الحياة' },
  'water company': { en: 'Water Company', ar: 'شركة مياه الشرب والصرف الصحي' },
  'electricity company': { en: 'South Cairo Electricity Distribution Co.', ar: 'شركة جنوب القاهرة لتوزيع الكهرباء' },
  taxes: { en: 'Joint Stock Companies Tax Directorate', ar: 'مأمورية ضرائب الشركات المساهمة' },
  'health insurance': { en: 'General Authority for Health Insurance', ar: 'الهيئة العامة للتأمين الصحي' },
};

// Common bilingual vocabulary keywords for intelligent semantic matching
const VOCABULARY_MAP: Record<string, string[]> = {
  تجاره: ['trading', 'trade', 'commercial'],
  تجارة: ['trading', 'trade', 'commercial'],
  هندسه: ['engineering', 'engineer'],
  هندسة: ['engineering', 'engineer'],
  توزيع: ['distribution', 'distributor'],
  توريد: ['supply', 'supplies', 'supplying'],
  توريدات: ['supply', 'supplies', 'supplying'],
  اغذيه: ['food', 'foods'],
  أغذية: ['food', 'foods'],
  غذائيه: ['food', 'foods'],
  غذائية: ['food', 'foods'],
  صناعه: ['industry', 'industrial', 'industries', 'manufacturing'],
  صناعة: ['industry', 'industrial', 'industries', 'manufacturing'],
  فندق: ['hotel'],
  فنادق: ['hotels'],
  مستشفي: ['hospital'],
  مستشفى: ['hospital'],
  بنك: ['bank', 'banking'],
  مصر: ['egypt', 'egyptian'],
  القاهره: ['cairo'],
  القاهرة: ['cairo'],
  شركه: ['co', 'company', 'corp', 'corporation'],
  شركة: ['co', 'company', 'corp', 'corporation'],
  دعايه: ['advertising', 'ad'],
  دعاية: ['advertising', 'ad'],
  شمع: ['candle', 'candles'],
  شموع: ['candle', 'candles'],
  دواجن: ['poultry'],
  جبن: ['cheese'],
  البان: ['dairy', 'milk'],
  ألبان: ['dairy', 'milk'],
  ملابس: ['garment', 'textile', 'clothing'],
  منسوجات: ['textile', 'garments'],
  نظم: ['system', 'systems'],
  معلومات: ['information', 'data'],
  كابلات: ['cable', 'cables'],
  شبكه: ['network'],
  شبكة: ['network'],
  دوليه: ['intl', 'international'],
  دولية: ['intl', 'international'],
  مستند: ['doc', 'document'],
  مستندات: ['docs', 'documents'],
  شيك: ['check', 'cheque'],
  شيكات: ['checks', 'cheques'],
  ظرف: ['envelope', 'env', 'image'],
  الظرف: ['envelope', 'env', 'image'],
  صوره: ['image', 'photo', 'picture'],
  صورة: ['image', 'photo', 'picture'],
  ملف: ['file', 'record'],
  ملفات: ['files', 'records'],
};

// Transliterate English phonetics to Arabic
const LATIN_TO_ARABIC_CHAR: Record<string, string> = {
  a: 'ا',
  b: 'ب',
  c: 'ك',
  d: 'د',
  e: 'ي',
  f: 'ف',
  g: 'ج',
  h: 'ه',
  i: 'ي',
  j: 'ج',
  k: 'ك',
  l: 'ل',
  m: 'م',
  n: 'ن',
  o: 'و',
  p: 'ب',
  q: 'ك',
  r: 'ر',
  s: 'س',
  t: 'ت',
  u: 'و',
  v: 'ف',
  w: 'و',
  x: 'اكس',
  y: 'ي',
  z: 'ز',
};

export function transliterateLatinToArabic(input: string): string {
  const clean = input.toLowerCase().trim();
  let result = '';
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (LATIN_TO_ARABIC_CHAR[char]) {
      result += LATIN_TO_ARABIC_CHAR[char];
    } else if (char === ' ') {
      result += ' ';
    }
  }
  return cleanArabic(result);
}

/**
 * Intelligent Single-Field Bilingual Matcher (Strict Precision)
 */
export function matchesBilingual(targetText: string, searchQuery: string): boolean {
  if (!searchQuery || !searchQuery.trim()) return true;
  if (!targetText) return false;

  const rawTarget = targetText.toLowerCase().trim();
  const rawQuery = searchQuery.toLowerCase().trim();

  // 1. Exact match
  if (rawTarget === rawQuery) return true;

  // 2. Normalized Arabic match
  const cleanTargetAr = cleanArabic(targetText);
  const cleanQueryAr = cleanArabic(searchQuery);

  if (cleanTargetAr && cleanQueryAr) {
    if (cleanTargetAr === cleanQueryAr) return true;
    if (cleanQueryAr.length >= 3 && cleanTargetAr.includes(cleanQueryAr)) return true;

    // Check with stripped "ال" prefix
    const strippedTarget = stripArabicDefiniteArticle(cleanTargetAr);
    const strippedQuery = stripArabicDefiniteArticle(cleanQueryAr);
    if (strippedQuery.length >= 3 && strippedTarget.includes(strippedQuery)) return true;
  }

  // 3. Normalized English match
  const cleanTargetEn = cleanEnglish(targetText);
  const cleanQueryEn = cleanEnglish(searchQuery);

  if (cleanTargetEn && cleanQueryEn) {
    if (cleanTargetEn === cleanQueryEn) return true;
    if (cleanQueryEn.length >= 3 && cleanTargetEn.includes(cleanQueryEn)) return true;
  }

  // 4. Dictionary Alias Cross-Matching
  for (const [key, val] of Object.entries(BILINGUAL_DICTIONARY)) {
    const dictEnClean = cleanEnglish(val.en);
    const dictArClean = cleanArabic(val.ar);
    const keyClean = cleanEnglish(key);

    const targetMatchesDict =
      cleanTargetEn.includes(dictEnClean) ||
      cleanTargetEn.includes(keyClean) ||
      cleanTargetAr.includes(dictArClean);

    if (targetMatchesDict) {
      if (
        (cleanQueryAr.length >= 3 && dictArClean.includes(cleanQueryAr)) ||
        (cleanQueryEn.length >= 3 && dictEnClean.includes(cleanQueryEn)) ||
        (cleanQueryEn.length >= 3 && keyClean.includes(cleanQueryEn))
      ) {
        return true;
      }
    }
  }

  return false;
}

export interface ParsedSearchQuery {
  raw: string;
  targetFileNumber?: number;
  targetBoxNumber?: number;
  targetYear?: number;
  keywords: string[];
}

export interface RecordScoreResult {
  score: number;
  isExactMatch: boolean;
  matchType?: 'exact-doc' | 'exact-file' | 'exact-supplier' | 'supplier-word' | 'bilingual' | 'notes' | 'year';
  matchedFields: string[];
}

/**
 * Parses user search query into structured intent (File number, Box, Year, and Keywords)
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  if (!query || !query.trim()) {
    return { raw: '', keywords: [] };
  }

  const norm = normalizeDigits(query.trim());
  let remainder = norm;
  let targetFileNumber: number | undefined = undefined;
  let targetBoxNumber: number | undefined = undefined;
  let targetYear: number | undefined = undefined;

  // Standalone single or double digit (e.g. "1" or "2" or "15")
  if (/^\d{1,2}$/.test(remainder)) {
    return {
      raw: query,
      targetFileNumber: parseInt(remainder, 10),
      keywords: [],
    };
  }

  // File / Envelope pattern: "Image 1", "الظرف 1", "صورة 1", "ملف 1", "#1", "file 1"
  const fileNumMatch = remainder.match(
    /(?:الظرف|ظرف|صورة|صوره|الصورة|الصوره|ملف|image|img|file|env|#)\s*([0-9]+)/i
  );
  if (fileNumMatch) {
    targetFileNumber = parseInt(fileNumMatch[1], 10);
    remainder = remainder.replace(fileNumMatch[0], ' ');
  } else {
    // Check Arabic ordinal words: "الصورة الأولى", "الظرف الثاني"
    for (const [word, val] of Object.entries(ARABIC_ORDINAL_MAP)) {
      const ordinalRegex = new RegExp(
        `(?:الظرف|ظرف|صورة|صوره|الصورة|الصوره|ملف|image|file)\\s+${word}`,
        'i'
      );
      if (ordinalRegex.test(remainder)) {
        targetFileNumber = val;
        remainder = remainder.replace(ordinalRegex, ' ');
        break;
      }
    }
  }

  // Box pattern: "صندوق 1", "صندوق رقم 1", "box 1", "box-01"
  const boxNumMatch = remainder.match(/(?:صندوق|صندوق\s*رقم|box|box-)\s*([0-9]+)/i);
  if (boxNumMatch) {
    targetBoxNumber = parseInt(boxNumMatch[1], 10);
    remainder = remainder.replace(boxNumMatch[0], ' ');
  }

  // 4-digit Year: 2016, 2017, 2018, etc.
  const yearMatch = remainder.match(/\b(19\d\d|20\d\d)\b/);
  if (yearMatch) {
    targetYear = parseInt(yearMatch[1], 10);
    remainder = remainder.replace(yearMatch[0], ' ');
  }

  // Remaining words are search keywords
  const keywords = remainder
    .split(/[\s,،؛]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  return {
    raw: query,
    targetFileNumber,
    targetBoxNumber,
    targetYear,
    keywords,
  };
}

/**
 * Universal High-Precision Search Scorer
 * Scores archive record against user query from 0 (no match) to 2500+ (exact match).
 * Eliminates all random / false-positive matches.
 */
export function scoreArchiveRecord(
  record: {
    supplierName: string;
    docNo: string;
    checkNo: string;
    envelopeLabel: string;
    fileNo: number;
    year: number;
    notes?: string;
    boxTitle?: string;
    boxCode?: string;
    boxId?: number;
  },
  query: string
): RecordScoreResult {
  if (!query || !query.trim()) {
    return { score: 100, isExactMatch: false, matchedFields: [] };
  }

  const parsed = parseSearchQuery(query);
  const matchedFields: string[] = [];
  let score = 0;
  let matchType: RecordScoreResult['matchType'] = undefined;

  // 1. Mandatory File/Envelope constraint
  if (parsed.targetFileNumber !== undefined) {
    const fileBi = getBilingualFileLabel(record.envelopeLabel, record.fileNo);
    const matchesFileNo =
      record.fileNo === parsed.targetFileNumber || fileBi.number === parsed.targetFileNumber;

    if (!matchesFileNo) {
      // Record does not match the explicitly requested file/envelope index
      return { score: 0, isExactMatch: false, matchedFields: [] };
    }

    score += 900;
    matchedFields.push('envelopeLabel');
    matchType = 'exact-file';
  }

  // 2. Mandatory Box Number constraint
  if (parsed.targetBoxNumber !== undefined) {
    const matchesBox =
      record.boxId === parsed.targetBoxNumber ||
      (record.boxCode && record.boxCode.includes(String(parsed.targetBoxNumber)));

    if (!matchesBox) {
      return { score: 0, isExactMatch: false, matchedFields: [] };
    }
    score += 200;
    matchedFields.push('boxCode');
  }

  // 3. Mandatory Year constraint
  if (parsed.targetYear !== undefined) {
    if (record.year !== parsed.targetYear) {
      return { score: 0, isExactMatch: false, matchedFields: [] };
    }
    score += 300;
    matchedFields.push('year');
    if (!matchType) matchType = 'year';
  }

  // If there are NO keywords remaining (e.g. user just searched "Image 1" or "2017"), return score!
  if (parsed.keywords.length === 0) {
    return {
      score,
      isExactMatch: score >= 900,
      matchType: matchType || 'exact-file',
      matchedFields,
    };
  }

  // Pre-calculate clean strings for record fields
  const cleanSupplierAr = cleanArabic(record.supplierName);
  const cleanSupplierEn = cleanEnglish(record.supplierName);
  const supplierWords = [
    ...cleanSupplierAr.split(/\s+/),
    ...cleanSupplierEn.split(/\s+/),
  ].filter(Boolean);

  const cleanDoc = cleanEnglish(record.docNo).toLowerCase();
  const rawDoc = (record.docNo || '').toLowerCase().trim();
  const rawCheck = (record.checkNo || '').toLowerCase().trim();
  const cleanNotesAr = cleanArabic(record.notes || '');
  const cleanNotesEn = cleanEnglish(record.notes || '');

  // Secondary bilingual supplier name from dictionary
  const supplierBi = getSupplierBilingualInfo(record.supplierName);
  const cleanSecAr = cleanArabic(supplierBi.secondary || '');
  const cleanSecEn = cleanEnglish(supplierBi.secondary || '');

  // 4. Match every keyword in the query (AND logic)
  let totalKeywordScore = 0;

  for (const kw of parsed.keywords) {
    const cleanKwAr = cleanArabic(kw);
    const cleanKwEn = cleanEnglish(kw);
    const rawKw = kw.toLowerCase().trim();

    let kwScore = 0;
    let kwField = '';

    // A. Check Document Number (Highest Priority)
    if (rawDoc && rawDoc !== '—') {
      if (rawDoc === rawKw || cleanDoc === cleanKwEn) {
        kwScore = Math.max(kwScore, 1200);
        kwField = 'docNo';
        matchType = 'exact-doc';
      } else if (cleanKwEn.length >= 3 && cleanDoc.includes(cleanKwEn)) {
        kwScore = Math.max(kwScore, 700);
        kwField = 'docNo';
        if (!matchType) matchType = 'exact-doc';
      }
    }

    // B. Check Bank Check Number
    if (rawCheck && rawCheck !== '—') {
      if (rawCheck === rawKw) {
        kwScore = Math.max(kwScore, 1200);
        kwField = 'checkNo';
      } else if (rawKw.length >= 3 && rawCheck.includes(rawKw)) {
        kwScore = Math.max(kwScore, 700);
        kwField = 'checkNo';
      }
    }

    // C. Check Supplier Name (Exact, Word, Prefix, Substring)
    if (
      (cleanKwAr.length > 0 && cleanSupplierAr === cleanKwAr) ||
      (cleanKwEn.length > 0 && cleanSupplierEn === cleanKwEn)
    ) {
      kwScore = Math.max(kwScore, 1000);
      kwField = 'supplierName';
      matchType = 'exact-supplier';
    } else if (
      (cleanKwAr.length >= 2 && cleanSupplierAr.startsWith(cleanKwAr)) ||
      (cleanKwEn.length >= 2 && cleanSupplierEn.startsWith(cleanKwEn))
    ) {
      kwScore = Math.max(kwScore, 850);
      kwField = 'supplierName';
      if (!matchType) matchType = 'exact-supplier';
    } else if (
      (cleanKwAr.length >= 2 && supplierWords.includes(cleanKwAr)) ||
      (cleanKwEn.length >= 2 && supplierWords.includes(cleanKwEn))
    ) {
      kwScore = Math.max(kwScore, 800);
      kwField = 'supplierName';
      if (!matchType) matchType = 'supplier-word';
    } else if (
      (cleanKwAr.length >= 3 && cleanSupplierAr.includes(cleanKwAr)) ||
      (cleanKwEn.length >= 3 && cleanSupplierEn.includes(cleanKwEn))
    ) {
      kwScore = Math.max(kwScore, 500);
      kwField = 'supplierName';
      if (!matchType) matchType = 'supplier-word';
    }

    // Also check stripped "ال" prefix on Arabic
    if (cleanKwAr.length >= 3) {
      const strippedKw = stripArabicDefiniteArticle(cleanKwAr);
      const strippedSup = stripArabicDefiniteArticle(cleanSupplierAr);
      if (strippedKw && strippedSup && (strippedSup.includes(strippedKw) || strippedKw === strippedSup)) {
        kwScore = Math.max(kwScore, 650);
        kwField = 'supplierName';
      }
    }

    // D. Check Bilingual Dictionary & Secondary Names
    if (supplierBi.secondary) {
      if (
        (cleanKwAr.length > 0 && cleanSecAr === cleanKwAr) ||
        (cleanKwEn.length > 0 && cleanSecEn === cleanKwEn)
      ) {
        kwScore = Math.max(kwScore, 850);
        kwField = 'supplierBilingual';
        if (!matchType) matchType = 'bilingual';
      } else if (
        (cleanKwAr.length >= 2 && cleanSecAr.startsWith(cleanKwAr)) ||
        (cleanKwEn.length >= 2 && cleanSecEn.startsWith(cleanKwEn))
      ) {
        kwScore = Math.max(kwScore, 750);
        kwField = 'supplierBilingual';
        if (!matchType) matchType = 'bilingual';
      } else if (
        (cleanKwAr.length >= 3 && cleanSecAr.includes(cleanKwAr)) ||
        (cleanKwEn.length >= 3 && cleanSecEn.includes(cleanKwEn))
      ) {
        kwScore = Math.max(kwScore, 600);
        kwField = 'supplierBilingual';
        if (!matchType) matchType = 'bilingual';
      }
    }

    // Transliteration cross-check (phonetics)
    if (kwScore === 0) {
      if (cleanKwEn.length >= 4 && cleanSupplierAr) {
        const translitAr = transliterateLatinToArabic(cleanKwEn);
        if (translitAr.length >= 3 && cleanSupplierAr.includes(translitAr)) {
          kwScore = Math.max(kwScore, 450);
          kwField = 'supplierTransliteration';
          if (!matchType) matchType = 'bilingual';
        }
      } else if (cleanKwAr.length >= 3 && cleanSupplierEn) {
        const translitAr = transliterateLatinToArabic(cleanSupplierEn);
        if (translitAr.length >= 3 && translitAr.includes(cleanKwAr)) {
          kwScore = Math.max(kwScore, 450);
          kwField = 'supplierTransliteration';
          if (!matchType) matchType = 'bilingual';
        }
      }
    }

    // E. Check Notes (Lower Priority)
    if (kwScore === 0) {
      if (
        (cleanKwAr.length >= 3 && cleanNotesAr.includes(cleanKwAr)) ||
        (cleanKwEn.length >= 3 && cleanNotesEn.includes(cleanKwEn))
      ) {
        kwScore = Math.max(kwScore, 250);
        kwField = 'notes';
        if (!matchType) matchType = 'notes';
      }
    }

    // If this keyword matched NOTHING in the record, then this record FAILS the search!
    if (kwScore === 0) {
      return { score: 0, isExactMatch: false, matchedFields: [] };
    }

    totalKeywordScore += kwScore;
    if (kwField && !matchedFields.includes(kwField)) {
      matchedFields.push(kwField);
    }
  }

  const finalScore = score + totalKeywordScore;
  return {
    score: finalScore,
    isExactMatch: finalScore >= 900,
    matchType,
    matchedFields,
  };
}

/**
 * Universal Multi-Token Record Matcher
 */
export function matchesArchiveRecord(
  record: {
    supplierName: string;
    docNo: string;
    checkNo: string;
    envelopeLabel: string;
    fileNo: number;
    year: number;
    notes?: string;
    boxTitle?: string;
    boxCode?: string;
    boxId?: number;
  },
  searchQuery: string
): boolean {
  if (!searchQuery || !searchQuery.trim()) return true;
  const result = scoreArchiveRecord(record, searchQuery);
  return result.score > 0;
}

/**
 * Returns dual-language display information for a company/supplier
 */
export function getSupplierBilingualInfo(name: string): {
  primary: string;
  secondary?: string;
  isEnglish: boolean;
} {
  if (!name) return { primary: '', isEnglish: false };

  const isEn = isMainlyEnglish(name);
  const cleanEn = cleanEnglish(name);
  const cleanAr = cleanArabic(name);

  // Look up in dictionary
  for (const [key, val] of Object.entries(BILINGUAL_DICTIONARY)) {
    const keyClean = cleanEnglish(key);
    const dictEnClean = cleanEnglish(val.en);
    const dictArClean = cleanArabic(val.ar);

    if (cleanEn.includes(keyClean) || cleanEn.includes(dictEnClean)) {
      return {
        primary: name,
        secondary: val.ar,
        isEnglish: isEn,
      };
    }

    if (cleanAr.includes(dictArClean)) {
      return {
        primary: name,
        secondary: val.en,
        isEnglish: isEn,
      };
    }
  }

  // Automatic transliteration if no manual dictionary entry exists
  if (isEn) {
    const autoAr = transliterateLatinToArabic(name);
    if (autoAr && autoAr.length > 2) {
      return {
        primary: name,
        secondary: autoAr,
        isEnglish: true,
      };
    }
  }

  return {
    primary: name,
    isEnglish: isEn,
  };
}

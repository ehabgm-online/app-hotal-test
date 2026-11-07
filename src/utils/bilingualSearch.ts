/**
 * Intelligent Bilingual (Arabic / English) Search and Translation Engine
 * Enables searching for company names in either Arabic or English,
 * and displaying dual-language names for maximum archive clarity.
 */

// Normalized Arabic character cleaner
export function cleanArabic(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '') // remove Arabic vowels/diacritics
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ') // replace special chars with spaces
    .replace(/\s+/g, ' ')
    .trim();
}

// Clean English string
export function cleanEnglish(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isMainlyEnglish(str: string): boolean {
  if (!str) return false;
  const englishChars = (str.match(/[a-zA-Z]/g) || []).length;
  const arabicChars = (str.match(/[\u0600-\u06FF]/g) || []).length;
  return englishChars > arabicChars;
}

// Known company aliases and translation dictionary
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
  'al bassiouni': { en: 'AL Bassiouni and Partners Co.', ar: 'البسيوني وشركاه' },
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
  petrotrade: { en: 'Petrotrade', ar: 'بتروتريد (الخدمات البترولية)' },
  vodafone: { en: 'Vodafone Egypt', ar: 'فودافون مصر' },
  orange: { en: 'Orange Egypt', ar: 'أورانج مصر' },
  etisalat: { en: 'Etisalat Egypt', ar: 'اتصالات مصر' },
  we: { en: 'Telecom Egypt (WE)', ar: 'المصرية للاتصالات (وي)' },
  cib: { en: 'Commercial International Bank (CIB)', ar: 'البنك التجاري الدولي (CIB)' },
  schneider: { en: 'Schneider Electric', ar: 'شنايدر إليكتريك' },
  siemens: { en: 'Siemens Egypt', ar: 'سيمنس' },
  total: { en: 'Total Energies Egypt', ar: 'توتال إنرجيز مصر' },
  mobil: { en: 'ExxonMobil Egypt', ar: 'إكسون موبيل مصر' },
  shell: { en: 'Shell Egypt', ar: 'شل مصر' },
  danone: { en: 'Danone Egypt', ar: 'دانون مصر' },
  nestle: { en: 'Nestle Egypt', ar: 'نستله مصر' },
  allianz: { en: 'Allianz Insurance', ar: 'أليانز للتأمين' },
  bupa: { en: 'Bupa Egypt Insurance', ar: 'بوبا للتأمين' },
  carrefour: { en: 'Carrefour Egypt', ar: 'كارفور مصر' },
  maadi: { en: 'Maadi Development Co.', ar: 'شركة المعادي للتنمية والتعمير' },
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
  صناعه: ['industry', 'industrial', 'industries', 'manufacturing'],
  صناعة: ['industry', 'industrial', 'industries'],
  فندق: ['hotel'],
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
};

// Simple phonetic transliteration (English letters to Arabic phonetics)
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
 * Intelligent Bilingual Matcher:
 * Checks if targetText matches query across Arabic and English,
 * dictionary aliases, business vocabulary, and phonetic sounds.
 */
export function matchesBilingual(targetText: string, searchQuery: string): boolean {
  if (!searchQuery || !searchQuery.trim()) return true;
  if (!targetText) return false;

  const rawTarget = targetText.toLowerCase();
  const rawQuery = searchQuery.toLowerCase().trim();

  // 1. Direct substring match (case-insensitive)
  if (rawTarget.includes(rawQuery)) return true;

  // 2. Normalized Arabic match
  const cleanTargetAr = cleanArabic(targetText);
  const cleanQueryAr = cleanArabic(searchQuery);

  if (cleanTargetAr.includes(cleanQueryAr)) return true;

  // 3. Normalized English match
  const cleanTargetEn = cleanEnglish(targetText);
  const cleanQueryEn = cleanEnglish(searchQuery);

  if (cleanTargetEn && cleanQueryEn && cleanTargetEn.includes(cleanQueryEn)) {
    return true;
  }

  // 4. Dictionary Alias Cross-Matching
  // Check if target matches any dictionary entry, and if query matches the other language
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
        cleanQueryAr.includes(dictArClean) ||
        dictArClean.includes(cleanQueryAr) ||
        cleanQueryEn.includes(dictEnClean) ||
        cleanQueryEn.includes(keyClean) ||
        dictEnClean.includes(cleanQueryEn)
      ) {
        return true;
      }
    }
  }

  // 5. Vocabulary mapping cross-match (e.g. user typed "توريد" and target has "Supplies")
  for (const [arWord, enWords] of Object.entries(VOCABULARY_MAP)) {
    if (cleanQueryAr.includes(arWord) || arWord.includes(cleanQueryAr)) {
      if (enWords.some((en) => cleanTargetEn.includes(en))) {
        return true;
      }
    }
    if (enWords.some((en) => cleanQueryEn.includes(en))) {
      if (cleanTargetAr.includes(arWord)) {
        return true;
      }
    }
  }

  // 6. Phonetic transliteration matching
  // If target is in English (e.g. Basco), and query is in Arabic (e.g. باسكو)
  if (cleanTargetEn && cleanQueryAr) {
    const targetTranslitAr = transliterateLatinToArabic(cleanTargetEn);
    if (targetTranslitAr && (targetTranslitAr.includes(cleanQueryAr) || cleanQueryAr.includes(targetTranslitAr))) {
      return true;
    }
  }

  // If query is in English (e.g. Basco) and target is in Arabic
  if (cleanQueryEn && cleanTargetAr) {
    const queryTranslitAr = transliterateLatinToArabic(cleanQueryEn);
    if (queryTranslitAr && (cleanTargetAr.includes(queryTranslitAr) || queryTranslitAr.includes(cleanTargetAr))) {
      return true;
    }
  }

  return false;
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

  return {
    primary: name,
    isEnglish: isEn,
  };
}

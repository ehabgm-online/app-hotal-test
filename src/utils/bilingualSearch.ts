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
  gezira: { en: 'El Gezira For Import & Export', ar: 'الجزيرة للاستيراد والتصدير' },
  'al gezira': { en: 'El Gezira For Import & Export', ar: 'الجزيرة للاستيراد والتصدير' },
  'el gezira': { en: 'El Gezira For Import & Export', ar: 'الجزيرة للاستيراد والتصدير' },
  tiba: { en: 'Tiba for Trading and Distribution', ar: 'طيبة للتجارة والتوزيع' },
  marina: { en: 'MARINA SUPPLI_ING (Marina Suppling)', ar: 'مارينا للتوريدات' },
  'marina suppling': { en: 'MARINA SUPPLI_ING', ar: 'مارينا للتوريدات' },
  petro: { en: 'Petrotrade (Commercial Petroleum Services)', ar: 'شركة الخدمات التجارية البترولية - بتروتريد' },
  'بتروتريد': { en: 'Petrotrade (PETRO)', ar: 'شركة الخدمات التجارية البترولية - بتروتريد' },
  schiller: { en: 'Schiller / The Ritz-Carlton Pen', ar: 'شركة شيلار / فندق الريتز كارلتون' },
  'شيلار': { en: 'Schiller / The Ritz-Carlton Pen', ar: 'شركة شيلار / فندق الريتز كارلتون' },
  'الريتزكارلتون': { en: 'The Ritz-Carlton / Schiller Pen', ar: 'حياه النقابة العامة بفندق الريتزكارلتون' },
  'ريتزكارلتون': { en: 'The Ritz-Carlton / Schiller Pen', ar: 'فندق الريتزكارلتون' },
  'el mamlka': { en: 'EL MAMLKA TRADING & SUPPL (مؤسسة ملكة)', ar: 'مؤسسة ملكة للتوريدات' },
  'ملكة للتوريدات': { en: 'EL MAMLKA TRADING & SUPPL', ar: 'مؤسسة ملكة للتوريدات' },
  'al safy': { en: 'Al Safy Foods (الصفا للتوريدات)', ar: 'الصفا للتوريدات / الصافي' },
  'الصفا للتوريدات': { en: 'Al Safy Foods (الصفا للتوريدات)', ar: 'الصفا للتوريدات' },
  reach: { en: 'Reach Trading & Marketing', ar: 'ريتش للتجارة والتسويق (الشركة الدولية للتسويق)' },
  'ريتش': { en: 'Reach Trading & Marketing', ar: 'ريتش للتجارة والتسويق' },
  gelafco: { en: 'Gelafco Sittin Group Mamdouh Sittin', ar: 'جلافكو ستين جروب (ممدوح ستين)' },
  'جلافكو': { en: 'Gelafco Sittin Group Mamdouh Sittin', ar: 'جلافكو ستين جروب' },
  'egy swiss': { en: 'EGY Swiss Food Company', ar: 'إيجي سويس للصناعات الغذائية' },
  'egyptian co for advanced': { en: 'Egyptian Co. for Advanced Projects', ar: 'الشركة المصرية للمشروعات المتقدمة' },
  'egyptian arab group': { en: 'Egyptian Arab Group for Trade & Consulting', ar: 'المجموعة العربية المصرية للتجارة والاستشارات' },
  'egyptian industrial group': { en: 'Egyptian Industrial Group', ar: 'المجموعة الصناعية المصرية' },
  'el ansary': { en: 'EL ANSARY TRADING & CONTRACTING', ar: 'الأنصاري للتجارة والمقاولات' },
  ansary: { en: 'EL ANSARY TRADING & CONTRACTING', ar: 'الأنصاري للتجارة والمقاولات' },
  'samir heidar': { en: 'Samir Mohamed Ali Heidar', ar: 'سمير محمد علي حيدر' },
  'samir mohamed ali heidar': { en: 'Samir Mohamed Ali Heidar', ar: 'سمير محمد علي حيدر' },
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
  pepsi: { en: 'Pepsi Cola Egypt (Pepsi Coal)', ar: 'بيبسي كولا مصر' },
  'pepsi coal': { en: 'Pepsi Cola Egypt (Pepsi Coal)', ar: 'بيبسي كولا مصر' },
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
  'health insurance': { en: 'General Authority for Health Insurance', ar: 'الهيئة العامة للتأمين الصحي' },
  'misr spinning': { en: 'Misr Spinning & Weaving Trading Co.', ar: 'شركة مصر لتجارة الغزل والنسيج' },
  'غزل ونسيج': { en: 'Misr Spinning & Weaving Trading Co.', ar: 'شركة مصر لتجارة الغزل والنسيج' },
  'ehab fathy azab': { en: 'Ehab Fathy Azab (Laundry)', ar: 'إيهاب فتحي عزب (مغسلة)' },
  'ايهاب فتحي عزب': { en: 'Ehab Fathy Azab (Laundry)', ar: 'إيهاب فتحي عزب (مغسلة)' },
  'مغسلة': { en: 'Laundry Services (Ehab Fathy Azab)', ar: 'خدمات المغسلة وتبييض البياضات' },
  'fouad stationary': { en: 'Fouad Stationary', ar: 'فؤاد للقرطاسية والأدوات المكتبية' },
  'فؤاد للقرطاسية': { en: 'Fouad Stationary', ar: 'فؤاد للأدوات المكتبية والقرطاسية' },
  'idealogy': { en: 'Idealogy Co. for imp and Exp (IPool)', ar: 'شركة أيديولوجي للاستيراد والتصدير' },
  'el wafa': { en: 'El Wafa Group', ar: 'مجموعة الوفاق' },
  'الوفاق': { en: 'El Wafa Group / Wefaq Logistics', ar: 'مجموعة الوفاق / شركة الوفاق اللوجستية' },
  'wefaq': { en: 'Wefaq Logistics', ar: 'شركة الوفاق للخدمات اللوجستية' },
  'pharma scienta': { en: 'Pharma Scienta', ar: 'فارما سايبيتا' },
  'samira riachy': { en: 'Samira Riachy', ar: 'سميرة ريتشي (سانش)' },
  'syndicate cheques': { en: 'General Syndicate Cheques - Nile Ritz-Carlton', ar: 'شيكات النقابة العامة بفندق النيل ريتز كارلتون' },
  'نقابة ريتز كارلتون': { en: 'General Syndicate Cheques - Nile Ritz-Carlton', ar: 'شيكات النقابة العامة بفندق النيل ريتز كارلتون' },
  'xerox egypt': { en: 'Egypt Xerox', ar: 'زيروكس مصر' },
  'زيروكس': { en: 'Egypt Xerox', ar: 'زيروكس مصر' },
  'olio food': { en: 'Olio For Food Industry', ar: 'أوليو للصناعات الغذائية' },
  'أوليو': { en: 'Olio For Food Industry', ar: 'أوليو للصناعات الغذائية' },
  'al amal': { en: 'Al Amal Hotel Supplies Co.', ar: 'شركة الأمل للتوريدات الفندقية' },
  'aleman': { en: 'ALEman Corporation', ar: 'مؤسسة الإيمان' },
  'union trading': { en: 'Union Trading Company', ar: 'شركة التداول المتحدة / اليونيون' },
  'alfa trade': { en: 'Alfa Trade For General supplies', ar: 'ألفا تريد للتوريدات العامة' },
  'misr mostakbal': { en: 'Misr Mostakbal Co.', ar: 'شركة مصر المستقبل' },
  'office mix': { en: 'Office Mix on Line (COF001)', ar: 'أوفيس ميكس أون لاين' },
  'officemix': { en: 'Office Mix on Line (COF001)', ar: 'أوفيس ميكس أون لاين' },
  'omega': { en: 'Omega for Eng & Trading (COM002)', ar: 'أوميجا للهندسة والتجارة' },
  'nova': { en: 'Nova For General supplies (CNU008)', ar: 'نوفا للتوريدات العامة' },
  'nourd sea': { en: 'Nourd Sea For Imported (CNO006)', ar: 'نورد سي للاستيراد' },
  'essam gafar': { en: 'ESSAM GAFAR NAGDI AHMED (CES003)', ar: 'عصام جعفر نجدي أحمد' },
  'عصام جعفر': { en: 'ESSAM GAFAR NAGDI AHMED (CES003)', ar: 'عصام جعفر نجدي أحمد' },
  'daashousha': { en: 'Ali Gaber Ali Darwish - Daashousha (CAL013)', ar: 'علي جابر علي درويش (دعشوشة)' },
  'دعشوشة': { en: 'Ali Gaber Ali Darwish - Daashousha (CAL013)', ar: 'علي جابر علي درويش (دعشوشة)' },
  'دعشوشه': { en: 'Ali Gaber Ali Darwish - Daashousha (CAL013)', ar: 'علي جابر علي درويش (دعشوشة)' },
  'abdel rady': { en: 'Ahmed Hassan Abdel Rady Ahmed (CAH018)', ar: 'أحمد حسن عبد الراضي أحمد' },
  'عبد الراضي': { en: 'Ahmed Hassan Abdel Rady Ahmed (CAH018)', ar: 'أحمد حسن عبد الراضي أحمد' },
  'alexandria developing': { en: 'Alexandria For Developing & Trading (CAL008)', ar: 'الإسكندرية للتنمية والتجارة' },
  'alexandria supply': { en: 'Alexandria For Supply (CAL018)', ar: 'الإسكندرية للتوريدات' },
  'adgham': { en: 'Aly Ahmed Mohamed Ibrahim / Ali Adgham (CAL019)', ar: 'علي أحمد محمد إبراهيم / علي أدغم' },
  'الأدغم': { en: 'Aly Ahmed Mohamed Ibrahim / Ali Adgham (CAL019)', ar: 'علي أحمد محمد إبراهيم / علي أدغم' },
  'الادغم': { en: 'Aly Ahmed Mohamed Ibrahim / Ali Adgham (CAL019)', ar: 'علي أحمد محمد إبراهيم / علي أدغم' },
  'nineteen eighty four': { en: 'Nineteen Eighty Four (CNI002)', ar: '1984 - ناينتين إيتي فور' },
  'transit': { en: 'Nehad Mahrous Karim - Al Transit (CNE006)', ar: 'نهاد محروس كريم (الترانزيت)' },
  'الترانزيت': { en: 'Nehad Mahrous Karim - Al Transit (CNE006)', ar: 'نهاد محروس كريم (الترانزيت)' },
  'new optimal': { en: 'New optimual Technology (CNE007)', ar: 'نيو أوبتيمال تكنولوجي' },
  'nearest': { en: 'Nearest For Service & Sust. Develop (CNE008)', ar: 'نيرست للخدمات والتنمية المستدامة' },
  'nile radio': { en: 'Nile Radio production (CNI001)', ar: 'إنتاج راديو النيل' },
  'راديو النيل': { en: 'Nile Radio production (CNI001)', ar: 'إنتاج راديو النيل' },
  'pharmascienta': { en: 'PHARMASCIENTA (CPH001)', ar: 'فارما سايبيتا للأدوية' },
  'فارما سايبيتا': { en: 'PHARMASCIENTA (CPH001)', ar: 'فارما سايبيتا للأدوية' },
  'pack tec': { en: 'Pack - Tec 6 october (CPA002)', ar: 'باك تك 6 أكتوبر' },
  'green life': { en: 'Osama Kamel - Green Life (COS003)', ar: 'أسامة كامل عبد الفتاح (جرين لايف للتوريدات الفندقية)' },
  'جرين لايف': { en: 'Osama Kamel - Green Life (COS003)', ar: 'أسامة كامل عبد الفتاح (جرين لايف للتوريدات الفندقية)' },
  'port said supplies': { en: 'Port Said For Supplies (CPO002)', ar: 'بورسعيد للتوريدات' },
  'pwt': { en: 'PWT INTERNATIONAL (CPW001)', ar: 'بي دبليو تي إنترناشيونال' },
  'plan be': { en: 'Plan Be For Food & beverage (CPL001)', ar: 'بلان بي للأغذية والمشروبات' },
  'petro kima': { en: 'Petro Kima For Engineering & Contracting (CPE003)', ar: 'بترو كيما للهندسة والمقاولات' },
  'بتروكيما': { en: 'Petro Kima For Engineering & Contracting (CPE003)', ar: 'بترو كيما للهندسة والمقاولات' },
  'nile scan': { en: 'Nile Scan (CNI003)', ar: 'نايل سكان للأشعة والتحاليل' },
  'نايل سكان': { en: 'Nile Scan (CNI003)', ar: 'نايل سكان للأشعة والتحاليل' },
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

// Canonical Token Stemmer for Egyptian archive business names & abbreviations
export function canonicalBusinessToken(tok: string): string {
  let t = tok.toLowerCase().trim();
  if (!t) return '';
  // OCR typos
  if (t === 'coal') return 'cola';
  if (t === 'mostala') return 'mostafa';
  if (t === 'suppli_ing' || t === 'suppling' || t === 'supplying' || t === 'supplies' || t === 'suppl') return 'supply';
  // Prefixes & articles
  if (t === 'el') return 'al';
  // Common business contractions & stems
  if (t === 'trade' || t === 'trading' || t === 'tradin') return 'trade';
  if (t === 'dist' || t === 'distr' || t === 'distri' || t === 'distrib' || t === 'distribution') return 'distrib';
  if (t === 'indust' || t === 'industry' || t === 'industries' || t === 'industrial') return 'indust';
  if (t === 'imp' || t === 'import' || t === 'imports') return 'import';
  if (t === 'exp' || t === 'export' || t === 'exports') return 'export';
  if (t === 'impexp' || t === 'impexpor' || t === 'impexport') return 'impexp';
  if (t === 'int' || t === 'intl' || t === 'intel' || t === 'international') return 'intl';
  if (t === 'co' || t === 'company' || t === 'corp' || t === 'corporation') return 'co';
  if (t === 'agr' || t === 'agric' || t === 'agricultural' || t === 'agriculture') return 'agri';
  if (t === 'foo' || t === 'food' || t === 'foods') return 'food';
  if (t === 'contra' || t === 'contracting' || t === 'contract') return 'contract';
  if (t === 'marketi' || t === 'marketing' || t === 'market') return 'market';
  if (t === 'misr') return 'egypt';
  if (t === '&' || t === 'and') return 'and';
  return t;
}

export function extractCanonicalTokens(str: string): string[] {
  if (!str) return [];
  let s = str
    .replace(/foodbrand/gi, 'food brand')
    .replace(/foodindust/gi, 'food indust')
    .replace(/impexp/gi, 'imp exp')
    .replace(/&/g, ' and ');
  
  s = s.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, ' ');
  const rawTokens = s.split(/\s+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
  return rawTokens.map(canonicalBusinessToken);
}

export const KNOWN_EQUIVALENCE_CLUSTERS: string[][] = [
  ['al gezira', 'el gezira', 'gezira', 'الجزيرة'],
  ['al mostafa', 'al mostala', 'mostafa', 'mostala', 'المصطفى'],
  ['tiba', 'طيبة'],
  ['pepsi coal', 'pepsi cola', 'pepsi', 'بيبسي', 'كولا'],
  ['marina suppli_ing', 'marina suppling', 'marina', 'مارينا'],
  ['international co for agr', 'int co for agricultural', 'intel co for agric', 'الدولية للتنمية والإنتاج الزراعي', 'الشركة الدولية الزراعية'],
  ['international co for foo', 'international co for food', 'الدولية للصناعات الغذائية'],
  ['arabian co for foodindust', 'arabian co for food industries', 'domty', 'دومتي', 'العربية للصناعات الغذائية'],
  ['foodbrand', 'food brand', 'فود براند'],
  ['petro', 'petrotrade', 'بتروتريد', 'الخدمات التجارية البترولية', 'بترو'],
  ['ritz carlton', 'ritz', 'schiller', 'شيلار', 'الريتزكارلتون', 'ريتز'],
  ['el mamlka', 'mamlka', 'ملكة للتوريدات', 'مؤسسة ملكة', 'ملكة'],
  ['al safy', 'safy', 'الصفا للتوريدات', 'الصفا', 'الصافي'],
  ['reach trading marketing', 'reach', 'international trading marketing', 'ريتش للتجارة والتسويق', 'ريتش'],
  ['gelafco sittin group', 'gelafco', 'mamdouh sittin', 'mamd', 'جلافكو'],
  ['egy swiss food company', 'egy swiss', 'ايجي سويس'],
  ['egyptian co for advanced', 'egyptian co for advanced projects', 'المصرية للمشروعات المتقدمة'],
  ['egyptian arab group for t', 'egyptian arab group for trade', 'المجموعة العربية المصرية'],
  ['egyptian industrial group', 'المجموعة الصناعية المصرية'],
  ['el ansary trading contra', 'el ansary', 'al ansary', 'الأنصاري'],
  ['el badr for trading dist', 'el badr', 'al badr', 'البدر'],
  ['al mansour co for trading', 'al mansour', 'المنصور'],
  ['amico of egypt', 'amico', 'أميكو'],
  ['arma trading', 'arma', 'أرما'],
  ['ayman afandy', 'أيمن أفندي'],
  ['bagheera', 'باغيرا', 'باجيرا'],
  ['beirut co dairy cheese', 'beirut co', 'شركة بيروت'],
  ['cairo three', 'كايرو ثري'],
  ['farm cheese', 'فارم تشيز'],
  ['food box for supplies', 'food box', 'فود بوكس'],
  ['food house for food indus', 'food house', 'فود هاوس'],
  ['food master', 'food master', 'فود ماستر'],
  ['food staff trading', 'food staff', 'فود ستاف'],
  ['gulf group trading dist', 'gulf group', 'مجموعة الخليج'],
  ['h g co for investment', 'h g co', 'h g', 'إتش جي'],
  ['halwani bros co', 'halwani', 'حلواني إخوان'],
  ['hero for food industries', 'hero', 'هيرو'],
  ['moura for food industry', 'moura', 'مورا'],
  ['samir mohamed ali heidar', 'سمير محمد علي حيدر'],
  ['the arabic house for supp', 'the arabic house', 'البيت العربي'],
];

export function checkClusterMatch(targetText: string, searchQuery: string): boolean {
  if (!targetText || !searchQuery) return false;
  const normT = targetText.toLowerCase();
  const normQ = searchQuery.toLowerCase();
  for (const cluster of KNOWN_EQUIVALENCE_CLUSTERS) {
    const tMatches = cluster.some((item) => normT.includes(item));
    const qMatches = cluster.some((item) => normQ.includes(item));
    if (tMatches && qMatches) {
      return true;
    }
  }
  return false;
}

const STOP_TOKENS = new Set(['for', 'and', 'the', 'and', 'و', 'في', 'من', 'co', 'company', 'corp']);

export function checkTokenSubsetMatch(targetText: string, searchQuery: string): boolean {
  if (!targetText || !searchQuery) return false;
  const tTokens = extractCanonicalTokens(targetText).filter((t) => !STOP_TOKENS.has(t) && t.length >= 2);
  const qTokens = extractCanonicalTokens(searchQuery).filter((t) => !STOP_TOKENS.has(t) && t.length >= 2);

  if (qTokens.length === 0 || tTokens.length === 0) return false;

  const allQInT = qTokens.every((qt) => tTokens.includes(qt));
  if (allQInT) return true;

  const allTInQ = tTokens.every((tt) => qTokens.includes(tt));
  if (allTInQ) return true;

  const common = qTokens.filter((qt) => tTokens.includes(qt));
  if (common.length >= 2 && (common.length / Math.min(qTokens.length, tTokens.length)) >= 0.6) {
    return true;
  }

  return false;
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

  // 4. Known Equivalence Cluster Match
  if (checkClusterMatch(targetText, searchQuery)) {
    return true;
  }

  // 5. Canonical Token Subset Match
  if (checkTokenSubsetMatch(targetText, searchQuery)) {
    return true;
  }

  // 6. Dictionary Alias Cross-Matching
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

    // Check Known Equivalence Cluster Match
    if (kwScore === 0 && checkClusterMatch(record.supplierName, kw)) {
      kwScore = Math.max(kwScore, 950);
      kwField = 'supplierCluster';
      if (!matchType) matchType = 'exact-supplier';
    }

    // Check Canonical Token Match
    if (kwScore === 0 && checkTokenSubsetMatch(record.supplierName, kw)) {
      kwScore = Math.max(kwScore, 850);
      kwField = 'supplierCanonical';
      if (!matchType) matchType = 'supplier-word';
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

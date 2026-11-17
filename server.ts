import express from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Parse port from process arguments or environment
const portArgIndex = process.argv.indexOf('--port');
const hostArgIndex = process.argv.indexOf('--host');
const cliPort = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? parseInt(process.argv[portArgIndex + 1], 10) : NaN;
const cliHost = hostArgIndex !== -1 && process.argv[hostArgIndex + 1] ? process.argv[hostArgIndex + 1] : undefined;

const PORT = !isNaN(cliPort) ? cliPort : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
const HOST = cliHost || process.env.HOST || '0.0.0.0';

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

function safeParseAiJson<T = any>(rawText: string | undefined | null): T | null {
  if (!rawText || typeof rawText !== 'string') return null;
  const cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// Initialize Google GenAI client (User-Agent header required by skill)
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', hasGeminiKey: Boolean(process.env.GEMINI_API_KEY) });
});

app.post('/api/test-post', (req, res) => {
  res.json({ received: req.body });
});

// Comprehensive Archive Heuristic Intent Interpreter
function buildHeuristicAiSearch(query: string) {
  const q = query.toLowerCase().trim();
  let targetBoxNumber: number | null = null;
  let targetYear: number | null = null;
  let fileType: 'check' | 'doc' | 'all' = 'all';

  const boxMatch = q.match(/(?:صندوق|صندوق\s*رقم|box|box-)\s*([0-9]+)/i);
  if (boxMatch) {
    targetBoxNumber = parseInt(boxMatch[1], 10);
  }

  const yearMatch = q.match(/\b(2016|2017|2019|2021)\b/);
  if (yearMatch) {
    targetYear = parseInt(yearMatch[1], 10);
  }

  if (q.includes('شيك') || q.includes('check') || q.includes('cheque')) {
    fileType = 'check';
  } else if (q.includes('سند') || q.includes('مستند') || q.includes('doc')) {
    fileType = 'doc';
  }

  // 2016 Core Archive Mappings
  if (q.includes('غزل') || q.includes('نسيج') || q.includes('spinning') || q.includes('weaving')) {
    return {
      targetSupplierName: 'Misr Spinning & Weaving Trading Co. (شركة مصر لتجارة الغزل والنسيج)',
      alternateSearchTerms: ['Misr Spinning', 'الغزل والنسيج', 'شركة مصر للغزل'],
      targetBoxNumber: targetBoxNumber || 101,
      targetYear: targetYear || 2016,
      fileType,
      directAnswerAr: 'تتواجد ملفات ومستندات شركة مصر لتجارة الغزل والنسيج في صندوق 1 لسنة 2016، الملف رقم 1.',
      suggestedQueries: ['صندوق 1 2016', 'سنة 2016', 'الأمل للتوريدات الفندقية'],
    };
  }

  if (q.includes('مغسل') || q.includes('عزب') || q.includes('laundry')) {
    return {
      targetSupplierName: 'Ehab Fathy Azab - Laundry (إيهاب فتحي عزب - مغسلة)',
      alternateSearchTerms: ['Ehab Fathy Azab', 'Laundry', 'إيهاب عزب', 'مغسلة'],
      targetBoxNumber: targetBoxNumber || 104,
      targetYear: targetYear || 2016,
      fileType,
      directAnswerAr: 'تتواجد مستندات وحسابات المغسلة للمورد إيهاب فتحي عزب في صندوق 4 لسنة 2016، الملف 1 و 9 و 28.',
      suggestedQueries: ['صندوق 4 2016', 'اليونيون 2016', 'مؤسسة الإيمان'],
    };
  }

  if (q.includes('ايديولوجي') || q.includes('أيديولوجي') || q.includes('idealogy')) {
    return {
      targetSupplierName: 'Idealogy Co. for imp and Exp (شركة أيديولوجي للاستيراد والتصدير)',
      alternateSearchTerms: ['Idealogy', 'IPool', 'أيديولوجي'],
      targetBoxNumber: targetBoxNumber || 102,
      targetYear: targetYear || 2016,
      fileType,
      directAnswerAr: 'تتواجد مستندات شركة أيديولوجي للاستيراد والتصدير في صندوق 2 لسنة 2016، الظرف 1 (مستند رقم 1234).',
      suggestedQueries: ['صندوق 2 2016', 'محمد عزيز صراف عام', 'مخازن المخابز المصرية'],
    };
  }

  if (q.includes('الوفاق') || q.includes('wefaq') || q.includes('wafa')) {
    return {
      targetSupplierName: 'El Wafa Group / Wefaq Logistics (مجموعة الوفاق)',
      alternateSearchTerms: ['El Wafa Group', 'Wefaq Logistics', 'مجموعة الوفاق', 'CWA 005'],
      targetBoxNumber: targetBoxNumber || 106,
      targetYear: targetYear || 2016,
      fileType,
      directAnswerAr: 'تتواجد مستندات وفواتير مجموعة الوفاق في صندوق 6 لسنة 2016، الملف رقم 1 (سند CWA 005).',
      suggestedQueries: ['صندوق 6 2016', 'المتحدة للأغذية', 'ماريوت القاهرة'],
    };
  }

  if (q.includes('قرطاسي') || q.includes('فؤاد') || q.includes('fouad stationary')) {
    return {
      targetSupplierName: 'Fouad Stationary (فؤاد للأدوات المكتبية والقرطاسية)',
      alternateSearchTerms: ['Fouad Stationary', 'فؤاد للقرطاسية', 'CFO 002'],
      targetBoxNumber: targetBoxNumber || 103,
      targetYear: targetYear || 2016,
      fileType,
      directAnswerAr: 'تتواجد مستندات فؤاد للقرطاسية في صندوق 3 وصندوق 7 لسنة 2016، الظرف 1 (سند CFO 002).',
      suggestedQueries: ['صندوق 3 2016', 'صندوق 7 2016', 'زيروكس مصر'],
    };
  }

  if (q.includes('نقاب') || q.includes('تأمين صحي') || q.includes('syndicate') || q.includes('riachy')) {
    return {
      targetSupplierName: 'شيكات النقابة العامة والتأمين الصحي فندق النيل ريتز كارلتون',
      alternateSearchTerms: ['General Syndicate', 'Health Insurance', 'Samira Riachy', 'نقابة', 'تأمين صحي'],
      targetBoxNumber: targetBoxNumber || 107,
      targetYear: targetYear || 2016,
      fileType: 'check',
      directAnswerAr: 'تتواجد شيكات ومستندات النقابة العامة والتأمين الصحي في صندوق 7 لسنة 2016.',
      suggestedQueries: ['صندوق 7 2016', 'نقابة التجاريين', 'تكنو برنت'],
    };
  }

  if (q.includes('زيروكس') || q.includes('xerox')) {
    return {
      targetSupplierName: 'Xerox Egypt (زيروكس مصر)',
      alternateSearchTerms: ['Xerox Egypt', 'زيروكس', 'زيروكس مصر', 'Xerox'],
      targetBoxNumber: targetBoxNumber || 108,
      targetYear: targetYear || 2016,
      fileType,
      directAnswerAr: 'تتواجد مستندات وفواتير شركة زيروكس مصر (Xerox Egypt) في صندوق 8 لسنة 2016 (الظروف 1 إلى 4).',
      suggestedQueries: ['صندوق 8 2016', 'فواتير زيروكس', 'سنة 2016'],
    };
  }

  if (q.includes('اوليو') || q.includes('أوليو') || q.includes('olio')) {
    return {
      targetSupplierName: 'Olio Food Products (أوليو للمنتجات الغذائية)',
      alternateSearchTerms: ['Olio Food', 'اوليو', 'أوليو', 'Olio'],
      targetBoxNumber: targetBoxNumber || 109,
      targetYear: targetYear || 2016,
      fileType,
      directAnswerAr: 'تتواجد مستندات وفواتير شركة أوليو للمنتجات الغذائية في صندوق 9 لسنة 2016 (الظروف 1 إلى 4).',
      suggestedQueries: ['صندوق 9 2016', 'أوليو للأغذية', 'سنة 2016'],
    };
  }

  if (q.includes('دومتي') || q.includes('domty')) {
    return {
      targetSupplierName: 'دومتي (Arabian Co For Food Industries)',
      alternateSearchTerms: ['Domty', 'Arabian Co', 'دومتي', 'CAR001'],
      targetBoxNumber: targetBoxNumber || 13,
      targetYear: targetYear || 2021,
      fileType,
      directAnswerAr: 'تتواجد شيكات ومستندات شركة دومتي (Arabian Co For Food Industries) في الصندوق 13، الظرف 4 (كود المستند: CAR001).',
      suggestedQueries: ['شيكات صندوق 13', 'أميكو مصر', 'الأنصاري للتجارة'],
    };
  }

  if (q.includes('بترو') || q.includes('بتروتريد') || q.includes('petro')) {
    return {
      targetSupplierName: 'شركة الخدمات التجارية البترولية - بتروتريد',
      alternateSearchTerms: ['Petrotrade', 'PETRO', 'بتروتريد', 'بترول'],
      targetBoxNumber: targetBoxNumber || 11,
      targetYear: targetYear || 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات شركة الخدمات التجارية البترولية (بتروتريد) في الصندوق 11، الظرف 23.',
      suggestedQueries: ['صندوق 11', 'الريتزكارلتون', 'هيرو للأغذية'],
    };
  }

  if (q.includes('بيبسي') || q.includes('pepsi') || q.includes('كولا')) {
    return {
      targetSupplierName: 'Pepsi Cola Misr (بيبسي كولا)',
      alternateSearchTerms: ['Pepsi Coal Egypt', 'Pepsi Cola', 'بيبسي', 'كولا'],
      targetBoxNumber: targetBoxNumber || 12,
      targetYear: targetYear || 2019,
      fileType,
      directAnswerAr: 'تتواجد مستندات وشيكات بيبسي كولا مصر في الصندوق 12، الظرف 8 (مسجلة باسم Pepsi Coal Egypt لسنة 2019).',
      suggestedQueries: ['شيكات 2019', 'صندوق 12', 'فلاور باور'],
    };
  }

  if (q.includes('الجزيرة') || q.includes('gezira')) {
    return {
      targetSupplierName: 'El Gezira For Import & Export (الجزيرة)',
      alternateSearchTerms: ['El Gezira For Import & Export', 'Al Gezira', 'الجزيرة', 'CGE008'],
      targetBoxNumber: targetBoxNumber || 7,
      targetYear: targetYear || 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات الجزيرة للاستيراد والتصدير في الصندوق 7، الظرف 2 (سند CGE008).',
      suggestedQueries: ['صندوق 7', 'حلواني إخوان', 'فود براند'],
    };
  }

  if (q.includes('طيبة') || q.includes('tiba')) {
    return {
      targetSupplierName: 'Tiba for Trading and Distribution (طيبة)',
      alternateSearchTerms: ['Tiba for Trading and Distribution', 'طيبة', 'Tiba'],
      targetBoxNumber: targetBoxNumber || 4,
      targetYear: targetYear || 2017,
      fileType,
      directAnswerAr: 'الصندوق 4 مخصص بالكامل لمستندات شركة طيبة للتجارة والتوزيع (Tiba) - الظرف 3.',
      suggestedQueries: ['صندوق 4', 'مستندات 2017', 'شيكات طيبة'],
    };
  }

  if (q.includes('مارينا') || q.includes('marina')) {
    return {
      targetSupplierName: 'MARINA SUPPLI_ING (مارينا للتوريدات)',
      alternateSearchTerms: ['MARINA SUPPLI_ING', 'Marina Suppling', 'مارينا', 'CMA002'],
      targetBoxNumber: targetBoxNumber || 6,
      targetYear: targetYear || 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات شركة مارينا للتوريدات في الصندوق 6، الظرف 25 (سند CMA002).',
      suggestedQueries: ['صندوق 6', 'الصفا للتوريدات', 'مؤسسة ملكة'],
    };
  }

  if (q.includes('المصطفى') || q.includes('mostafa') || q.includes('mostala')) {
    return {
      targetSupplierName: 'Al Mostafa for Trading & Supplies (المصطفى)',
      alternateSearchTerms: ['Al Mostafa for Trading & Supplies', 'AL MOSTALA', 'المصطفى', 'CMO001'],
      targetBoxNumber: targetBoxNumber || 5,
      targetYear: targetYear || 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات المصطفى للتجارة والتوريدات في الصندوق 5، الظرف 23 (سند CMO001).',
      suggestedQueries: ['صندوق 5', 'مورا للأغذية', 'ميراكو كاريير'],
    };
  }

  // Box 16 Suppliers Mappings (2017)
  if (q.includes('دعشوشة') || q.includes('دعشوشه') || q.includes('علي جابر') || q.includes('cal013')) {
    return {
      targetSupplierName: 'Ali Gaber Ali Darwish (دعشوشة)',
      alternateSearchTerms: ['Ali Gaber Ali Darwish', 'دعشوشة', 'CAL013'],
      targetBoxNumber: 16,
      targetYear: 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات وشيكات علي جابر علي درويش (دعشوشة) في الصندوق 16، الملف رقم 7 (كود المورد: CAL013).',
      suggestedQueries: ['صندوق 16', 'شيكات صندوق 16', 'الأدغم'],
    };
  }

  if (q.includes('الأدغم') || q.includes('الادغم') || q.includes('علي أدغم') || q.includes('adgham') || q.includes('cal019')) {
    return {
      targetSupplierName: 'Aly Ahmed Mohamed Ibrahim / Ali Adgham (الأدغم)',
      alternateSearchTerms: ['Ali Adgham', 'الأدغم', 'CAL019'],
      targetBoxNumber: 16,
      targetYear: 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات علي أحمد محمد إبراهيم / علي أدغم في الصندوق 16، الملف رقم 11 (كود المورد: CAL019).',
      suggestedQueries: ['صندوق 16', 'دعشوشة', 'الترانزيت'],
    };
  }

  if (q.includes('ترانزيت') || q.includes('الترانزيت') || q.includes('نهاد محروس') || q.includes('cne006')) {
    return {
      targetSupplierName: 'Nehad Mahrous Karim (الترانزيت)',
      alternateSearchTerms: ['Nehad Mahrous Karim', 'الترانزيت', 'CNE006'],
      targetBoxNumber: 16,
      targetYear: 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات نهاد محروس كريم (الترانزيت) في الصندوق 16، الملف رقم 14 (كود المورد: CNE006).',
      suggestedQueries: ['صندوق 16', 'جرين لايف', 'نايل سكان'],
    };
  }

  if (q.includes('جرين لايف') || q.includes('أسامة كامل') || q.includes('green life') || q.includes('cos003')) {
    return {
      targetSupplierName: 'Osama Kamel Abdel Fattah (جرين لايف للتوريدات الفندقية)',
      alternateSearchTerms: ['Green Life', 'جرين لايف', 'COS003', 'أسامة كامل'],
      targetBoxNumber: 16,
      targetYear: 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات أسامة كامل عبد الفتاح (جرين لايف للتوريدات الفندقية) في الصندوق 16، الملف رقم 20 (كود: COS003).',
      suggestedQueries: ['صندوق 16', 'نايل سكان', 'بتروكيما'],
    };
  }

  if (q.includes('نايل سكان') || q.includes('nile scan') || q.includes('cni003')) {
    return {
      targetSupplierName: 'Nile Scan (نايل سكان)',
      alternateSearchTerms: ['Nile Scan', 'نايل سكان', 'CNI003'],
      targetBoxNumber: 16,
      targetYear: 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات نايل سكان (Nile Scan) في الصندوق 16، الملف رقم 25 (كود: CNI003).',
      suggestedQueries: ['صندوق 16', 'بتروكيما', 'بلان بي'],
    };
  }

  if (q.includes('بتروكيما') || q.includes('بترو كيما') || q.includes('petro kima') || q.includes('cpe003')) {
    return {
      targetSupplierName: 'Petro Kima For Engineering & Contracting (بترو كيما)',
      alternateSearchTerms: ['Petro Kima', 'بتروكيما', 'CPE003'],
      targetBoxNumber: 16,
      targetYear: 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات شركة بترو كيما للهندسة والمقاولات في الصندوق 16، الملف رقم 24 (كود: CPE003).',
      suggestedQueries: ['صندوق 16', 'نايل سكان', 'بورسعيد للتوريدات'],
    };
  }

  if (q.includes('office mix') || q.includes('أوفيس ميكس') || q.includes('cof001')) {
    return {
      targetSupplierName: 'Office Mix on Line (أوفيس ميكس)',
      alternateSearchTerms: ['Office Mix', 'أوفيس ميكس', 'COF001'],
      targetBoxNumber: 16,
      targetYear: 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات أوفيس ميكس (Office Mix on Line) في الصندوق 16، الملف رقم 1 (كود: COF001).',
      suggestedQueries: ['صندوق 16', 'أوميجا', 'نوفا للتوريدات'],
    };
  }

  if (q.includes('ريتز') || q.includes('شيلار') || q.includes('ritz') || q.includes('carlton')) {
    return {
      targetSupplierName: 'فندق الريتزكارلتون / شركة شيلار',
      alternateSearchTerms: ['Ritz Carlton', 'Schiller', 'حياه النقابة العامة بفندق الريتزكارلتون', 'شيلار'],
      targetBoxNumber: targetBoxNumber || 11,
      targetYear: targetYear || 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات فندق الريتزكارلتون وشركة شيلار في الصندوق 11، الظرف 18.',
      suggestedQueries: ['صندوق 11', 'بتروتريد', 'صيدناوي'],
    };
  }

  if (q.includes('ملكة') || q.includes('mamlka')) {
    return {
      targetSupplierName: 'مؤسسة ملكة للتوريدات',
      alternateSearchTerms: ['EL MAMLKA TRADING & SUPPL', 'Magda Tawfiek Hussien', 'ملكة', 'CMA018'],
      targetBoxNumber: targetBoxNumber || 6,
      targetYear: targetYear || 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات مؤسسة ملكة للتوريدات في الصندوق 6، الظرف 39 (سند CMA018).',
      suggestedQueries: ['صندوق 6', 'مارينا للتوريدات', 'الشركة الدولية للأغذية'],
    };
  }

  if (q.includes('الصفا') || q.includes('safy')) {
    return {
      targetSupplierName: 'الصفا للتوريدات (Al Safy Foods)',
      alternateSearchTerms: ['Al Safy Foods', 'Manal A-Fatah Soliman', 'الصفا', 'CMA024'],
      targetBoxNumber: targetBoxNumber || 6,
      targetYear: targetYear || 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات الصفا للتوريدات في الصندوق 6، الظرف 36 (سند CMA024).',
      suggestedQueries: ['صندوق 6', 'مؤسسة ملكة', 'الشركة الدولية للزراعة'],
    };
  }

  if (q.includes('حلواني') || q.includes('halwani')) {
    return {
      targetSupplierName: 'Halwani Bros Co (حلواني إخوان)',
      alternateSearchTerms: ['Halwani Bros Co', 'حلواني إخوان', 'CHA003'],
      targetBoxNumber: targetBoxNumber || 7,
      targetYear: targetYear || 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات حلواني إخوان في الصندوق 7، الظرف 17 (سند CHA003).',
      suggestedQueries: ['صندوق 7', 'فود براند', 'الجزيرة'],
    };
  }

  if (q.includes('ايجي سويس') || q.includes('إيجي سويس') || q.includes('egy swiss')) {
    return {
      targetSupplierName: 'Egy Swiss Food Company (إيجي سويس)',
      alternateSearchTerms: ['Egy Swiss Food Company', 'إيجي سويس', 'CEG001'],
      targetBoxNumber: targetBoxNumber || 3,
      targetYear: targetYear || 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات إيجي سويس للأغذية في الصندوق 3، الظرف 2 (سند CEG001).',
      suggestedQueries: ['صندوق 3', 'فارم تشيز', 'المجموعة الصناعية المصرية'],
    };
  }

  if (q.includes('فارم تشيز') || q.includes('farm cheese')) {
    return {
      targetSupplierName: 'Farm Cheese (فارم تشيز)',
      alternateSearchTerms: ['Farm Cheese', 'فارم تشيز', 'CFA001'],
      targetBoxNumber: targetBoxNumber || 3,
      targetYear: targetYear || 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات فارم تشيز في الصندوق 3، الظرف 4 (سند CFA001).',
      suggestedQueries: ['صندوق 3', 'إيجي سويس', 'المصرية للمشروعات المتقدمة'],
    };
  }

  if (q.includes('اميكو') || q.includes('أميكو') || q.includes('amico')) {
    return {
      targetSupplierName: 'Amico Of Egypt (أميكو مصر)',
      alternateSearchTerms: ['Amico Of Egypt', 'أميكو مصر', 'أميكو'],
      targetBoxNumber: targetBoxNumber || 13,
      targetYear: targetYear || 2017,
      fileType,
      directAnswerAr: 'تتواجد شيكات ومستندات شركة أميكو مصر (Amico Of Egypt) في الصندوق 13، الظرف 2.',
      suggestedQueries: ['أميكو مصر', 'دومتي', 'صندوق 13'],
    };
  }

  if (q.includes('المنصور') || q.includes('mansour')) {
    return {
      targetSupplierName: 'Al Mansour Co. For Trading (المنصور للتجارة والتوزيع)',
      alternateSearchTerms: ['Al Mansour Co. For Trading', 'المنصور للتجارة', 'المنصور'],
      targetBoxNumber: targetBoxNumber || 10,
      targetYear: targetYear || 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات شركة المنصور للتجارة والتوزيع (Al Mansour) في الصندوق 10، الظرف 14.',
      suggestedQueries: ['المنصور', 'TM Fashion', 'صندوق 10'],
    };
  }

  if (q.includes('النور') || q.includes('el nour') || q.includes('elnour')) {
    return {
      targetSupplierName: 'شركة النور للخضروات والفاكهة (El Nour Vegetables & Fruits)',
      alternateSearchTerms: ['El Nour', 'النور للخضروات', 'النور', 'El Nour Vegetable & Fruits'],
      targetBoxNumber: targetBoxNumber || null,
      targetYear: targetYear || null,
      fileType,
      directAnswerAr: 'مورد "النور للخضروات والفاكهة / El Nour" مرتبط باسمه في الصندوق 9، والصندوق 17، والصندوق 19 (ملف #10 وملف #19).',
      suggestedQueries: ['النور', 'القبيصي', 'عمرو عطية'],
    };
  }

  if (q.includes('اوراسكوم') || q.includes('أوراسكوم') || q.includes('orascom')) {
    return {
      targetSupplierName: 'Orascom Trading (أوراسكوم للتجارة)',
      alternateSearchTerms: ['Orascom Trading', 'أوراسكوم للتجارة', 'Orascom', 'أوراسكوم'],
      targetBoxNumber: targetBoxNumber || 19,
      targetYear: targetYear || 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات شركة أوراسكوم للتجارة (Orascom Trading) في الصندوق 19، الملف رقم 8 (سنة 2017).',
      suggestedQueries: ['Orascom', 'أورينت للتأمين', 'صندوق 19'],
    };
  }

  if (q.includes('اورينت') || q.includes('أورينت') || q.includes('orient')) {
    return {
      targetSupplierName: 'Orient Takaful Insurance (أورينت للتأمين التكافلي)',
      alternateSearchTerms: ['Orient Takaful Insurance', 'أورينت للتأمين', 'Orient'],
      targetBoxNumber: targetBoxNumber || 19,
      targetYear: targetYear || 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات أورينت للتأمين التكافلي (Orient Takaful Insurance) في الصندوق 19، الملف رقم 9 (سنة 2017).',
      suggestedQueries: ['Orient Takaful', 'أوراسكوم', 'صندوق 19'],
    };
  }

  if (q.includes('عمرو عطية') || q.includes('عمرو عطيه') || q.includes('amro attia') || q.includes('الهنا')) {
    return {
      targetSupplierName: 'Amro Attia Hassan Mohamed / الهنا للخضروات (El Hana)',
      alternateSearchTerms: ['Amro Attia Hassan Mohamed', 'عمرو عطية حسن', 'الهنا للخضروات', 'Amro Attia'],
      targetBoxNumber: targetBoxNumber || null,
      targetYear: targetYear || null,
      fileType,
      directAnswerAr: 'مستندات المورد عمرو عطية حسن محمد (الهنا للخضروات والفاكهة) مرتبطة باسمه في الصندوق 2 والصندوق 19 (ملف #11 وملف #13) وصندوق 2 لسنة 2016.',
      suggestedQueries: ['عمرو عطية', 'النور للخضروات', 'صندوق 19'],
    };
  }

  if (q.includes('محمد عزيز') || q.includes('mohamed aziz') || q.includes('moh aziz')) {
    return {
      targetSupplierName: 'Mohamed Aziz (محمد عزيز - الصراف العام)',
      alternateSearchTerms: ['Mohamed Aziz', 'Moh Aziz', 'محمد عزيز'],
      targetBoxNumber: targetBoxNumber || null,
      targetYear: targetYear || null,
      fileType,
      directAnswerAr: 'المورد محمد عزيز (Mohamed Aziz / Moh Aziz) مرتبط باسمه عبر عدة صناديق: الصندوق 1، والصندوق 16، والصندوق 17، وصندوق 2 لسنة 2016.',
      suggestedQueries: ['محمد عزيز', 'صندوق 17', 'صندوق 16'],
    };
  }

  if (q.includes('نادرة') || q.includes('نادره') || q.includes('nadra') || q.includes('البركة')) {
    return {
      targetSupplierName: 'Nadra Ibrahim Ahmed (نادرة إبراهيم أحمد)',
      alternateSearchTerms: ['Nadra Ibrahim Ahmed', 'نادرة إبراهيم', 'البركة'],
      targetBoxNumber: targetBoxNumber || null,
      targetYear: targetYear || null,
      fileType,
      directAnswerAr: 'السجلات المرتبطة باسم نادرة إبراهيم أحمد موجودة في الصندوق 18 (ملف #5) والصندوق 19 (ملف #17).',
      suggestedQueries: ['نادرة إبراهيم', 'صندوق 18', 'صندوق 19'],
    };
  }

  if (q.includes('علي التوني') || q.includes('التوني') || q.includes('el tony') || q.includes('tony')) {
    return {
      targetSupplierName: 'Ali Ali El Tony (علي علي التوني)',
      alternateSearchTerms: ['Ali Ali El Tony', 'علي علي التوني', 'El Tony'],
      targetBoxNumber: targetBoxNumber || null,
      targetYear: targetYear || null,
      fileType,
      directAnswerAr: 'سجلات المورد علي علي التوني (Ali Ali El Tony) مرتبطة باسمه في الصندوق 19 (ملف #5) وصندوق 5 لسنة 2016.',
      suggestedQueries: ['علي علي التوني', 'صندوق 19', 'صندوق 5 2016'],
    };
  }

  if (q.includes('نور الهدى') || q.includes('nour al huda') || q.includes('الأسماك')) {
    return {
      targetSupplierName: 'Nour Al Huda (نور الهدى لتجارة الأسماك)',
      alternateSearchTerms: ['Nour Al Huda', 'نور الهدى', 'نور الهدى للأسماك'],
      targetBoxNumber: targetBoxNumber || 19,
      targetYear: targetYear || 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات نور الهدى لتجارة الأسماك (Nour Al Huda) في الصندوق 19، الملف رقم 14.',
      suggestedQueries: ['نور الهدى', 'الإخلاص', 'صندوق 19'],
    };
  }

  if (q.includes('تيبس') || q.includes('tips') || q.includes('عاملين') || q.includes('عمال')) {
    return {
      targetSupplierName: 'مستندات العاملين والتيبس (TIP\'S)',
      alternateSearchTerms: ['TIP\'S', 'تيبس', 'العاملين', 'رواتب'],
      targetBoxNumber: targetBoxNumber || (q.includes('8') ? 8 : 1),
      targetYear: 2017,
      fileType,
      directAnswerAr: 'تتوزع مستندات التيبس TIP\'S بين الصندوق 1 (شيكات ومستندات صرف) والصندوق 8 (مستندات عاملي التيبس 2017).',
      suggestedQueries: ['صندوق 1', 'صندوق 8', 'شيكات 2017'],
    };
  }

  if (q.includes('كاجوال') || q.includes('casual') || q.includes('خضار') || q.includes('عصير')) {
    return {
      targetSupplierName: 'مستندات الخضار والعصائر والكاجوال',
      alternateSearchTerms: ['كاجوال', 'خضار', 'عصير', 'القبيصي', 'النور'],
      targetBoxNumber: targetBoxNumber || 9,
      targetYear: 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات ومصاريف الخضار والعصير ومصاريف الكاجوال لعام 2017 في الصندوق 9، ومصاريف كاجوال 2019 في الصندوق 12.',
      suggestedQueries: ['صندوق 9', 'صندوق 12', 'القبيصي'],
    };
  }

  if (targetBoxNumber) {
    const boxDescriptions: Record<number, string> = {
      1: 'الصندوق 1 يحتوي على شيكات ومستندات عام 2017 (CEMO، محمد عزيز، تيبس TIP\'S).',
      2: 'الصندوق 2 يحتوي على موردين متنوعين لعام 2017 (سمير محمد علي حيدر، عمرو عطية، منير مكار، عصام جعفر).',
      3: 'الصندوق 3 يحتوي على موردين رئيسيين 2017 (إيجي سويس، فارم تشيز، المجموعة الصناعية المصرية، كلاريتي).',
      4: 'الصندوق 4 مخصص بالكامل لشركة طيبة للتجارة والتوزيع 2017 (Tiba).',
      5: 'الصندوق 5 يحتوي على موردين 2017 (المصطفى للتجارة، مورا، ميراكو كاريير، مصر للتأمين).',
      6: 'الصندوق 6 يحتوي على موردين 2017 (مارينا، الصفا، مؤسسة ملكة، الشركة الدولية للزراعة، ريتش).',
      7: 'الصندوق 7 يحتوي على موردين أغذية 2017 (الجزيرة، حلواني إخوان، فود براند، جلافكو، فود هاوس).',
      8: 'الصندوق 8 مخصص لمستندات عاملي التيبس TIP\'S لعام 2017.',
      9: 'الصندوق 9 يحتوي على مستندات الخضار والعصير ومصاريف كاجوال 2017.',
      10: 'الصندوق 10 يحتوي على موردين 2017 (المنصور للتجارة والتوزيع، شريف إبراهيم، TM Fashion).',
      11: 'الصندوق 11 يحتوي على مصاريف وجهات حكومية وفندق 2017 (بتروتريد، هيرو، الريتزكارلتون/شيلار، التأمينات).',
      12: 'الصندوق 12 يحتوي على شيكات ومستندات 2019 (بيبسي كولا، فلاور باور، كاجوال).',
      13: 'الصندوق 13 يحتوي على موردين وشيكات 2017 (دومتي، أميكو، الأنصاري، بيروت للألبان، كايرو ثري، أرما).',
      14: 'الصندوق 14 يحتوي على مستندات وشيكات عامة لعام 2017.',
      15: 'الصندوق 15 يحتوي على 16 مورد وشيكات ومستندات 2017 (بيبسي كولا، أ تو زي دبي، عادل زكي، أحمد سعيد، سحر موريس، كوانتا، نستله وترز الجبيليين، نالكو مصر، مامبيا مصر، يوروبيان بارادايس، نستله ووتر، بورسعيد سودانكو، سامو، بترو، برايم فودز، سحر موريس الوطنية للتوريدات).',
      16: 'الصندوق 16 يحتوي على 25 مورد وشيكات ومستندات 2017 (Office Mix, دعشوشة, الأدغم, الترانزيت, جرين لايف, نايل سكان, بتروكيما, فارما سايبيتا).',
      17: 'الصندوق 17 يحتوي على 16 مورد وشيكات ومستندات 2017 و 2016 (برو ميديا، ألفا، أحمد مجدي، محمد عزيز، النور، مؤسسة الأهرام، بست لخامات الأغذية، نو باجز، العابدين، عبده عرب، شركة المشروم، كاجوال، خيام نصار، المحمدي).',
      18: 'الصندوق 18 يحتوي على 16 مورد وشيكات ومستندات 2017 و 2016 (نيو لاين للتوريدات، منير ناصيف هركوس، الشركة الاتحادية لتجارة الأسماك، أعلام النصر، نادرة إبراهيم داود البرانسي، الأهرام للاستيراد وتصدير جرام، موستانج ليموزين، شركة المشروم، بود إيجيبت، الشروق الجديدة، المحمدي محمد المحمدي، أحمد فتوح عبد المقصود تركة كف).',
      19: 'الصندوق 19 يحتوي على 19 مورد وشيكات ومستندات 2017 و 2016 (Al-Ashria, Nady Abdel Malek, Al Ahram Agricultural, Ahmed Abdalla Osman, Ali Ali El Tony, Nadia Mokhi Kamel, Alu Glass 2016, Orascom Trading, Orient Takaful Insurance, El Nour Vegetables, Amro Attia Hassan, Al Ekhlas, Nour Al Huda, Nablco, Alaa Mohamed Ragheb, Nadra Ibrahim Ahmed, Ahmed Abdel Fatah, El Nour).',
    };

    return {
      targetSupplierName: `الصندوق رقم ${targetBoxNumber}`,
      alternateSearchTerms: [`صندوق ${targetBoxNumber}`, `box ${targetBoxNumber}`],
      targetBoxNumber,
      targetYear: targetBoxNumber === 12 ? 2019 : 2017,
      fileType,
      directAnswerAr: boxDescriptions[targetBoxNumber] || `محتويات الصندوق ${targetBoxNumber} مسجلة في الأرشيف.`,
      suggestedQueries: [`صندوق ${targetBoxNumber}`, `شيكات صندوق ${targetBoxNumber}`, 'عرض قائمة الموردين'],
    };
  }

  return {
    targetSupplierName: query,
    alternateSearchTerms: [query],
    targetBoxNumber,
    targetYear,
    fileType,
    directAnswerAr: `تم تفعيل البحث الذكي المطابق لـ "${query}" عبر كافة صناديق الأرشيف وسجلات الموردين.`,
    suggestedQueries: ['شيكات 2017', 'صندوق 16', 'دعشوشة'],
  };
}

// Multi-Model AI Search & Smart Archive Query Assistant
app.post('/api/ai-search', async (req, res) => {
  const query = req.body?.query;
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  const trimmedQuery = query.trim();
  const heuristic = buildHeuristicAiSearch(trimmedQuery);

  const provider = (req.headers['x-ai-provider'] || req.body?.provider || 'gemini') as string;
  const customApiKey = (req.headers['x-custom-api-key'] || req.body?.apiKey || '') as string;
  const customModel = (req.headers['x-ai-model'] || req.body?.model || '') as string;

  const systemPrompt = `أنت المساعد الذكي لنظام الأرشيف الإلكتروني لشركة فندقية ومستنداتها (صناديق 2016، 2017، 2019، 2021).
مهمتك تحليل استعلام المستخدم (بالعربي أو بالإنجليزي أو بالعامية أو مع أخطاء إملائية) واستخراج نية البحث بدقة، مع تصحيح الأخطاء الإملائية والترجمة الذكية وتحديد مكان حفظ الملفات والصناديق.
قاعدة الربط والبحث الأساسية: اعتمد دائماً على **اسم المورد (بالعربي والإنجليزي)** في البحث وربط السجلات عبر كافة الصناديق والسنوات، ولا تعتمد على أكواد المستندات (docNo) كمعيار أساسي للربط، وضع مترادفات اسم المورد بالعربي والإنجليزي داخل alternateSearchTerms.
الصناديق تحتوي على:
[أرشيف سنة 2016 - فندق النيل ريتز كارلتون]:
- صندوق 1 (2016): حسابات الموردين (مصر لتجارة الغزل والنسيج، المصرية للمشروعات السياحية، الأمل للتوريدات الفندقية، الدار العربية للتجارة)
- صندوق 2 (2016): موردين ومستندات (أيديولوجي Idealogy، مخازن المخابز المصرية، محمد عزيز صراف عام، إنسايت Insight، بترو، كاشيون)
- صندوق 3 (2016): موردين (فؤاد للقرطاسية Fouad Stationary، الوادي للبلاستيك، موباكو، إيجيست كلارك، زيروكس مصر Xerox)
- صندوق 4 (2016): حسابات الموردين وخدمات المغسلة (إيهاب فتحي عزب - مغسلة، مؤسسة الإيمان، شركة التداول المتحدة / اليونيون، المصرية للهندسة والتكنولوجيا)
- صندوق 5 (2016): موردين (أحمد مجدي محمد - ألفا تريد للتوريدات العامة، شركة مصر المستقبل، أحمد فتوح، محمود إبراهيم مبروك، علي علي التوني)
- صندوق 6 (2016): موردين (مجموعة الوفاق El Wafa Group / Wefaq، المتحدة للصناعات الغذائية، جي دبليو ماريوت القاهرة، المصطفى للتجارة)
- صندوق 7 (2016): موردين (فؤاد للأدوات المكتبية، فارما سايبيتا Pharma Scienta، مورينو للتوريدات العامة، نالكو مصر المحدودة Nalco)
- صندوق 8 (2016): حصر المستندات والشيكات (الهيئة العامة للتأمين الصحي، شيكات النقابة العامة بفندق النيل ريتز كارلتون، سميرة ريتشي Samira Riachy)
- صندوق 9 (2016): موردين (زيروكس مصر، ماستر تريدنج، أوليو للصناعات الغذائية Olio Food، كابل نتورك)

[أرشيف السنوات 2017 / 2019 / 2021]:
- صندوق 1: ملخص شيكات ومستندات 2017 (CEMO، محمد عزيز، تيبس TIP'S)
- صندوق 2: موردين متنوعين 2017 (سمير محمد علي حيدر، عمرو عطية، منير مكار، عصام جعفر)
- صندوق 3: موردين 2017 (إيجي سويس، فارم تشيز، المجموعة الصناعية المصرية، المصرية للمشروعات المتقدمة، كلاريتي، كومبارك)
- صندوق 4: مستندات طيبة للتجارة والتوزيع 2017 (Tiba)
- صندوق 5: موردين 2017 (المصطفى للتجارة والتوريدات، مورا، ميراكو كاريير، مصر للتأمين، ماستر نيل)
- صندوق 6: موردين 2017 (مارينا للتوريدات، الصفا للتوريدات، مؤسسة ملكة، الشركة الدولية للزراعة، الشركة الدولية للأغذية، ريتش للتسويق)
- صندوق 7: موردين 2017 (الجزيرة للاستيراد والتصدير، حلواني إخوان، فود براند، جلافكو، فود بوكس، فود هاوس، فود ماستر، فود ستاف، مجموعة الخليج)
- صندوق 8: مستندات عاملي تيبس TIPS 2017
- صندوق 9: مستندات الخضار والعصير ومصاريف كاجوال 2017 (القبيصي، النور)
- صندوق 10: موردين 2017 (المنصور للتجارة والتوزيع، TM Fashion، شريف إبراهيم)
- صندوق 11: مصاريف وجهات حكومية وفندق 2017 (بتروتريد، هيرو للأغذية، فندق الريتزكارلتون/شركة شيلار، صيدناوي، الضرائب، التأمينات)
- صندوق 12: شيكات ومستندات 2019 (بيبسي كولا مصر - مسجلة باسم Pepsi Coal Egypt، فلاور باور، كاجوال)
- صندوق 13: موردين وشيكات 2017 (أميكو مصر، الأنصاري، دومتي/Arabian Co، باغيرا، بيروت للألبان، البدر، كايرو ثري، أرما للتجارة، أيمن أفندي، البيت العربي)
- صندوق 14: مستندات وشيكات عامة للموردين 2017
- صندوق 15: 16 مورد 2017 (بيبسي كولا مصر، أ تو زي دبي، عادل زكي، أحمد سعيد، سحر موريس، كوانتا، نستله وترز الجبيلين، نالكو مصر، مامبيا مصر، يوروبيان بارادايس، نستله ووتر، بورسعيد سودانكو، سامو، بترو، برايم فودز، الوطنية للتوريدات)
- صندوق 16: شيكات ومستندات موردين 2017 (أوفيس ميكس، أوميجا، أوليو، نوفا، نورد سي، عصام جعفر، دعشوشة / علي جابر علي درويش، عبد الراضي، الإسكندرية للتنمية، الإسكندرية للتوريدات، الأدغم، محمد عزيز، 1984، الترانزيت / نهاد محروس، نيو أوبتيمال، نيرست، راديو النيل، فارما سايبيتا، باك تك، جرين لايف / أسامة كامل، بورسعيد، بي دبليو تي، بلان بي، بتروكيما، نايل سكان)
- صندوق 17 & 18: شيكات وفواتير ومستندات الموردين لسنة 2017 و 2016 (برو ميديا، ألفا، أحمد مجدي، محمد عزيز، النور، مؤسسة الأهرام، بست، نو باجز، العابدين، عبده عرب، المشروم، كاجوال، خيام نصار، المحمدي، نيو لاين، منير ناصيف هركوس، الاتحادية للأسماك، أعلام النصر، نادرة إبراهيم داود، الأهرام للاستيراد، موستانج ليموزين، بود إيجيبت، الشروق الجديدة، أحمد فتوح)
- صندوق 19: 19 مورد 2017 و 2016 (العشرية، نادي عبد المالك، الأهرام الزراعية، أحمد عبد الله عثمان، علي علي التوني، نادية موحي كامل، ألو جلاس 2016، أوراسكوم للتجارة، أورينت للتأمين التكافلي، النور للخضروات والفاكهة، عمرو عطية حسن محمد / الهنا للخضروات، الإخلاص، نور الهدى للأسماك، نابلكو، علاء محمد راغب / عين شمس للدواجن، نادرة إبراهيم أحمد دسوقي / البركة، أحمد عبد الفتاح)

أجب دائماً بتنسيق JSON صالح حصراً بالحقول التالية بدون أي نص إضافي:
{
  "targetSupplierName": string or null,
  "alternateSearchTerms": string[],
  "targetBoxNumber": number or null,
  "targetYear": number or null,
  "fileType": "check" | "doc" | "all",
  "directAnswerAr": string,
  "suggestedQueries": string[],
  "correctedQuery": string,
  "detectedLanguage": string
}`;

  try {
    let parsedData: any = null;
    let providerUsed = provider;

    if (provider === 'openai' && customApiKey) {
      const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${customApiKey}`,
        },
        body: JSON.stringify({
          model: customModel || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `استعلام المستخدم: "${trimmedQuery}"` },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
      });
      if (openAiRes.ok) {
        const json = await openAiRes.json();
        const content = json.choices?.[0]?.message?.content;
        parsedData = safeParseAiJson(content);
      }
    } else if (provider === 'anthropic' && customApiKey) {
      const anthroRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': customApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: customModel || 'claude-3-5-sonnet-20241022',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: 'user', content: `استعلام المستخدم: "${trimmedQuery}"` }],
        }),
      });
      if (anthroRes.ok) {
        const json = await anthroRes.json();
        const textBlock = json.content?.[0]?.text;
        parsedData = safeParseAiJson(textBlock);
      }
    } else if (provider === 'deepseek' && customApiKey) {
      const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${customApiKey}`,
        },
        body: JSON.stringify({
          model: customModel || 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `استعلام المستخدم: "${trimmedQuery}"` },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
      });
      if (dsRes.ok) {
        const json = await dsRes.json();
        const content = json.choices?.[0]?.message?.content;
        parsedData = safeParseAiJson(content);
      }
    }

    // If not handled by custom provider or failed, use Gemini (custom key or server env)
    if (!parsedData) {
      providerUsed = 'gemini';
      const geminiApiKey = customApiKey || process.env.GEMINI_API_KEY;
      if (geminiApiKey) {
        const geminiClient = new GoogleGenAI({
          apiKey: geminiApiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });

        const requestedModel =
          customModel && customModel !== 'gemini-3.8-flash' ? customModel : 'gemini-4-hydrogen';
        const supportsThinkingLevel =
          requestedModel.startsWith('gemini-4') || requestedModel.startsWith('gemini-3');

        const generatePromise = geminiClient.models.generateContent({
          model: requestedModel,
          contents: `استعلام المستخدم: "${trimmedQuery}"`,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            ...(supportsThinkingLevel
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI Request timeout')), 12000)
        );

        const response = (await Promise.race([generatePromise, timeoutPromise])) as any;
        parsedData = safeParseAiJson(response?.text);
      }
    }

    if (!parsedData || !parsedData.directAnswerAr) {
      parsedData = heuristic;
    }

    return res.json({
      isAiActive: true,
      providerUsed,
      query: trimmedQuery,
      interpretedIntent: parsedData,
    });
  } catch (error: any) {
    console.warn('Graceful heuristic fallback in /api/ai-search:', error?.message || String(error));
    return res.json({
      isAiActive: false,
      providerUsed: 'heuristic-fallback',
      query: trimmedQuery,
      interpretedIntent: heuristic,
    });
  }
});

// AI Audio Speech-to-Text Transcription Endpoint (Arabic, Egyptian dialect & English supplier names)
app.post('/api/ai-transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType } = req.body;
    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ error: 'بيانات الصوت مطلوبة للتحويل.' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(503).json({ error: 'مفتاح Gemini API غير مهيأ على الخادم.' });
    }

    const geminiClient = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/i, '');
    const normalizedMime = typeof mimeType === 'string' && mimeType.includes('audio/')
      ? mimeType.split(';')[0].trim()
      : 'audio/webm';

    const response = await geminiClient.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: normalizedMime,
              data: cleanBase64,
            },
          },
          {
            text: 'Transcribe this audio accurately into clean text. The speaker may speak Arabic (including Egyptian dialect), English, or a mix of Arabic and English company/supplier names, check numbers, years (2016-2021), or box numbers (صندوق). Preserve numbers as Western digits (0-9). Output ONLY the transcribed search text with no extra commentary or quotation marks.',
          },
        ],
      },
    });

    const transcript = (response?.text || '').trim().replace(/^["«]|["»]$/g, '').trim();
    if (!transcript) {
      return res.status(422).json({ error: 'لم يتم التقاط كلام واضح في التسجيل الصوتي.' });
    }

    return res.json({
      success: true,
      transcript,
      model: 'gemini-3.5-transcribe',
    });
  } catch (error: any) {
    console.error('Error in /api/ai-transcribe:', error);
    return res.status(500).json({
      error: error?.message || 'تعذر تحويل الصوت إلى نص، يرجى المحاولة مرة أخرى.',
    });
  }
});

function normalizeExtractedDigits(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;
  const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
  const easternIndic = '۰۱۲۳۴۵۶۷۸۹';
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const idxA = arabicIndic.indexOf(ch);
    const idxE = easternIndic.indexOf(ch);
    if (idxA !== -1) out += String(idxA);
    else if (idxE !== -1) out += String(idxE);
    else out += ch;
  }
  return out;
}

// AI Vision OCR, Bilingual Arabic/English & Handwriting / Document / Check Extraction Endpoint
app.post('/api/ai-vision-extract', async (req, res) => {
  try {
    const { imageBase64, mimeType, images, scanMode, knownSuppliers } = req.body;

    const inputImages: Array<{ data: string; mimeType: string }> = [];
    if (Array.isArray(images) && images.length > 0) {
      for (const item of images.slice(0, 4)) {
        if (item && typeof item.imageBase64 === 'string' && item.imageBase64.trim()) {
          inputImages.push({
            data: item.imageBase64.replace(/^data:[^;]+;base64,/i, ''),
            mimeType: typeof item.mimeType === 'string' && item.mimeType ? item.mimeType : 'image/jpeg',
          });
        }
      }
    } else if (imageBase64 && typeof imageBase64 === 'string') {
      inputImages.push({
        data: imageBase64.replace(/^data:[^;]+;base64,/i, ''),
        mimeType: typeof mimeType === 'string' && mimeType ? mimeType : 'image/jpeg',
      });
    }

    if (inputImages.length === 0) {
      return res.status(400).json({ error: 'بيانات الصورة مطلوبة للفحص.' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(500).json({ error: 'Gemini API key not configured on server' });
    }

    const geminiClient = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const supplierHintsBlock =
      Array.isArray(knownSuppliers) && knownSuppliers.length > 0
        ? `\nقائمة مرجعية لأسماء الموردين المسجلين بالأرشيف لمساعدتك على فك غموض الخط اليدوي أو الحروف الباهتة فقط عند التطابق المعنوي:\n${knownSuppliers
            .slice(0, 120)
            .map((s: unknown) => String(s).trim())
            .filter(Boolean)
            .join(' | ')}`
        : '';

    const modeHint =
      scanMode === 'handwriting'
        ? 'تركيز فائق على قراءة خط اليد العربي (نسخ/رقعة) والإنجليزي (Cursive/Print) بدقة، بما في ذلك الملاحظات الجانبية، الخطوط المائلة، أرقام الشيكات والتواريخ المكتوبة بالقلم الجاف أو الرصاص، مع نسخ كل النص حرفياً في rawTranscribedText وفصله في arabicText و englishText.'
        : scanMode === 'check'
        ? 'تركيز فائق على الشيكات البنكية وإشعارات الصرف: استخراج اسم المستفيد/المورد بالعربي والإنجليزي، اسم البنك، رقم الشيك البنكي كاملاً، المبلغ، العملة، وتاريخ/سنة الاستحقاق.'
        : scanMode === 'invoice'
        ? 'تركيز فائق على الفواتير والكشوف متعددة الأسطر: استخراج المورد الأساسي وملخص المحتوى وجميع الصفوف/البنود أو الموردين الإضافيين في extractedItems.'
        : 'فحص شامل ومتعمق للمحتوى سواء كان مستنداً مطبوعاً، مكتوباً بخط اليد، شيكاً بنكياً، ظرف أرشيف، أو مستنداً مختلطاً بالعربي والإنجليزي.';

    const multiPageHint =
      inputImages.length > 1
        ? `\nتنبيه: تم إرفاق ${inputImages.length} صور لنفس المستند أو لصفحات متصلة (مثل وجه وظهر ظرف أو شيك وفاتورته). ادمج المعلومات من كل الصور بدقة متكاملة.`
        : '';

    const visionPrompt = `أنت نظام خبير في الرؤية الحاسوبية وقراءة الوثائق المالية والفندقية (OCR ثنائي اللغة: عربي + إنجليزي + خط اليد).
${modeHint}${multiPageHint}

قواعد صارمة للاستخراج والدقة:
1. التحليل البصري الشامل للمحتوى:
   - اقرأ كل كلمة مطبوعة أو مكتوبة بخط اليد، الأختام البنكية والشركات، ترويسة الصفحة، الهوامش، وأرقام الأظرف/الملفات.
   - ضع النص الكامل مرتباً حسب السطور في "rawTranscribedText".
   - افصل كل النص العربي المقروء في "arabicText"، وكل النص الإنجليزي المقروء في "englishText".
   - اكتب ملخصاً واضحاً لمحتوى الصورة وطبيعة المعاملة في "documentSummaryAr".
2. استخراج اسم المورد ثنائي اللغة:
   - "supplierName": أفضل اسم موحد للمورد/الشركة.
   - "supplierNameAr": الاسم بالعربية (وإن كان مكتوباً بالإنجليزية فقط في الصورة، أضف التعريب الدقيق له).
   - "supplierNameEn": الاسم بالإنجليزية (وإن كان مكتوباً بالعربية فقط في الصورة، أضف الاسم الإنجليزي أو النطق اللاتيني الدقيق له).
3. الأرقام والتواريخ:
   - حوّل كافة الأرقام الهندية/العربية (٠١٢٣٤٥٦٧٨٩) إلى أرقام قياسية غربية (0-9) في docNo و checkNo و amount و year و documentDate.
   - لا تخلط بين رقم الفاتورة (docNo) ورقم الشيك (checkNo) أو رقم الهاتف/السجل الضريبي.
4. خط اليد والغموض:
   - حدد handwritingDetected=true إذا وُجد أي خط يد (توقيع، اسم مورد، مبلغ، تاريخ، رقم ظرف).
   - قيّم وضوح خط اليد في handwritingQuality ("clear" أو "moderate" أو "challenging").
   - إذا كانت هناك كلمة غير واضحة تماماً بخط اليد، دوّن الاحتمال البديل داخل confidenceNotes.
5. استخرج قائمة كلمات مفتاحية بحثية دقيقة (أسماء، أرقام شيكات، أكواد، بنوك، أظرف) في "extractedKeywords".
6. إذا وُجد أكثر من مورد أو بند في كشف أو جدول، أدرج كل بند في "extractedItems".
7. اقترح رقم الصندوق الأنسب في "suggestedBoxNumber" (من 1 إلى 19، أو 101 إلى 109 لأرشيف 2016) إن أمكن.${supplierHintsBlock}`;

    const imageParts = inputImages.map((img) => ({
      inlineData: {
        data: img.data,
        mimeType: img.mimeType,
      },
    }));

    const useHighThinking =
      scanMode === 'handwriting' || scanMode === 'invoice' || inputImages.length > 1;

    const response = await geminiClient.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [...imageParts, { text: visionPrompt }],
      },
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: {
          thinkingLevel: useHighThinking ? ThinkingLevel.HIGH : ThinkingLevel.MEDIUM,
        },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            supplierName: { type: Type.STRING, nullable: true },
            supplierNameAr: { type: Type.STRING, nullable: true },
            supplierNameEn: { type: Type.STRING, nullable: true },
            primaryLanguage: { type: Type.STRING, enum: ['ar', 'en', 'mixed'] },
            docNo: { type: Type.STRING, nullable: true },
            checkNo: { type: Type.STRING, nullable: true },
            bankName: { type: Type.STRING, nullable: true },
            documentDate: { type: Type.STRING, nullable: true },
            amount: { type: Type.NUMBER, nullable: true },
            currency: { type: Type.STRING, enum: ['EGP', 'USD', 'EUR', 'OTHER'] },
            year: { type: Type.INTEGER, nullable: true },
            envelopeOrFileHint: { type: Type.STRING, nullable: true },
            notes: { type: Type.STRING },
            suggestedBoxNumber: { type: Type.INTEGER, nullable: true },
            documentType: {
              type: Type.STRING,
              enum: ['handwritten-note', 'bank-check', 'printed-invoice', 'envelope-manifest', 'mixed'],
            },
            handwritingDetected: { type: Type.BOOLEAN },
            handwritingQuality: { type: Type.STRING, enum: ['clear', 'moderate', 'challenging'] },
            arabicText: { type: Type.STRING },
            englishText: { type: Type.STRING },
            rawTranscribedText: { type: Type.STRING },
            documentSummaryAr: { type: Type.STRING },
            confidenceNotes: { type: Type.STRING, nullable: true },
            extractedKeywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            extractedItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  supplierName: { type: Type.STRING },
                  supplierNameAr: { type: Type.STRING, nullable: true },
                  supplierNameEn: { type: Type.STRING, nullable: true },
                  docNo: { type: Type.STRING, nullable: true },
                  checkNo: { type: Type.STRING, nullable: true },
                  amount: { type: Type.NUMBER, nullable: true },
                  year: { type: Type.INTEGER, nullable: true },
                  notes: { type: Type.STRING, nullable: true },
                },
                required: ['supplierName'],
              },
            },
          },
          required: [
            'notes',
            'handwritingDetected',
            'rawTranscribedText',
            'arabicText',
            'englishText',
            'documentSummaryAr',
            'documentType',
            'primaryLanguage',
          ],
        },
      },
    });

    const parsed = safeParseAiJson<any>(response?.text);
    if (!parsed) {
      return res.status(422).json({ error: 'تعذر تحليل بيانات الصورة بتنسيق صالح، حاول بصورة أوضح.' });
    }

    const extractedData = {
      ...parsed,
      docNo: normalizeExtractedDigits(parsed.docNo),
      checkNo: normalizeExtractedDigits(parsed.checkNo),
      documentDate: normalizeExtractedDigits(parsed.documentDate),
      envelopeOrFileHint: normalizeExtractedDigits(parsed.envelopeOrFileHint),
      extractedKeywords: Array.isArray(parsed.extractedKeywords)
        ? parsed.extractedKeywords
            .map((k: unknown) => normalizeExtractedDigits(k))
            .filter((k: string | null): k is string => Boolean(k))
        : [],
      extractedItems: Array.isArray(parsed.extractedItems)
        ? parsed.extractedItems.map((it: any) => ({
            ...it,
            docNo: normalizeExtractedDigits(it.docNo),
            checkNo: normalizeExtractedDigits(it.checkNo),
          }))
        : [],
    };

    return res.json({
      success: true,
      extractedData,
    });
  } catch (error: any) {
    console.error('Error in /api/ai-vision-extract:', error);
    return res.status(500).json({ error: error?.message || 'Failed to process image with AI' });
  }
});

// JSON 404 fallback for unknown /api routes
app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Start Full-Stack Server (skipped on Vercel serverless where default export is invoked directly)
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    process.env.DISABLE_HMR = process.env.DISABLE_HMR || 'true';
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (!result || !result.code) {
          return next();
        }
        const cleanCode = result.code
          .replace(
            'transport.connect(createHMRHandler(handleMessage));',
            '/* HMR WebSocket disabled */'
          )
          .replace(
            'throw new SendBeforeConnectError(',
            'return; throw new SendBeforeConnectError('
          );
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(cleanCode);
      } catch (err) {
        return next(err);
      }
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        setHeaders(res, filePath) {
          if (filePath.endsWith('manifest.webmanifest')) {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
          } else if (filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      const indexHtmlPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtmlPath)) {
        return res.sendFile(indexHtmlPath);
      }
      return res.status(404).send('Build output not found. Run npm run build first.');
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;

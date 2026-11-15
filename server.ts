import express from 'express';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
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
      alternateSearchTerms: ['Amico Of Egypt', 'أميكو مصر', 'أميكو', 'CAM002'],
      targetBoxNumber: targetBoxNumber || 13,
      targetYear: targetYear || 2021,
      fileType,
      directAnswerAr: 'تتواجد شيكات ومستندات شركة أميكو مصر في الصندوق 13، الظرف 2 (سند CAM002).',
      suggestedQueries: ['صندوق 13', 'شيكات 2021', 'دومتي'],
    };
  }

  if (q.includes('المنصور') || q.includes('mansour')) {
    return {
      targetSupplierName: 'Al Mansour Co. For Trading (المنصور للتجارة والتوزيع)',
      alternateSearchTerms: ['Al Mansour Co. For Trading', 'المنصور', 'CAL004'],
      targetBoxNumber: targetBoxNumber || 10,
      targetYear: targetYear || 2017,
      fileType,
      directAnswerAr: 'تتواجد مستندات شركة المنصور للتجارة والتوزيع في الصندوق 10، الظرف 14 (سند CAL004).',
      suggestedQueries: ['صندوق 10', 'مستندات 2017', 'TM Fashion'],
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
- صندوق 16: شيكات ومستندات موردين 2017 (أوفيس ميكس COF001، أوميجا COM002، أوليو COL001، نوفا CNU008، نورد سي CNO006، عصام جعفر CES003، دعشوشة CAL013، عبد الراضي CAH018، الإسكندرية للتنمية CAL008، الإسكندرية للتوريدات CAL018، الأدغم CAL019، محمد عزيز CMO005، 1984 CNI002، الترانزيت CNE006، نيو أوبتيمال CNE007، نيرست CNE008، راديو النيل CNI001، فارما سايبيتا CPH001، باك تك CPA002، جرين لايف COS003، بورسعيد CPO002، بي دبليو تي CPW001، بلان بي CPL001، بتروكيما CPE003، نايل سكان CNI003)
- صندوق 17 & 18: شيكات وفواتير ومستندات الموردين لسنة 2017 و 2016
- صندوق 19: 19 مورد 2017 و 2016 (العشري CAL010، نادي عبد المالك CNA009، الأهرام الزراعية CAH013، أحمد عبد الله عثمان CAH008، علي علي التوني CAL015، نادية موحي CNA011، ألو جلاس CAL014 2016، أوراسكوم للتجارة COR002، أورينت للتأمين التكافلي COR001، النور للخضروات CNE008/CNO002، عمرو عطية الهنا CAM015، الإخلاص CAL012، نور الهدى للأسماك CNB007، نابلكو CNA008، علاء محمد راغب عين شمس للدواجن CAL020، نادرة إبراهيم البركة CNA006، أحمد عبد الفتاح CAH011)

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

// AI Vision OCR & Document/Invoice Extraction Endpoint
app.post('/api/ai-vision-extract', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Image data is required' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(500).json({ error: 'Gemini API key not configured on server' });
    }

    const geminiClient = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const visionPrompt = `أنت نظام الذكاء الاصطناعي الأرشيفي المتطور لفحص مستندات وفواتير وشيكات الفندق.
مهمتك استخراج البيانات التالية من الصورة بدقة تامة وإرجاعها على شكل JSON صالح فقط:
{
  "supplierName": string or null (اسم المورد أو الشركة بالعربي أو الإنجليزي),
  "docNo": string or null (رقم المستند أو الفاتورة إن وجد مثل COF001 أو CAL013 أو CMA001),
  "checkNo": string or null (رقم الشيك إن وجد),
  "amount": number or null (قيمة الفاتورة أو المبلغ إن وجد),
  "year": number or null (السنة المالية إن وجدت مثل 2016 أو 2017 أو 2019 أو 2021),
  "notes": string (ملخص محتوى المستند أو الفاتورة أو ملاحظات إضافية),
  "suggestedBoxNumber": number or null (رقم الصندوق المتوقع بناء على محتوى المستند من 1 إلى 19، أو 101 إلى 109 لسنة 2016)
}`;

    const cleanBase64 = typeof imageBase64 === 'string'
      ? imageBase64.replace(/^data:[^;]+;base64,/i, '')
      : '';

    const response = await geminiClient.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: mimeType || 'image/jpeg',
            },
          },
          { text: visionPrompt },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const extractedData = safeParseAiJson(response?.text);
    if (!extractedData) {
      return res.status(422).json({ error: 'تعذر تحليل بيانات الصورة بتنسيق صالح، حاول بصورة أوضح.' });
    }

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

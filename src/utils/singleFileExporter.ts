import { ARCHIVE_BOXES } from '../data/archiveData';

export function buildStandaloneSingleFileHtml(baseUrl: string): string {
  const boxesJson = JSON.stringify(ARCHIVE_BOXES);
  const safeBaseUrl = baseUrl.replace(/[?#].*$/, '');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Smart Docs E-Archive | نظام الأرشفة الذكي للصناديق (1 - 13)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800&family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    body { font-family: 'IBM Plex Sans Arabic', 'Cairo', sans-serif; }
    h1, h2, h3, h4, .font-display { font-family: 'Cairo', sans-serif; }
    .mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
    @media print {
      .no-print { display: none !important; }
      .print-area { display: block !important; }
      body { background: #fff !important; }
    }
  </style>
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen flex flex-col lg:flex-row">
  <!-- Sidebar -->
  <aside class="no-print w-full lg:w-64 bg-[#0B1426] text-slate-200 shrink-0 flex flex-col border-l border-slate-800">
    <div class="p-5 border-b border-slate-800/80 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow">
          <i class="fa-solid fa-boxes-packing text-lg"></i>
        </div>
        <div>
          <div class="font-display font-bold text-white text-base leading-tight">Smart Docs</div>
          <div class="text-xs text-slate-400">نظام الأرشفة الذكي</div>
        </div>
      </div>
    </div>
    <nav class="p-3 space-y-1 flex-1 flex lg:block overflow-x-auto gap-1">
      <button onclick="switchTab('dashboard')" id="nav-dashboard" class="nav-btn w-full text-right px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 whitespace-nowrap bg-blue-600 text-white">
        <i class="fa-solid fa-chart-pie w-4"></i><span>لوحة التحكم</span>
      </button>
      <button onclick="switchTab('search')" id="nav-search" class="nav-btn w-full text-right px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 whitespace-nowrap text-slate-300 hover:bg-slate-800/70">
        <i class="fa-solid fa-magnifying-glass w-4"></i><span>البحث الذكي</span>
      </button>
      <button onclick="switchTab('boxes')" id="nav-boxes" class="nav-btn w-full text-right px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 whitespace-nowrap text-slate-300 hover:bg-slate-800/70">
        <i class="fa-solid fa-box-archive w-4"></i><span>إدارة الصناديق (1-13)</span>
      </button>
      <button onclick="switchTab('qrcodes')" id="nav-qrcodes" class="nav-btn w-full text-right px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 whitespace-nowrap text-slate-300 hover:bg-slate-800/70">
        <i class="fa-solid fa-qrcode w-4"></i><span>رموز QR والباركود</span>
      </button>
    </nav>
    <div class="hidden lg:block p-4 border-t border-slate-800/80 text-xs text-slate-400">
      إجمالي الصناديق المؤرشفة: 13 صندوق · 291 ملف
    </div>
  </aside>

  <!-- Main Workspace -->
  <div class="flex-1 flex flex-col min-w-0">
    <header class="no-print bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
      <div class="font-display font-bold text-slate-900 text-lg" id="page-heading">لوحة التحكم الرئيسية</div>
      <div class="flex items-center gap-2">
        <label class="text-xs text-slate-500">تصفية السنة:</label>
        <select id="global-year" onchange="onYearChange(this.value)" class="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-slate-50 mono">
          <option value="all">كل السنوات (2017 - 2021)</option>
          <option value="2017">2017</option>
          <option value="2019">2019</option>
          <option value="2021">2021</option>
        </select>
        <button onclick="printLabels('all')" class="bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium px-3.5 py-2 rounded-lg flex items-center gap-2">
          <i class="fa-solid fa-print"></i><span>طباعة كل الملصقات</span>
        </button>
      </div>
    </header>

    <main class="no-print p-6 flex-1 space-y-6 max-w-7xl w-full mx-auto" id="app-content"></main>
    <div id="print-container" class="hidden print-area p-4"></div>
  </div>

  <script>
    const BOXES = ${boxesJson};
    const BASE_URL = ${JSON.stringify(safeBaseUrl)};
    let currentTab = 'dashboard';
    let selectedYear = 'all';
    let activeBoxId = 1;
    let globalQuery = '';
    let boxQuery = '';

    const CODE128 = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];

    function barcodeSvg(text, height = 42) {
      const codes = [104];
      let sum = 104;
      for (let i = 0; i < text.length; i++) {
        const v = Math.max(0, text.charCodeAt(i) - 32);
        codes.push(v);
        sum += v * (i + 1);
      }
      codes.push(sum % 103, 106);
      let x = 10, rects = '';
      for (const c of codes) {
        const p = CODE128[c] || CODE128[0];
        for (let j = 0; j < p.length; j++) {
          const w = Number(p[j]);
          if (j % 2 === 0) rects += '<rect x="' + x + '" y="2" width="' + w + '" height="' + (height - 4) + '" fill="#0F172A"/>';
          x += w;
        }
      }
      const total = x + 10;
      return '<svg viewBox="0 0 ' + total + ' ' + (height + 16) + '" class="w-full max-w-[220px] mx-auto" dir="ltr"><rect width="' + total + '" height="' + (height + 16) + '" fill="#fff"/>' + rects + '<text x="' + (total/2) + '" y="' + (height + 12) + '" text-anchor="middle" font-size="10" font-family="monospace" font-weight="600" fill="#0F172A">' + text + '</text></svg>';
    }

    function normalize(s) {
      return String(s || '').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').trim();
    }

    function getBoxLink(boxId) {
      const base = window.location.href.split('?')[0].split('#')[0];
      return (base.startsWith('http') ? base : BASE_URL) + '?box=' + boxId;
    }

    function makeQrDataUrl(val, size = 150) {
      const qr = new QRious({ value: val, size: size * 2, level: 'M', foreground: '#0B1426', background: '#ffffff' });
      return qr.toDataURL();
    }

    function onYearChange(val) {
      selectedYear = val;
      render();
    }

    function switchTab(tab, boxId) {
      currentTab = tab;
      if (boxId) activeBoxId = boxId;
      document.querySelectorAll('.nav-btn').forEach(b => {
        b.className = 'nav-btn w-full text-right px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 whitespace-nowrap text-slate-300 hover:bg-slate-800/70';
      });
      const activeBtn = document.getElementById('nav-' + tab);
      if (activeBtn) activeBtn.className = 'nav-btn w-full text-right px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 whitespace-nowrap bg-blue-600 text-white';
      const titles = { dashboard: 'لوحة التحكم الرئيسية', search: 'البحث الذكي في الصناديق والموردين', boxes: 'إدارة واستعراض الصناديق (1 - 13)', qrcodes: 'توليد رموز QR وطباعة الباركود' };
      document.getElementById('page-heading').textContent = titles[tab] || '';
      render();
    }

    function printLabels(target) {
      const list = target === 'all'
        ? BOXES.filter(b => selectedYear === 'all' || b.years.includes(Number(selectedYear)))
        : BOXES.filter(b => b.id === Number(target));
      const html = '<div class="space-y-6">' + list.map(b => {
        const qr = makeQrDataUrl(getBoxLink(b.id), 130);
        const topSuppliers = b.files.map(f => f.supplierName).filter(n => n && n !== 'غير محدد').slice(0, 5).join(' · ');
        const numPadded = String(b.id).padStart(2, '0');
        return '<div class="border-[3px] border-slate-900 rounded-2xl p-5 bg-white break-inside-avoid flex flex-col justify-between gap-4 min-h-[290px]">' +
          '<div class="flex items-stretch justify-between gap-4 border-b-2 border-slate-900 pb-4">' +
            '<div class="bg-slate-900 text-white rounded-xl p-3 flex flex-col items-center justify-center shrink-0 min-w-[140px] text-center">' +
              '<div class="text-[11px] font-bold tracking-widest text-slate-300 uppercase">صندوق أرشيف</div>' +
              '<div class="text-6xl font-black mono my-1 leading-none">' + numPadded + '</div>' +
              '<div class="text-xs font-bold mono text-amber-400">' + b.code + '</div>' +
            '</div>' +
            '<div class="flex-1 flex flex-col justify-center space-y-1.5 min-w-0">' +
              '<div class="flex items-center gap-2">' +
                '<span class="text-[10px] font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-300">SMART DOCS E-ARCHIVE</span>' +
                '<span class="text-xs mono font-bold text-slate-700">السنة المالية: ' + b.years.join(' / ') + '</span>' +
              '</div>' +
              '<div class="text-2xl font-black font-display text-slate-950">' + b.titleAr + '</div>' +
              '<div class="text-xs font-semibold text-slate-800">' + b.categoryScope + '</div>' +
              '<div class="text-xs text-slate-600 truncate"><strong class="text-slate-900">أبرز الموردين: </strong>' + (topSuppliers || 'مستندات متنوعة') + '</div>' +
              '<div class="text-xs font-bold text-slate-900">إجمالي الملفات: <span class="mono text-base font-extrabold text-blue-800">' + b.files.length + ' ملف</span></div>' +
            '</div>' +
            '<div class="shrink-0 flex flex-col items-center justify-center p-2 border-2 border-slate-300 rounded-xl bg-white text-center">' +
              '<img src="' + qr + '" class="w-28 h-28" />' +
              '<div class="text-[9px] font-bold text-slate-700 mt-1">امسح لعرض الملفات</div>' +
            '</div>' +
          '</div>' +
          '<div class="flex items-center justify-between gap-4 pt-1">' +
            '<div class="w-full max-w-md">' + barcodeSvg(b.barcodeValue, 48) + '</div>' +
            '<div class="text-[10px] mono text-slate-600 bg-slate-50 border border-slate-300 rounded px-2.5 py-1 truncate max-w-xs" dir="ltr">' + getBoxLink(b.id) + '</div>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>';
      const pc = document.getElementById('print-container');
      pc.innerHTML = html;
      window.print();
    }

    function render() {
      const el = document.getElementById('app-content');
      const filteredBoxes = BOXES.filter(b => selectedYear === 'all' || b.years.includes(Number(selectedYear)));
      const allFiles = [];
      BOXES.forEach(b => b.files.forEach(f => {
        if (selectedYear === 'all' || String(f.year) === String(selectedYear)) {
          allFiles.push({ ...f, boxId: b.id, boxTitle: b.titleAr, boxCode: b.code });
        }
      }));
      const uniqueSuppliers = new Set(allFiles.map(f => f.supplierName.toLowerCase())).size;

      if (currentTab === 'dashboard') {
        el.innerHTML = \`
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
              <div><div class="text-xs text-slate-500">إجمالي الصناديق</div><div class="text-3xl font-bold mono mt-1 text-slate-900">\${filteredBoxes.length}</div><div class="text-xs text-blue-600 mt-1">صناديق مؤرشفة بالكامل</div></div>
              <div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl"><i class="fa-solid fa-boxes-stacked"></i></div>
            </div>
            <div class="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
              <div><div class="text-xs text-slate-500">إجمالي الملفات والظروف</div><div class="text-3xl font-bold mono mt-1 text-slate-900">\${allFiles.length}</div><div class="text-xs text-emerald-600 mt-1">مستند وظرف مفهرس</div></div>
              <div class="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl"><i class="fa-solid fa-folder-open"></i></div>
            </div>
            <div class="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
              <div><div class="text-xs text-slate-500">إجمالي الموردين والجهات</div><div class="text-3xl font-bold mono mt-1 text-slate-900">\${uniqueSuppliers}</div><div class="text-xs text-indigo-600 mt-1">شركة ومورد مسجل</div></div>
              <div class="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl"><i class="fa-solid fa-building"></i></div>
            </div>
            <div class="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
              <div><div class="text-xs text-slate-500">السنوات المالية المشمولة</div><div class="text-2xl font-bold mono mt-1 text-slate-900">2017 · 2019 · 2021</div><div class="text-xs text-amber-600 mt-1">جاهزة للبحث والطباعة</div></div>
              <div class="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl"><i class="fa-solid fa-calendar-check"></i></div>
            </div>
          </div>

          <div class="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display font-bold text-base text-slate-900">البحث الذكي الفوري في جميع الصناديق</h2>
              <span class="text-xs text-slate-500">ابحث باسم المورد أو الشركة أو كود المستند</span>
            </div>
            <div class="relative">
              <i class="fa-solid fa-magnifying-glass absolute right-4 top-3.5 text-slate-400"></i>
              <input type="text" value="\${globalQuery}" oninput="globalQuery=this.value;switchTab('search')" placeholder="اكتب اسم المورد (مثال: Domty، المعادي، بتروتريد، Mohamed Aziz، CMO003)..." class="w-full pr-11 pl-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-blue-600" />
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            \${filteredBoxes.map(b => \`
              <div class="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between hover:border-blue-400 transition-colors">
                <div>
                  <div class="flex items-center justify-between">
                    <span class="font-display font-bold text-lg text-slate-900">\${b.titleAr}</span>
                    <span class="mono text-xs text-slate-500">\${b.code} · \${b.years.join('/')}</span>
                  </div>
                  <p class="text-xs text-slate-500 mt-1">\${b.categoryScope}</p>
                </div>
                <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span class="text-sm font-semibold mono text-slate-800">\${b.files.length} ملف</span>
                  <div class="flex items-center gap-2">
                    <button onclick="switchTab('qrcodes', \${b.id})" class="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50"><i class="fa-solid fa-qrcode ml-1"></i>QR</button>
                    <button onclick="switchTab('boxes', \${b.id})" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">عرض المحتويات</button>
                  </div>
                </div>
              </div>
            \`).join('')}
          </div>
        \`;
      } else if (currentTab === 'search') {
        const q = normalize(globalQuery);
        const matches = q ? allFiles.filter(f =>
          normalize(f.supplierName).includes(q) ||
          normalize(f.docNo).includes(q) ||
          normalize(f.checkNo).includes(q) ||
          normalize(f.notes).includes(q) ||
          normalize(f.boxTitle).includes(q)
        ) : allFiles;

        el.innerHTML = \`
          <div class="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div class="relative">
              <i class="fa-solid fa-magnifying-glass absolute right-4 top-3.5 text-slate-400"></i>
              <input id="search-input" type="text" value="\${globalQuery}" oninput="globalQuery=this.value;render();const inp=document.getElementById('search-input');inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length);" placeholder="ابحث باسم المورد، الشركة، رقم المستند، أو رقم الشيك..." class="w-full pr-11 pl-4 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-blue-600" />
            </div>
            <div class="text-xs text-slate-500">عدد النتائج المطابقة: <strong class="mono text-slate-900">\${matches.length}</strong> مستند</div>
            <div class="overflow-x-auto border border-slate-200 rounded-xl">
              <table class="w-full text-right text-sm">
                <thead class="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th class="px-4 py-3">الصندوق</th>
                    <th class="px-4 py-3">رقم الملف / الظرف</th>
                    <th class="px-4 py-3">اسم المورد / الجهة</th>
                    <th class="px-4 py-3">رقم المستند</th>
                    <th class="px-4 py-3">الشيك / السنة</th>
                    <th class="px-4 py-3">إجراء</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  \${matches.map(m => \`
                    <tr class="hover:bg-blue-50/40">
                      <td class="px-4 py-2.5 font-semibold text-blue-700 whitespace-nowrap">\${m.boxTitle}</td>
                      <td class="px-4 py-2.5 mono text-xs text-slate-600 whitespace-nowrap">\${m.envelopeLabel}</td>
                      <td class="px-4 py-2.5 font-medium text-slate-900">\${m.supplierName}</td>
                      <td class="px-4 py-2.5 mono text-xs text-slate-700">\${m.docNo}</td>
                      <td class="px-4 py-2.5 mono text-xs text-slate-600">\${m.checkNo !== '—' ? m.checkNo : m.year}</td>
                      <td class="px-4 py-2.5"><button onclick="switchTab('boxes', \${m.boxId})" class="text-xs text-blue-600 hover:underline whitespace-nowrap">فتح الصندوق</button></td>
                    </tr>
                  \`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        \`;
      } else if (currentTab === 'boxes') {
        const box = BOXES.find(b => b.id === Number(activeBoxId)) || BOXES[0];
        const q = normalize(boxQuery);
        const rows = box.files.filter(f =>
          (selectedYear === 'all' || String(f.year) === String(selectedYear)) &&
          (!q || normalize(f.supplierName).includes(q) || normalize(f.docNo).includes(q) || normalize(f.notes).includes(q))
        );
        el.innerHTML = \`
          <div class="flex flex-wrap gap-2">
            \${BOXES.map(b => \`
              <button onclick="activeBoxId=\${b.id};boxQuery='';render()" class="px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors \${b.id === box.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400'}">
                \${b.titleAr} <span class="mono opacity-80">(\${b.files.length})</span>
              </button>
            \`).join('')}
          </div>
          <div class="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 class="font-display font-bold text-xl text-slate-900">\${box.titleAr} — \${box.subtitleAr}</h2>
                <p class="text-xs text-slate-500 mt-1">\${box.categoryScope} · الكود: <span class="mono">\${box.barcodeValue}</span> · إجمالي الملفات: <span class="mono font-semibold">\${box.files.length}</span></p>
              </div>
              <div class="flex items-center gap-2">
                <button onclick="switchTab('qrcodes', \${box.id})" class="px-3.5 py-2 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-2"><i class="fa-solid fa-qrcode"></i><span>رمز QR والباركود</span></button>
                <button onclick="printLabels(\${box.id})" class="px-3.5 py-2 text-xs bg-slate-900 text-white rounded-lg hover:bg-slate-800 flex items-center gap-2"><i class="fa-solid fa-print"></i><span>طباعة ملصق الصندوق</span></button>
              </div>
            </div>
            <div class="relative">
              <i class="fa-solid fa-magnifying-glass absolute right-3.5 top-3 text-slate-400 text-sm"></i>
              <input id="box-search" type="text" value="\${boxQuery}" oninput="boxQuery=this.value;render();const inp=document.getElementById('box-search');inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length);" placeholder="ابحث داخل \${box.titleAr} عن اسم المورد أو رقم المستند..." class="w-full pr-10 pl-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-600" />
            </div>
            <div class="overflow-x-auto border border-slate-200 rounded-xl">
              <table class="w-full text-right text-sm">
                <thead class="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th class="px-4 py-3">#</th>
                    <th class="px-4 py-3">الظرف / الملف</th>
                    <th class="px-4 py-3">اسم المورد / البيان</th>
                    <th class="px-4 py-3">رقم المستند</th>
                    <th class="px-4 py-3">رقم الشيك / السنة</th>
                    <th class="px-4 py-3">ملاحظات وتفاصيل</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  \${rows.map(r => \`
                    <tr class="hover:bg-slate-50">
                      <td class="px-4 py-2.5 mono text-xs text-slate-500">\${r.fileNo}</td>
                      <td class="px-4 py-2.5 text-xs text-slate-700 whitespace-nowrap">\${r.envelopeLabel}</td>
                      <td class="px-4 py-2.5 font-semibold text-slate-900">\${r.supplierName}</td>
                      <td class="px-4 py-2.5 mono text-xs text-blue-700">\${r.docNo}</td>
                      <td class="px-4 py-2.5 mono text-xs text-slate-700">\${r.checkNo !== '—' ? r.checkNo : r.year}</td>
                      <td class="px-4 py-2.5 text-xs text-slate-500">\${r.notes}</td>
                    </tr>
                  \`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        \`;
      } else if (currentTab === 'qrcodes') {
        el.innerHTML = \`
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            \${filteredBoxes.map(b => {
              const link = getBoxLink(b.id);
              const qr = makeQrDataUrl(link, 140);
              return \`
                <div class="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h3 class="font-display font-bold text-lg text-slate-900">\${b.titleAr}</h3>
                      <p class="text-xs text-slate-500">\${b.categoryScope}</p>
                      <p class="text-xs mono text-slate-600 mt-1">السنة: \${b.years.join('/')} · الملفات: \${b.files.length}</p>
                    </div>
                    <img src="\${qr}" class="w-24 h-24 border border-slate-200 rounded-lg p-1 shrink-0" alt="QR" />
                  </div>
                  <div class="border-t border-b border-slate-100 py-2">
                    \${barcodeSvg(b.barcodeValue, 36)}
                  </div>
                  <div class="text-[11px] mono text-slate-500 truncate bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200" dir="ltr">\${link}</div>
                  <div class="flex items-center gap-2">
                    <button onclick="printLabels(\${b.id})" class="flex-1 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800"><i class="fa-solid fa-print ml-1"></i>طباعة الملصق</button>
                    <button onclick="switchTab('boxes', \${b.id})" class="px-3 py-2 border border-slate-200 text-xs font-medium rounded-lg hover:bg-slate-50">فتح الصندوق</button>
                  </div>
                </div>
              \`;
            }).join('')}
          </div>
        \`;
      }
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('box')) {
      const bid = Number(params.get('box'));
      if (BOXES.some(b => b.id === bid)) {
        switchTab('boxes', bid);
      } else {
        render();
      }
    } else {
      render();
    }
  </script>
</body>
</html>`;
}

export function downloadStandaloneHtml(): void {
  const html = buildStandaloneSingleFileHtml(window.location.href);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'Smart_Docs_EArchive_Boxes_1_to_13.html';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

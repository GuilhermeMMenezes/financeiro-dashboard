/* ============================================================
   FINANCEIRO DASHBOARD — APP.JS
   ============================================================ */

'use strict';

// ── State ────────────────────────────────────────────────────
const state = {
  allTransactions: [],   // todas as transações de todos os bancos
  transactions:    [],   // view filtrada
  banks:           [],   // [{ id, name, color, filename }]
  activeBankFilter:'all',
  charts:          {},
  sortCol:  'data',
  sortDir:  'desc',
  page:      1,
  pageSize:  20,
  searchQuery: '',
  editingId:   null,
  renamingBankId: null,
};

// ── Categories ───────────────────────────────────────────────
const CATEGORIES = [
  'Fornecedores','Funcionários','Impostos','Marketing','Mídia',
  'Aluguel','Plataforma / Sistemas','Taxas Bancárias','Transferências',
  'Retiradas','Pró-labore','Clientes / Recebimentos','Outros',
];

const CATEGORY_KEYWORDS = [
  { kw: ['salario','salário','folha pagamento','pagamento func','holerite','rescisao','rescisão','13o','décimo','ferias','férias'], cat: 'Funcionários', tipo: 'saída' },
  { kw: ['pro labore','pró-labore','prolabore','pro-labore'], cat: 'Pró-labore', tipo: 'saída' },
  { kw: ['aluguel','locacao','locação','alug.','imovel','imóvel','condominio'], cat: 'Aluguel', tipo: 'saída' },
  { kw: ['darf','das ','irpj','csll','cofins','pis/','inss','fgts','simples nacional','iss ','imposto','tributo','receita federal'], cat: 'Impostos', tipo: 'saída' },
  { kw: ['marketing','publicidade','propaganda','google ads','meta ads','facebook ads','instagram ads','tiktok','influencer'], cat: 'Marketing', tipo: 'saída' },
  { kw: ['midia','mídia','tv ','radio','rádio','jornal','revista','out-of-home','ooh '], cat: 'Mídia', tipo: 'saída' },
  { kw: ['netflix','spotify','amazon','adobe','office 365','google workspace','software','sistema','plataforma','saas','assinatura','subscription','hostinger','hostgator','aws ','azure','digitalocean'], cat: 'Plataforma / Sistemas', tipo: 'saída' },
  { kw: ['tarifa','taxa banc','iof ','anuidade','cpmf','cobrança banco','manutencao conta','manutenção conta','ted cobr','doc cobr','pacote serv'], cat: 'Taxas Bancárias' },
  { kw: ['retirada','saque','resgat'], cat: 'Retiradas', tipo: 'saída' },
  { kw: ['pix recebido','ted recebido','doc recebido','transf recebida','transferencia recebida','transferência recebida','deposito','depósito','recebimento','pagamento recebido','cobrança paga'], cat: 'Clientes / Recebimentos', tipo: 'entrada' },
  { kw: ['pix','ted ','doc ','transf','transferencia','transferência'], cat: 'Transferências' },
  { kw: ['fornecedor','nf-e','nota fiscal','compra ','aquisicao','aquisição','pagamento a'], cat: 'Fornecedores', tipo: 'saída' },
];

const CHART_COLORS = [
  '#a3e635','#22c55e','#06b6d4','#8b5cf6','#f59e0b',
  '#f43f5e','#3b82f6','#ec4899','#14b8a6','#f97316',
  '#84cc16','#6366f1','#10b981','#0ea5e9','#d946ef',
];

const BANK_COLORS = [
  '#a3e635','#06b6d4','#f59e0b','#8b5cf6','#f43f5e',
  '#22c55e','#ec4899','#3b82f6','#14b8a6','#f97316',
];

// ── DOM Helpers ──────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupUpload();
  setupModal();
  setupRenameModal();
  setupSearch();
  setupSort();
  setupExport();
  setupAI();
  $('#btn-reset-all').addEventListener('click', confirmReset);
});

// ============================================================
// UPLOAD & FILE HANDLING
// ============================================================
function setupUpload() {
  const dropZone  = $('#drop-zone');
  const fileInput = $('#file-input');
  const btnSelect = $('#btn-select-file');
  const addInput  = $('#file-input-add');

  btnSelect.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0], null);
    e.target.value = '';
  });

  addInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0], null);
    e.target.value = '';
  });

  dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file, null);
  });
}

async function handleFile(file, existingBankId) {
  const ext = file.name.split('.').pop().toLowerCase();
  showLoading('Processando extrato...');

  try {
    let transactions = [];
    let detectedName = '';

    if (ext === 'csv') {
      const text = await readFileAsText(file);
      detectedName = detectBankName(text, file.name);
      transactions = parseCSV(text);

    } else if (ext === 'xlsx' || ext === 'xls') {
      const buf = await readFileAsBuffer(file);
      detectedName = detectBankName('', file.name);
      transactions = parseExcel(buf);

    } else if (ext === 'pdf') {
      const buf = await readFileAsBuffer(file);
      const { transactions: txs, text } = await parsePDF(buf);
      detectedName = detectBankName(text, file.name);
      transactions = txs;

    } else {
      hideLoading();
      showToast('Formato não suportado. Use PDF, CSV ou Excel (.xlsx).', 'error');
      return;
    }

    hideLoading();

    if (!transactions || transactions.length === 0) {
      showToast('Nenhuma transação encontrada no arquivo.', 'error');
      return;
    }

    // Create or reuse bank entry
    let bankId = existingBankId;
    if (!bankId) {
      bankId = Date.now();
      const colorIdx = state.banks.length % BANK_COLORS.length;
      state.banks.push({ id: bankId, name: detectedName || 'Banco', color: BANK_COLORS[colorIdx], filename: file.name });
    }

    // Tag all transactions with bankId
    transactions.forEach(t => { t.bankId = bankId; });

    // Merge into global pool
    state.allTransactions.push(...transactions);

    // Update bank transaction count
    const bank = state.banks.find(b => b.id === bankId);
    if (bank) bank.count = state.allTransactions.filter(t => t.bankId === bankId).length;

    // Show dashboard
    if ($('#dashboard').classList.contains('hidden')) {
      $('#upload-section').classList.add('hidden');
      $('#dashboard').classList.remove('hidden');
    }

    updateDashboardSubtitle();
    renderBankTabs();
    state.page = 1;
    applyFilters();
    showToast(`${transactions.length} transações adicionadas (${bank ? bank.name : ''})`, 'success');

    // If bank name is generic, prompt rename
    if (!detectedName || detectedName === 'Banco') {
      setTimeout(() => openRenameModal(bankId), 600);
    }

  } catch (err) {
    hideLoading();
    showToast('Erro ao processar arquivo: ' + err.message, 'error');
    console.error(err);
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsText(file, 'UTF-8');
  });
}

function readFileAsBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

function updateDashboardSubtitle() {
  const total = state.allTransactions.length;
  const banks = state.banks.map(b => b.name).join(', ');
  $('#dashboard-subtitle').textContent = `${total} transações · ${banks}`;
}

// ============================================================
// BANK DETECTION
// ============================================================
function detectBankName(content, filename) {
  const haystack = (content.slice(0, 3000) + ' ' + filename).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (/itau/.test(haystack))                      return 'Itaú';
  if (/bradesco/.test(haystack))                  return 'Bradesco';
  if (/nubank|nu pagamentos/.test(haystack))      return 'Nubank';
  if (/santander/.test(haystack))                 return 'Santander';
  if (/caixa economica|caixa federal|cef /.test(haystack)) return 'Caixa Econômica';
  if (/banco do brasil|bco brasil/.test(haystack))return 'Banco do Brasil';
  if (/btg pactual|btg/.test(haystack))           return 'BTG Pactual';
  if (/banco inter|inter\.co/.test(haystack))     return 'Banco Inter';
  if (/c6 bank|c6bank/.test(haystack))            return 'C6 Bank';
  if (/sicoob/.test(haystack))                    return 'Sicoob';
  if (/sicredi/.test(haystack))                   return 'Sicredi';
  if (/banco original/.test(haystack))            return 'Banco Original';
  if (/xp investimentos|xp bank/.test(haystack))  return 'XP';
  if (/mercado pago/.test(haystack))              return 'Mercado Pago';
  if (/pagseguro|pagbank/.test(haystack))         return 'PagBank';
  if (/picpay/.test(haystack))                    return 'PicPay';

  // Fallback: clean up filename
  const name = filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_\-\.]/g, ' ')
    .replace(/\b(extrato|statement|bank|account|conta)\b/gi, '')
    .trim();
  return name || '';
}

// ============================================================
// BANK TABS
// ============================================================
function renderBankTabs() {
  const bar = $('#bank-bar');
  bar.innerHTML = '';

  // "Todos" tab
  const allTab = document.createElement('button');
  allTab.className = 'bank-tab' + (state.activeBankFilter === 'all' ? ' active' : '');
  allTab.dataset.bank = 'all';
  const totalCount = state.allTransactions.length;
  allTab.innerHTML = `<span class="bank-tab-name">Todos os Bancos</span><span class="bank-tab-count">${totalCount}</span>`;
  allTab.addEventListener('click', () => { state.activeBankFilter = 'all'; state.page = 1; renderBankTabs(); applyFilters(); });
  bar.appendChild(allTab);

  // One tab per bank
  state.banks.forEach(bank => {
    const tab = document.createElement('button');
    tab.className = 'bank-tab' + (state.activeBankFilter === bank.id ? ' active' : '');
    tab.dataset.bank = bank.id;
    const count = state.allTransactions.filter(t => t.bankId === bank.id).length;
    tab.innerHTML = `
      <span class="bank-dot" style="background:${bank.color}"></span>
      <span class="bank-tab-name">${escHtml(bank.name)}</span>
      <span class="bank-tab-count">${count}</span>
      <button class="bank-tab-rename" data-bankid="${bank.id}" title="Renomear">✎</button>
    `;
    tab.addEventListener('click', (e) => {
      if (e.target.closest('.bank-tab-rename')) return;
      state.activeBankFilter = bank.id;
      state.page = 1;
      renderBankTabs();
      applyFilters();
    });
    tab.querySelector('.bank-tab-rename').addEventListener('click', (e) => {
      e.stopPropagation();
      openRenameModal(bank.id);
    });
    bar.appendChild(tab);
  });

  // "+ Adicionar Banco" button
  const addBtn = document.createElement('button');
  addBtn.className = 'bank-tab bank-tab-add';
  addBtn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
    Adicionar Banco
  `;
  addBtn.addEventListener('click', () => $('#file-input-add').click());
  bar.appendChild(addBtn);
}

// ============================================================
// RENAME BANK MODAL
// ============================================================
function setupRenameModal() {
  $('#rename-cancel').addEventListener('click', closeRenameModal);
  $('#rename-save').addEventListener('click', saveRename);
  $('#rename-modal').addEventListener('click', (e) => {
    if (e.target === $('#rename-modal')) closeRenameModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !$('#rename-modal').classList.contains('hidden')) saveRename();
  });
}

function openRenameModal(bankId) {
  const bank = state.banks.find(b => b.id === bankId);
  if (!bank) return;
  state.renamingBankId = bankId;
  $('#rename-input').value = bank.name;
  $('#rename-modal').classList.remove('hidden');
  setTimeout(() => $('#rename-input').select(), 50);
}

function closeRenameModal() {
  $('#rename-modal').classList.add('hidden');
  state.renamingBankId = null;
}

function saveRename() {
  const bank = state.banks.find(b => b.id === state.renamingBankId);
  if (!bank) return;
  const newName = $('#rename-input').value.trim();
  if (newName) {
    bank.name = newName;
    renderBankTabs();
    updateDashboardSubtitle();
    showToast(`Banco renomeado para "${newName}"`, 'success');
  }
  closeRenameModal();
}

// ============================================================
// CSV PARSER
// ============================================================
function parseCSV(content) {
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);

  const firstLines = content.split('\n').slice(0, 5).join('\n');
  const sep = (firstLines.match(/;/g) || []).length > (firstLines.match(/,/g) || []).length ? ';' : ',';

  const result = Papa.parse(content, { delimiter: sep, header: false, skipEmptyLines: 'greedy' });
  const rows = result.data;
  if (!rows || rows.length < 2) throw new Error('Arquivo CSV vazio ou inválido.');

  let headerIdx = findHeaderRow(rows);
  if (headerIdx === -1) headerIdx = 0;

  const headers = rows[headerIdx].map(h => String(h).toLowerCase().trim());
  const dataRows = rows.slice(headerIdx + 1).filter(r => r.some(c => c !== ''));
  const colMap = detectColumns(headers);

  return dataRows.map((row, idx) => buildTransaction(row, colMap, idx)).filter(Boolean);
}

function findHeaderRow(rows) {
  const kw = ['data','date','valor','value','descrição','descricao','description',
    'historico','histórico','lançamento','lancamento','débito','credito','crédito','débito'];
  let bestRow = 0, bestScore = 0;
  rows.slice(0, 10).forEach((row, idx) => {
    const score = row.reduce((acc, cell) => {
      const c = String(cell).toLowerCase().trim();
      return acc + (kw.some(k => c.includes(k)) ? 1 : 0);
    }, 0);
    if (score > bestScore) { bestScore = score; bestRow = idx; }
  });
  return bestRow;
}

function detectColumns(headers) {
  const map = { data: -1, descricao: -1, valor: -1, credito: -1, debito: -1, tipo: -1, favorecido: -1, saldo: -1 };
  const matchers = {
    data:       ['data','date','dt.','dt ','lançamento','competência'],
    descricao:  ['descrição','descricao','historico','histórico','memo','description','complemento','lançamento','lancamento','detalhe'],
    valor:      ['valor','value','amount','montante'],
    credito:    ['crédito','credito','entrada','credit','receita','recebimento'],
    debito:     ['débito','debito','saída','debit','despesa','pagamento'],
    favorecido: ['favorecido','beneficiario','beneficiário','remetente','origin','destino','nome'],
    tipo:       ['tipo','type','operação','operacao','nature'],
    saldo:      ['saldo','balance'],
  };
  headers.forEach((h, idx) => {
    for (const [key, patterns] of Object.entries(matchers)) {
      if (map[key] === -1 && patterns.some(p => h.includes(p))) map[key] = idx;
    }
  });
  return map;
}

function buildTransaction(row, colMap, idx) {
  const get = (col) => colMap[col] >= 0 && colMap[col] < row.length ? String(row[colMap[col]] || '').trim() : '';

  const rawData    = get('data');
  const rawDesc    = get('descricao') || get('favorecido');
  const rawValor   = get('valor');
  const rawCredito = get('credito');
  const rawDebito  = get('debito');
  const rawFav     = get('favorecido');
  const rawTipo    = get('tipo');

  if (!rawData && !rawDesc && !rawValor && !rawCredito && !rawDebito) return null;

  const data = normalizeDate(rawData);
  const descricao = rawDesc || 'Sem descrição';
  const favorecido = rawFav || '';

  let valor = 0, tipo = 'saída';

  if (rawCredito && rawDebito) {
    const cred = parseBRNumber(rawCredito);
    const deb  = parseBRNumber(rawDebito);
    if (cred > 0)     { valor = cred; tipo = 'entrada'; }
    else if (deb > 0) { valor = deb;  tipo = 'saída'; }
  } else if (rawValor) {
    const rawV = parseBRNumber(rawValor);
    valor = Math.abs(rawV);
    if (rawV !== 0) {
      // Sinal do número tem prioridade absoluta: negativo = saída, positivo = entrada
      tipo = rawV < 0 ? 'saída' : 'entrada';
    } else if (rawTipo) {
      const t = rawTipo.toLowerCase();
      tipo = (t.includes('créd') || t.includes('cred') || t.includes('entrada') || t.includes('rec')) ? 'entrada' : 'saída';
    }
  }

  if (valor === 0 && !descricao) return null;

  return {
    id: Date.now() + idx,
    data, descricao, favorecido, tipo,
    categoria:    autoCategorize(descricao + ' ' + favorecido, tipo),
    subcategoria: '',
    valor,
    obs:    '',
    bankId: null,
  };
}

// ============================================================
// EXCEL PARSER
// ============================================================
function parseExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

  if (!rows || rows.length < 2) throw new Error('Planilha vazia ou sem dados.');

  let headerIdx = findHeaderRow(rows.map(r => r.map(c => String(c))));
  const headers = rows[headerIdx].map(h => String(h).toLowerCase().trim());
  const dataRows = rows.slice(headerIdx + 1).filter(r => r.some(c => c !== ''));
  const colMap = detectColumns(headers);

  return dataRows.map((row, idx) =>
    buildTransaction(row.map(c => String(c)), colMap, idx)
  ).filter(Boolean);
}

// ============================================================
// PDF PARSER
// ============================================================
async function parsePDF(buffer) {
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  if (!pdfjsLib) throw new Error('PDF.js não carregou. Verifique a conexão e tente novamente.');

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const allPageItems = [];
  let fullText = '';

  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const vp      = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const items = content.items
      .filter(item => item.str && item.str.trim())
      .map(item => ({
        text: item.str.trim(),
        x:    Math.round(item.transform[4]),
        y:    Math.round(vp.height - item.transform[5]),
      }));

    fullText += items.map(i => i.text).join(' ') + ' ';
    allPageItems.push(items);
  }

  return { transactions: buildTransactionsFromPDFItems(allPageItems), text: fullText };
}

function buildTransactionsFromPDFItems(pages) {
  const transactions = [];
  let idx = 0;

  pages.forEach(items => {
    if (!items.length) return;

    const lineMap = new Map();
    items.forEach(item => {
      let key = null;
      for (const [k] of lineMap) {
        if (Math.abs(k - item.y) <= 4) { key = k; break; }
      }
      if (key === null) { lineMap.set(item.y, []); key = item.y; }
      lineMap.get(key).push(item);
    });

    const lines = [...lineMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, its]) => its.sort((a, b) => a.x - b.x));

    lines.forEach(lineItems => {
      const lineText = lineItems.map(i => i.text).join(' ');
      const tx = tryParseTransactionLine(lineText, idx);
      if (tx) { transactions.push(tx); idx++; }
    });
  });

  return transactions;
}

function tryParseTransactionLine(lineText, idx) {
  const dateRx   = /\b(\d{2}[\/\-]\d{2}(?:[\/\-]\d{2,4})?)\b/;
  const dateMatch = lineText.match(dateRx);
  if (!dateMatch) return null;

  const valueRx = /(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})/g;
  const values  = [...lineText.matchAll(valueRx)];
  if (!values.length) return null;

  const dateEnd       = dateMatch.index + dateMatch[0].length;
  const firstValuePos = values[0].index;
  let description     = firstValuePos > dateEnd
    ? lineText.slice(dateEnd, firstValuePos).trim()
    : lineText.slice(dateEnd).replace(valueRx, '').trim();

  description = description.replace(/\s{2,}/g, ' ').trim() || 'Sem descrição';

  const txValueStr = values.length >= 2 ? values[values.length - 2][0] : values[0][0];
  const rawVal = parseBRNumber(txValueStr);
  const valor  = Math.abs(rawVal);
  if (valor === 0) return null;

  const tipo = rawVal < 0 ? 'saída' : detectTipoFromText(lineText, description);

  return {
    id: Date.now() + idx,
    data:         normalizeDate(dateMatch[1]),
    descricao:    description,
    favorecido:   '',
    tipo,
    categoria:    autoCategorize(description, tipo),
    subcategoria: '',
    valor,
    obs:          '',
    bankId:       null,
  };
}

function detectTipoFromText(lineText, desc) {
  const t = lineText.toLowerCase();
  if (/créd|credito|entrada|recebido|recebimento|depósito|deposito/.test(t)) return 'entrada';
  if (/déb|debito|saída|saida|pagamento|retirada/.test(t)) return 'saída';
  const entradaKw = ['recebido','recebimento','deposito','depósito','pix receb','ted receb'];
  if (entradaKw.some(k => desc.toLowerCase().includes(k))) return 'entrada';
  return 'saída';
}

// ============================================================
// AUTO-CATEGORIZE
// ============================================================
function autoCategorize(text, tipo) {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const rule of CATEGORY_KEYWORDS) {
    if (rule.tipo && rule.tipo !== tipo) continue;
    if (rule.kw.some(k => t.includes(k.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) {
      return rule.cat;
    }
  }
  return 'Outros';
}

// ============================================================
// NUMBER / DATE HELPERS
// ============================================================
function parseBRNumber(str) {
  if (!str || str === '' || str === '-') return 0;
  let s = String(str).replace(/[R$\s]/g, '').trim();
  if (s.includes(',') && s.includes('.')) {
    const lastComma = s.lastIndexOf(',');
    const lastDot   = s.lastIndexOf('.');
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  return parseFloat(s) || 0;
}

function normalizeDate(raw) {
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = raw.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return raw;
}

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d || '??'}/${m || '??'}/${y || '??'}`;
}

function formatCurrency(val) {
  if (isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCurrencyShort(val) {
  if (Math.abs(val) >= 1e6) return 'R$ ' + (val / 1e6).toFixed(1) + 'M';
  if (Math.abs(val) >= 1e3) return 'R$ ' + (val / 1e3).toFixed(1) + 'k';
  return formatCurrency(val);
}

// ============================================================
// FILTERS
// ============================================================
function applyFilters() {
  let txs = [...state.allTransactions];

  // Bank filter
  if (state.activeBankFilter !== 'all') {
    txs = txs.filter(t => t.bankId === state.activeBankFilter);
  }

  // Search
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    txs = txs.filter(t =>
      t.descricao.toLowerCase().includes(q) ||
      (t.favorecido || '').toLowerCase().includes(q) ||
      t.categoria.toLowerCase().includes(q)
    );
  }

  state.transactions = sortTransactions(txs, state.sortCol, state.sortDir);
  renderDashboard();
}

// ============================================================
// SORT
// ============================================================
function setupSort() {
  $$('.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      state.sortDir = (state.sortCol === col && state.sortDir === 'asc') ? 'desc' : 'asc';
      state.sortCol = col;
      $$('.sortable').forEach(el => {
        el.classList.remove('sort-asc', 'sort-desc');
        el.querySelector('.sort-icon').textContent = '↕';
      });
      th.classList.add('sort-' + state.sortDir);
      applyFilters();
    });
  });
}

function sortTransactions(txs, col, dir) {
  return [...txs].sort((a, b) => {
    let va = col === 'valor' ? a.valor : (a[col] ?? '');
    let vb = col === 'valor' ? b.valor : (b[col] ?? '');
    if (typeof va === 'number') return dir === 'asc' ? va - vb : vb - va;
    return dir === 'asc'
      ? String(va).localeCompare(String(vb), 'pt-BR')
      : String(vb).localeCompare(String(va), 'pt-BR');
  });
}

// ============================================================
// SEARCH
// ============================================================
function setupSearch() {
  let debounce;
  $('#search-input').addEventListener('input', (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.searchQuery = e.target.value.trim();
      state.page = 1;
      applyFilters();
    }, 250);
  });
}

// ============================================================
// RENDER DASHBOARD
// ============================================================
function renderDashboard() {
  renderKPIs();
  renderCharts();
  renderTable();
}

// ── KPIs ────────────────────────────────────────────────────
function renderKPIs() {
  const txs = state.transactions;
  const entradas = txs.filter(t => t.tipo === 'entrada');
  const saidas   = txs.filter(t => t.tipo === 'saída');

  const totalEntradas = entradas.reduce((s, t) => s + t.valor, 0);
  const totalSaidas   = saidas.reduce((s, t) => s + t.valor, 0);
  const saldo         = totalEntradas - totalSaidas;

  $('#kpi-entradas').textContent = formatCurrency(totalEntradas);
  $('#kpi-entradas-count').textContent = `${entradas.length} transaç${entradas.length !== 1 ? 'ões' : 'ão'}`;
  $('#kpi-saidas').textContent = formatCurrency(totalSaidas);
  $('#kpi-saidas-count').textContent = `${saidas.length} transaç${saidas.length !== 1 ? 'ões' : 'ão'}`;

  const saldoEl = $('#kpi-saldo');
  saldoEl.textContent = formatCurrency(Math.abs(saldo));
  saldoEl.className = 'kpi-value ' + (saldo >= 0 ? 'positive' : 'negative');
  $('#kpi-saldo-status').textContent = saldo >= 0 ? '▲ positivo' : '▼ negativo';

  $('#kpi-total').textContent = txs.length;
  const dates = txs.map(t => t.data).filter(Boolean).sort();
  if (dates.length > 0) {
    $('#kpi-periodo').textContent = `${formatDate(dates[0])} → ${formatDate(dates[dates.length - 1])}`;
  }

  $('#transactions-count').textContent = `${txs.length} registro${txs.length !== 1 ? 's' : ''}`;
  $('#center-saidas-value').textContent  = formatCurrencyShort(totalSaidas);
  $('#center-entradas-value').textContent = formatCurrencyShort(totalEntradas);
}

// ── Charts ───────────────────────────────────────────────────
function renderCharts() {
  const txs = state.transactions;
  renderDonut('chart-saidas',   groupByCategory(txs.filter(t => t.tipo === 'saída')),   'Saídas');
  renderDonut('chart-entradas', groupByCategory(txs.filter(t => t.tipo === 'entrada')), 'Entradas');
  renderBarChart('chart-top-saidas',   groupByCategory(txs.filter(t => t.tipo === 'saída')),   'saida');
  renderBarChart('chart-top-entradas', groupByCategory(txs.filter(t => t.tipo === 'entrada')), 'entrada');
}

function groupByCategory(txs) {
  const map = {};
  txs.forEach(t => { const c = t.categoria || 'Outros'; map[c] = (map[c] || 0) + t.valor; });
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  return { labels: entries.map(e => e[0]), values: entries.map(e => e[1]) };
}

function renderDonut(canvasId, data) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (state.charts[canvasId]) { state.charts[canvasId].destroy(); delete state.charts[canvasId]; }
  if (!data.labels.length) { ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height); return; }

  const colors = data.labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);
  const total  = data.values.reduce((s, v) => s + v, 0);

  state.charts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.labels,
      datasets: [{ data: data.values, backgroundColor: colors, borderColor: '#1a1a1a', borderWidth: 3, hoverBorderWidth: 4, hoverOffset: 6 }],
    },
    options: {
      cutout: '62%',
      animation: { duration: 500, easing: 'easeInOutQuart' },
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#e0e0e0',
            font: { size: 11, family: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' },
            padding: 12, usePointStyle: true, pointStyleWidth: 8,
            generateLabels: (chart) => {
              const ds = chart.data.datasets[0];
              return chart.data.labels.map((lbl, i) => {
                const val = ds.data[i];
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                return { text: `${lbl}  ${pct}%`, fillStyle: ds.backgroundColor[i], strokeStyle: ds.backgroundColor[i], lineWidth: 0, hidden: false, index: i, pointStyle: 'circle' };
              });
            },
          },
        },
        tooltip: {
          backgroundColor: '#1a1a1a', borderColor: '#333', borderWidth: 1,
          titleColor: '#f0f0f0', bodyColor: '#a0a0a0', padding: 12,
          callbacks: {
            title: (items) => items[0].label,
            label: (ctx) => {
              const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0.0';
              return `  ${formatCurrency(ctx.parsed)}  (${pct}%)`;
            },
          },
        },
      },
      layout: { padding: { left: 0, right: 8 } },
    },
  });
}

function renderBarChart(canvasId, data, tipo) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (state.charts[canvasId]) { state.charts[canvasId].destroy(); delete state.charts[canvasId]; }
  if (!data.labels.length) return;

  const top = { labels: data.labels.slice(0, 7), values: data.values.slice(0, 7) };
  const barColor = tipo === 'entrada' ? 'rgba(34,197,94,0.8)' : 'rgba(244,63,94,0.8)';
  const barHover = tipo === 'entrada' ? 'rgba(34,197,94,1)'   : 'rgba(244,63,94,1)';

  state.charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.labels,
      datasets: [{ data: top.values, backgroundColor: barColor, hoverBackgroundColor: barHover, borderRadius: 5, borderSkipped: false }],
    },
    options: {
      indexAxis: 'y',
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a1a1a', borderColor: '#333', borderWidth: 1,
          titleColor: '#f0f0f0', bodyColor: '#a0a0a0', padding: 10,
          callbacks: { label: (ctx) => `  ${formatCurrency(ctx.parsed.x)}` },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#555', font: { size: 10 }, callback: (v) => formatCurrencyShort(v) },
          border: { color: 'transparent' },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#a0a0a0', font: { size: 11 }, padding: 6 },
          border: { color: 'transparent' },
        },
      },
      layout: { padding: { right: 4 } },
    },
  });
}

// ============================================================
// TRANSACTIONS TABLE
// ============================================================
const CAT_OPTIONS = CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');

function renderTable() {
  const txs   = state.transactions;
  const start = (state.page - 1) * state.pageSize;
  const paged = txs.slice(start, start + state.pageSize);
  const tbody = $('#transactions-tbody');
  tbody.innerHTML = '';

  if (txs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><p>Nenhuma transação encontrada.</p></div></td></tr>`;
    $('#table-showing').textContent = 'Nenhum resultado';
    $('#pagination').innerHTML = '';
    return;
  }

  const showBankCol = state.activeBankFilter === 'all' && state.banks.length > 1;

  paged.forEach(tx => {
    const bank = state.banks.find(b => b.id === tx.bankId);
    const bankDot = bank ? `<span class="bank-dot-sm" style="background:${bank.color}"></span>` : '';
    const bankName = bank ? escHtml(bank.name) : '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-date">${formatDate(tx.data)}</td>
      <td class="td-desc" title="${escHtml(tx.descricao)}">
        <span class="td-desc-text">${escHtml(tx.descricao)}</span>
        ${tx.obs ? `<span class="td-sub"> · ${escHtml(tx.obs)}</span>` : ''}
      </td>
      <td class="td-favorecido" title="${escHtml(tx.favorecido || '')}">${escHtml(tx.favorecido || '') || '—'}</td>
      ${showBankCol ? `<td class="td-bank">${bankDot}${bankName}</td>` : ''}
      <td>
        <select class="tipo-inline-select ${tx.tipo === 'entrada' ? 'tipo-entrada' : 'tipo-saida'}" data-id="${tx.id}">
          <option value="entrada"${tx.tipo === 'entrada' ? ' selected' : ''}>▲ entrada</option>
          <option value="saída"${tx.tipo === 'saída' ? ' selected' : ''}>▼ saída</option>
        </select>
      </td>
      <td class="td-cat-cell">
        <select class="cat-inline-select" data-id="${tx.id}">
          ${CATEGORIES.map(c => `<option value="${c}"${c === tx.categoria ? ' selected' : ''}>${c}</option>`).join('')}
        </select>
      </td>
      <td class="td-valor ${tx.tipo === 'entrada' ? 'v-entrada' : 'v-saida'}">
        ${tx.tipo === 'entrada' ? '+' : '-'}${formatCurrency(tx.valor)}
      </td>
      <td class="td-center">
        <button class="btn-edit" data-id="${tx.id}" title="Editar todos os campos">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </td>`;
    tbody.appendChild(tr);
  });

  // Inline category change — updates charts immediately + saves AI learning
  tbody.querySelectorAll('.cat-inline-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const id  = Number(e.target.dataset.id);
      const tx  = state.allTransactions.find(t => t.id === id);
      if (!tx) return;
      tx.categoria = e.target.value;
      addAiLearningExample(tx);
      e.target.classList.add('cat-saved');
      setTimeout(() => e.target.classList.remove('cat-saved'), 600);
      applyFilters();
    });
  });

  // Inline tipo change + saves AI learning
  tbody.querySelectorAll('.tipo-inline-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const id = Number(e.target.dataset.id);
      const tx = state.allTransactions.find(t => t.id === id);
      if (!tx) return;
      tx.tipo = e.target.value;
      addAiLearningExample(tx);
      e.target.className = `tipo-inline-select ${tx.tipo === 'entrada' ? 'tipo-entrada' : 'tipo-saida'} cat-saved`;
      setTimeout(() => e.target.classList.remove('cat-saved'), 600);
      applyFilters();
    });
  });

  tbody.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(Number(btn.dataset.id)));
  });

  const end = start + state.pageSize;
  $('#table-showing').textContent =
    `Mostrando ${start + 1}–${Math.min(end, txs.length)} de ${txs.length} transações`;
  $('#transactions-count').textContent = `${txs.length} registro${txs.length !== 1 ? 's' : ''}`;
  renderPagination(txs.length);
}

function renderPagination(total) {
  const pages = Math.ceil(total / state.pageSize);
  const cur   = state.page;
  const pg    = $('#pagination');
  pg.innerHTML = '';
  if (pages <= 1) return;

  const addBtn = (label, page, active = false, disabled = false) => {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (active ? ' active' : '');
    btn.textContent = label;
    btn.disabled = disabled;
    if (!disabled) btn.addEventListener('click', () => { state.page = page; renderTable(); });
    pg.appendChild(btn);
  };

  addBtn('‹', cur - 1, false, cur <= 1);
  let s = Math.max(1, cur - 2), e = Math.min(pages, cur + 2);
  if (e - s < 4) { s = Math.max(1, e - 4); e = Math.min(pages, s + 4); }
  if (s > 1) { addBtn('1', 1); if (s > 2) addBtn('…', cur, false, true); }
  for (let p = s; p <= e; p++) addBtn(String(p), p, p === cur);
  if (e < pages) { if (e < pages - 1) addBtn('…', cur, false, true); addBtn(String(pages), pages); }
  addBtn('›', cur + 1, false, cur >= pages);
}

// ============================================================
// EDIT MODAL (full fields)
// ============================================================
function setupModal() {
  $('#modal-close').addEventListener('click', closeModal);
  $('#btn-cancel-edit').addEventListener('click', closeModal);
  $('#btn-save-edit').addEventListener('click', saveEdit);
  $('#edit-modal').addEventListener('click', (e) => { if (e.target === $('#edit-modal')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeRenameModal(); } });
}

function openEditModal(id) {
  const tx = state.allTransactions.find(t => t.id === id);
  if (!tx) return;
  state.editingId = id;
  $('#edit-id').value         = id;
  $('#edit-data').value       = tx.data || '';
  $('#edit-tipo').value       = tx.tipo || 'saída';
  $('#edit-descricao').value  = tx.descricao || '';
  $('#edit-favorecido').value = tx.favorecido || '';
  $('#edit-categoria').value  = tx.categoria || 'Outros';
  $('#edit-subcategoria').value = tx.subcategoria || '';
  $('#edit-valor').value      = tx.valor || '';
  $('#edit-obs').value        = tx.obs || '';
  $('#edit-modal').classList.remove('hidden');
}

function closeModal() {
  $('#edit-modal').classList.add('hidden');
  state.editingId = null;
}

function saveEdit() {
  const id = state.editingId;
  if (!id) return;
  const tx = state.allTransactions.find(t => t.id === id);
  if (!tx) return;

  tx.data         = $('#edit-data').value.trim();
  tx.tipo         = $('#edit-tipo').value;
  tx.descricao    = $('#edit-descricao').value.trim();
  tx.favorecido   = $('#edit-favorecido').value.trim();
  tx.categoria    = $('#edit-categoria').value;
  tx.subcategoria = $('#edit-subcategoria').value.trim();
  tx.valor        = Math.abs(parseFloat($('#edit-valor').value) || 0);
  tx.obs          = $('#edit-obs').value.trim();

  addAiLearningExample(tx);
  applyFilters();
  closeModal();
  showToast('Transação atualizada!', 'success');
}

// ============================================================
// EXPORT CSV
// ============================================================
function setupExport() {
  $('#btn-export').addEventListener('click', exportCSV);
}

function exportCSV() {
  const txs = state.transactions;
  if (!txs.length) return showToast('Nenhuma transação para exportar.', 'error');

  const header = ['Data','Descrição','Favorecido','Banco','Tipo','Categoria','Subcategoria','Valor','Observações'];
  const rows = txs.map(t => {
    const bank = state.banks.find(b => b.id === t.bankId);
    return [
      formatDate(t.data), t.descricao, t.favorecido, bank ? bank.name : '',
      t.tipo, t.categoria, t.subcategoria,
      t.valor.toFixed(2).replace('.', ','), t.obs,
    ];
  });

  const csv = [header, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `extrato_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Exportação concluída!', 'success');
}

// ============================================================
// RESET
// ============================================================
function confirmReset() {
  if (!state.allTransactions.length) return;
  if (!confirm('Limpar todos os extratos carregados?')) return;
  state.allTransactions = [];
  state.transactions    = [];
  state.banks           = [];
  state.activeBankFilter = 'all';
  Object.values(state.charts).forEach(c => c.destroy());
  state.charts = {};
  $('#dashboard').classList.add('hidden');
  $('#upload-section').classList.remove('hidden');
  $('#file-input').value = '';
  $('#search-input').value = '';
  state.searchQuery = '';
}

// ============================================================
// UI HELPERS
// ============================================================
function showToast(msg, type = 'info') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3500);
}

function showLoading(msg = 'Carregando...') {
  let el = document.getElementById('loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.className = 'loading-overlay';
    el.innerHTML = `<div class="spinner"></div><p class="loading-text">${msg}</p>`;
    document.body.appendChild(el);
  }
  el.querySelector('.loading-text').textContent = msg;
}

function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.remove();
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
// AI CLASSIFICATION
// ============================================================
const AI_KEY_STORAGE      = 'fin_ai_key';
const AI_LEARNING_STORAGE = 'fin_ai_learning';

function getAiLearning() {
  try { return JSON.parse(localStorage.getItem(AI_LEARNING_STORAGE) || '[]'); }
  catch { return []; }
}

function saveAiLearning(examples) {
  localStorage.setItem(AI_LEARNING_STORAGE, JSON.stringify(examples.slice(0, 150)));
}

// Called every time user manually corrects tipo or categoria
function addAiLearningExample(tx) {
  const examples = getAiLearning();
  const key = (tx.descricao || '') + '|' + (tx.favorecido || '');
  const idx = examples.findIndex(e => (e.descricao || '') + '|' + (e.favorecido || '') === key);
  const entry = {
    descricao:  tx.descricao  || '',
    favorecido: tx.favorecido || '',
    tipo:       tx.tipo       || 'saída',
    categoria:  tx.categoria  || 'Outros',
  };
  if (idx >= 0) examples[idx] = entry;
  else examples.unshift(entry);
  saveAiLearning(examples);
}

function openAiKeyModal() {
  const modal = $('#ai-key-modal');
  $('#ai-key-input').value = localStorage.getItem(AI_KEY_STORAGE) || '';
  // Show learning count
  const count = getAiLearning().length;
  const info  = $('#ai-learning-info');
  info.textContent = count > 0
    ? `🧠 ${count} exemplo${count !== 1 ? 's' : ''} de aprendizado salvos — a IA usará eles para classificar melhor.`
    : '';
  modal.classList.remove('hidden');
  setTimeout(() => $('#ai-key-input').focus(), 50);
}

function saveAiKey() {
  const key = $('#ai-key-input').value.trim();
  if (!key.startsWith('sk-ant-')) {
    showToast('Chave inválida. Deve começar com sk-ant-', 'error');
    return;
  }
  localStorage.setItem(AI_KEY_STORAGE, key);
  $('#ai-key-modal').classList.add('hidden');
  classifyWithAI();
}

function setupAI() {
  $('#btn-classify-ai').addEventListener('click', () => {
    const key = localStorage.getItem(AI_KEY_STORAGE);
    if (!key) openAiKeyModal();
    else classifyWithAI();
  });

  $('#btn-ai-settings').addEventListener('click', openAiKeyModal);

  $('#btn-save-ai-key').addEventListener('click', saveAiKey);

  $('#ai-key-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveAiKey();
  });

  $('#btn-clear-learning').addEventListener('click', () => {
    if (!confirm('Apagar todos os exemplos de aprendizado?')) return;
    localStorage.removeItem(AI_LEARNING_STORAGE);
    showToast('Aprendizado limpo.');
    $('#ai-learning-info').textContent = '';
  });
}

async function classifyWithAI() {
  const key = localStorage.getItem(AI_KEY_STORAGE);
  if (!key) { openAiKeyModal(); return; }

  const txs = state.allTransactions;
  if (!txs.length) { showToast('Importe um extrato primeiro.', 'error'); return; }

  const btn = $('#btn-classify-ai');
  btn.disabled = true;

  const examples  = getAiLearning().slice(0, 30);
  const BATCH_SZ  = 30;
  let processed = 0;

  try {
    for (let i = 0; i < txs.length; i += BATCH_SZ) {
      const batch = txs.slice(i, i + BATCH_SZ);
      await classifyBatch(batch, examples, key);
      processed += batch.length;
      btn.textContent = `Classificando ${Math.min(processed, txs.length)}/${txs.length}...`;
    }
    applyFilters();
    showToast(`✓ ${txs.length} transações classificadas com IA!`, 'success');
  } catch (err) {
    console.error('[AI]', err);
    const msg = err.message || '';
    if (msg.includes('401') || msg.includes('authentication')) {
      showToast('Chave de API inválida. Clique em ⚙ para corrigir.', 'error');
      localStorage.removeItem(AI_KEY_STORAGE);
    } else {
      showToast('Erro na IA: ' + msg.slice(0, 80), 'error');
    }
    if (processed > 0) applyFilters(); // apply partial results
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg> Classificar com IA`;
  }
}

async function classifyBatch(batch, examples, apiKey) {
  // Build few-shot examples block from user corrections
  let examplesBlock = '';
  if (examples.length > 0) {
    examplesBlock = '\n\nCORREÇÕES FEITAS PELO USUÁRIO (aprenda com estes padrões da empresa):\n';
    examples.forEach(e => {
      examplesBlock += `- "${e.descricao}"${e.favorecido ? ` | fav: "${e.favorecido}"` : ''} → tipo: ${e.tipo}, categoria: ${e.categoria}\n`;
    });
  }

  const txList = batch.map((tx, i) =>
    `${i + 1}. desc="${tx.descricao || ''}" | fav="${tx.favorecido || ''}" | R$${tx.valor}`
  ).join('\n');

  const prompt =
`Você é um classificador financeiro para uma empresa brasileira. Classifique cada transação.

CATEGORIAS: Fornecedores, Funcionários, Impostos, Marketing, Mídia, Aluguel, Plataforma / Sistemas, Taxas Bancárias, Transferências, Retiradas, Pró-labore, Clientes / Recebimentos, Outros

REGRAS:
- tipo "entrada" = dinheiro ENTRANDO (recebimento, depósito, PIX recebido, transferência recebida)
- tipo "saída"   = dinheiro SAINDO (pagamento, débito, PIX enviado, transferência enviada)
- Se contiver "recebido", "crédito", "depósito" → entrada
- Se contiver "enviado", "débito", "pagamento", "cobrança" → saída
- Salário/funcionário → Funcionários (saída)
- DARF, INSS, FGTS, Simples Nacional → Impostos (saída)
- Fornecedor, nota fiscal → Fornecedores (saída)
- Netflix, Spotify, AWS, software → Plataforma / Sistemas (saída)
- Tarifa banco, IOF, anuidade → Taxas Bancárias${examplesBlock}

TRANSAÇÕES:
${txList}

Responda SOMENTE com JSON array (sem texto extra):
[{"i":1,"tipo":"saída","cat":"Fornecedores"},{"i":2,"tipo":"entrada","cat":"Clientes / Recebimentos"},...]`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'x-api-key':     apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5',
      max_tokens: 2048,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  const data   = await res.json();
  const text   = data.content?.[0]?.text || '';
  const match  = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Resposta inesperada da IA');

  const results = JSON.parse(match[0]);
  results.forEach(r => {
    const tx = batch[r.i - 1];
    if (!tx) return;
    if (r.tipo === 'entrada' || r.tipo === 'saída') tx.tipo = r.tipo;
    if (CATEGORIES.includes(r.cat)) tx.categoria = r.cat;
  });
}

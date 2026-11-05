const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const headers = ['Fecha', 'Categoria', 'Contador', 'Lectura Anterior', 'Lectura Actual', 'Consumo', 'Unidad'];
const meter = 'MEDIDA 1 (0,18)';

function sheetRow(date, counter, previous, current, category = 'Electricidad', unit = 'kWh') {
  return [date, category, counter, previous, current, current - previous, unit];
}

class MemorySheet {
  constructor(rows = [], width = headers.length, initialHeaders = headers) {
    this.width = width;
    this.values = [initialHeaders, ...rows];
    this.failNextSetOnRow = null;
    this.frozen = 0;
  }
  getLastRow() {
    let last = this.values.length;
    while (last > 1 && this.values[last - 1].every(value => value === '' || value == null)) last--;
    return last;
  }
  getRange(row, col, rowCount, colCount) {
    return {
      getValues: () => Array.from({ length: rowCount }, (_, r) => Array.from({ length: colCount }, (_, c) => this.values[row - 1 + r]?.[col - 1 + c] ?? '')),
      setValues: values => {
        if (this.failNextSetOnRow === row) {
          this.failNextSetOnRow = null;
          throw new Error('simulated write failure');
        }
        values.forEach((line, r) => {
          const at = row - 1 + r;
          while (this.values.length <= at) this.values.push(Array(this.width).fill(''));
          const existing = this.values[at] || [];
          line.forEach((value, c) => { this.values[at][col - 1 + c] = value; });
          if (existing.length < this.width) this.values[at].length = this.width;
        });
      },
      clearContent: () => {
        for (let r = 0; r < rowCount; r++) {
          const at = row - 1 + r;
          if (this.values[at]) for (let c = 0; c < colCount; c++) this.values[at][col - 1 + c] = '';
        }
      }
    };
  }
  setFrozenRows(value) { this.frozen = value; }
}

function createAppsScript(rows = []) {
  const sheet = new MemorySheet(rows);
  const sheets = new Map([['Lecturas', sheet]]);
  let lockCount = 0;
  let backups = 0;
  const backupSnapshots = [];
  const spreadsheet = {
    getId: () => 'test-sheet-id',
    getName: () => 'Lecturas ficticias',
    getSheetByName: name => sheets.get(name) || null,
    insertSheet: name => {
      const newSheet = new MemorySheet([], 12, Array(12).fill(''));
      sheets.set(name, newSheet);
      return newSheet;
    },
    deleteSheet: sheetToDelete => {
      for (const [name, value] of sheets) if (value === sheetToDelete) sheets.delete(name);
    }
  };
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, flush() {} },
    LockService: { getScriptLock: () => ({ waitLock: () => { lockCount++; }, hasLock: () => true, releaseLock: () => { lockCount--; } }) },
    Utilities: { formatDate: date => date.toISOString().slice(0, 10), getUuid: () => 'test-repair-batch' },
    Session: { getScriptTimeZone: () => 'UTC' },
    MimeType: { GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet' },
    DriveApp: { getFileById: () => ({ makeCopy: name => {
      backups++;
      backupSnapshots.push(JSON.stringify(sheet.values));
      return { getId: () => `backup-${backups}`, getName: () => name, getMimeType: () => 'application/vnd.google-apps.spreadsheet' };
    } }) },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'appscript.gs'), 'utf8'), context);
  return { context, sheet, sheets, backupSnapshots, get lockCount() { return lockCount; }, get backups() { return backups; } };
}

function post(api, payload) {
  const result = api.context.doPost({ postData: { contents: JSON.stringify(payload) } });
  return JSON.parse(result.text);
}

function confirmRepair(api, changes) {
  const preview = post(api, { action: 'previewRepair', changes });
  return post(api, { action: 'repairReadings', changes, expectedSignature: preview.signature, confirmed: true });
}

function rowsFor(sheet, counter = meter) {
  return sheet.values.slice(1, sheet.getLastRow()).filter(row => row[2] === counter).map(row => ({
    Fecha: row[0], Categoria: row[1], Contador: row[2],
    'Lectura Anterior': Number(row[3]), 'Lectura Actual': Number(row[4]), Consumo: Number(row[5]), Unidad: row[6]
  })).sort((a, b) => a.Fecha.localeCompare(b.Fecha));
}

function updatePayload(date, value, counter = meter) {
  return {
    action: 'updateReading',
    original: { Fecha: date, Categoria: 'Electricidad', Contador: counter },
    row: { Fecha: date, Categoria: 'Electricidad', Contador: counter, 'Lectura Anterior': 0, 'Lectura Actual': value, Consumo: 0, Unidad: 'kWh' }
  };
}

function repairChange(date, oldValue, newValue, counter = meter, nextDate = date, category = 'Electricidad', unit = 'kWh') {
  return {
    original: { Fecha: date, Categoria: category, Contador: counter, 'Lectura Actual': oldValue },
    row: { Fecha: nextDate, Categoria: category, Contador: counter, 'Lectura Anterior': 0, 'Lectura Actual': newValue, Consumo: 0, Unidad: unit }
  };
}

function createBrowser(api) {
  const elements = new Map();
  const classes = new Set();
  class Element {
    constructor(id) {
      this.id = id; this.value = ''; this.textContent = ''; this.innerHTML = '';
      this.disabled = false; this.hidden = false; this.dataset = {};
      this.listeners = {}; this.classList = {
        toggle: (name, force) => force ? classes.add(`${id}:${name}`) : classes.delete(`${id}:${name}`),
        contains: name => classes.has(`${id}:${name}`)
      };
    }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    focus() {}
    set valueAsDate(date) { this.value = date.toISOString().slice(0, 10); }
    get valueAsDate() { return this.value ? new Date(`${this.value}T00:00:00Z`) : null; }
    closest() { return null; }
  }
  const document = {
    body: { classList: { toggle: () => {}, contains: () => false } },
    getElementById: id => elements.get(id) || (elements.set(id, new Element(id)), elements.get(id)),
    querySelectorAll: () => [],
    createElement: id => new Element(id)
  };
  class FakeChart {
    static created = [];
    constructor(canvas, config) { this.canvas = canvas; this.config = config; FakeChart.created.push(this); }
    destroy() {}
  }
  const localStorage = {
    getItem: key => key === 'contador.config.v1' ? JSON.stringify({ apiUrl: 'https://test.invalid/exec' }) : null,
    setItem() {}
  };
  const fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      const output = api.context.doPost({ postData: { contents: options.body } });
      return { ok: true, json: async () => JSON.parse(output.text) };
    }
    const output = api.context.doGet();
    return { ok: true, json: async () => JSON.parse(output.text) };
  };
  const context = { document, localStorage, fetch, Chart: FakeChart, window: { Chart: FakeChart, HISTORICAL_READINGS: [] }, console, confirm: () => true, setTimeout: fn => fn() };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context);
  return { context, elements, FakeChart };
}

test('añade una lectura atrasada y recalcula el tramo y las lecturas posteriores', () => {
  const api = createAppsScript([sheetRow('2026-10-01', meter, 0, 100), sheetRow('2026-10-03', meter, 100, 300)]);
  const result = post(api, { action: 'saveBatch', rows: [{ Fecha: '2026-10-02', Categoria: 'Electricidad', Contador: meter, 'Lectura Anterior': 100, 'Lectura Actual': 200, Consumo: 100, Unidad: 'kWh' }] });
  assert.equal(result.ok, true);
  assert.deepEqual(rowsFor(api.sheet).map(row => [row['Lectura Anterior'], row.Consumo]), [[100, 0], [100, 100], [200, 100]]);
});

test('acepta lecturas con fecha futura y conserva el orden lógico por fecha', () => {
  const api = createAppsScript([sheetRow('2026-10-01', meter, 0, 100)]);
  const result = post(api, { action: 'saveBatch', rows: [{ Fecha: '2027-01-01', Categoria: 'Electricidad', Contador: meter, 'Lectura Anterior': 100, 'Lectura Actual': 125, Consumo: 25, Unidad: 'kWh' }] });
  assert.equal(result.ok, true);
  assert.deepEqual(rowsFor(api.sheet).map(row => row.Fecha), ['2026-10-01', '2027-01-01']);
});

test('edita una fila existente, corrige 750000 a 75000 y recalcula vecinos', () => {
  const api = createAppsScript([
    sheetRow('2026-10-01', meter, 0, 74000),
    sheetRow('2026-10-02', meter, 74000, 750000),
    sheetRow('2026-10-03', meter, 750000, 75100)
  ]);
  const result = post(api, updatePayload('2026-10-02', 75000));
  assert.equal(result.updated, 1);
  assert.deepEqual(rowsFor(api.sheet).map(row => [row['Lectura Actual'], row.Consumo]), [[74000, 0], [75000, 1000], [75100, 100]]);
  assert.equal(api.sheet.getLastRow(), 4);
});

test('cambia la fecha de una lectura sin duplicarla ni cambiar el número de filas', () => {
  const api = createAppsScript([sheetRow('2026-10-01', meter, 0, 100), sheetRow('2026-10-03', meter, 100, 300)]);
  const result = post(api, {
    action: 'updateReading',
    original: { Fecha: '2026-10-03', Categoria: 'Electricidad', Contador: meter },
    row: { Fecha: '2026-10-02', Categoria: 'Electricidad', Contador: meter, 'Lectura Anterior': 100, 'Lectura Actual': 300, Consumo: 200, Unidad: 'kWh' }
  });
  assert.equal(result.updated, 1);
  assert.equal(api.sheet.getLastRow(), 3);
  assert.deepEqual(rowsFor(api.sheet).map(row => row.Fecha), ['2026-10-01', '2026-10-02']);
});

test('rechaza una secuencia realmente decreciente sin cambiar la hoja', () => {
  const api = createAppsScript([sheetRow('2026-10-01', meter, 0, 100), sheetRow('2026-10-02', meter, 100, 200)]);
  const before = JSON.stringify(api.sheet.values);
  const result = post(api, { action: 'saveBatch', rows: [{ Fecha: '2026-10-03', Categoria: 'Electricidad', Contador: meter, 'Lectura Anterior': 200, 'Lectura Actual': 150, Consumo: 0, Unidad: 'kWh' }] });
  assert.equal(result.ok, false);
  assert.match(result.error, /menor que la del/i);
  assert.equal(JSON.stringify(api.sheet.values), before);
});

test('evita duplicados por fecha y contador y permite repetir la misma petición', () => {
  const api = createAppsScript([sheetRow('2026-10-01', meter, 0, 100)]);
  const same = { Fecha: '2026-10-01', Categoria: 'Electricidad', Contador: meter, 'Lectura Anterior': 0, 'Lectura Actual': 100, Consumo: 100, Unidad: 'kWh' };
  assert.equal(post(api, { action: 'saveBatch', rows: [same] }).skipped, 1);
  const conflict = post(api, { action: 'saveBatch', rows: [{ ...same, 'Lectura Actual': 101 }] });
  assert.equal(conflict.ok, false);
  assert.equal(api.sheet.getLastRow(), 2);
});

test('solo recalcula el contador editado y conserva el resto del histórico', () => {
  const other = 'Agua Potable METER-2-1';
  const api = createAppsScript([
    sheetRow('2026-10-01', meter, 0, 100), sheetRow('2026-10-02', meter, 100, 200),
    sheetRow('2026-10-01', other, 0, 15, 'Agua', 'm³'), sheetRow('2026-10-02', other, 15, 20, 'Agua', 'm³')
  ]);
  const otherBefore = rowsFor(api.sheet, other);
  post(api, updatePayload('2026-10-02', 150));
  assert.deepEqual(rowsFor(api.sheet, other), otherBefore);
});

test('rechaza entradas no finitas, fecha inválida, unidad o contador incompatibles', () => {
  const api = createAppsScript();
  const base = { Fecha: '2026-10-01', Categoria: 'Electricidad', Contador: meter, 'Lectura Anterior': 0, 'Lectura Actual': 1, Consumo: 1, Unidad: 'kWh' };
  for (const row of [
    { ...base, 'Lectura Actual': 'Infinity' },
    { ...base, Fecha: '2026-02-30' },
    { ...base, Unidad: 'm³' },
    { ...base, Contador: 'Agua Potable METER-2-1' }
  ]) assert.equal(post(api, { action: 'saveBatch', rows: [row] }).ok, false);
  assert.equal(api.sheet.getLastRow(), 1);
});

test('si una escritura falla, restaura filas previas y libera el bloqueo', () => {
  const api = createAppsScript([sheetRow('2026-10-01', meter, 0, 100), sheetRow('2026-10-03', meter, 100, 300)]);
  const before = JSON.stringify(api.sheet.values);
  api.sheet.failNextSetOnRow = 3;
  const result = post(api, { action: 'saveBatch', rows: [{ Fecha: '2026-10-02', Categoria: 'Electricidad', Contador: meter, 'Lectura Anterior': 100, 'Lectura Actual': 200, Consumo: 100, Unidad: 'kWh' }] });
  assert.equal(result.ok, false);
  assert.match(result.error, /restauraron las filas/i);
  assert.equal(JSON.stringify(api.sheet.values), before);
  assert.equal(api.lockCount, 0);
});

test('no intenta resolver automáticamente lecturas duplicadas preexistentes', () => {
  const api = createAppsScript([sheetRow('2026-10-01', meter, 0, 100), sheetRow('2026-10-01', meter, 0, 110)]);
  const before = JSON.stringify(api.sheet.values);
  const result = post(api, updatePayload('2026-10-01', 105));
  assert.equal(result.ok, false);
  assert.match(result.error, /varias filas/i);
  assert.equal(JSON.stringify(api.sheet.values), before);
});

test('vista previa de reparación no escribe y permite corregir una lectura menor que el valor erróneo', () => {
  const api = createAppsScript([
    sheetRow('2026-08-19', meter, 129400, 129400),
    sheetRow('2026-08-20', meter, 129400, 1075531),
    sheetRow('2026-08-21', meter, 1075531, 130100)
  ]);
  const before = JSON.stringify(api.sheet.values);
  const preview = post(api, { action: 'previewRepair', changes: [repairChange('2026-08-20', 1075531, 129688)] });
  assert.equal(preview.ok, true);
  assert.equal(preview.canConfirm, true);
  assert.equal(preview.affectedCount, 2);
  assert.equal(JSON.stringify(api.sheet.values), before);
});

test('confirmar reparación hacia abajo recalcula lecturas posteriores y registra auditoría', () => {
  const api = createAppsScript([
    sheetRow('2026-08-19', meter, 129400, 129400),
    sheetRow('2026-08-20', meter, 129400, 1075531),
    sheetRow('2026-08-21', meter, 1075531, 130100),
    sheetRow('2026-08-19', 'MEDIDA 1 (0,58)', 0, 500)
  ]);
  const result = confirmRepair(api, [repairChange('2026-08-20', 1075531, 129688)]);
  assert.equal(result.ok, true);
  assert.equal(result.repaired, 1);
  assert.equal(result.backup.id, 'backup-1');
  assert.equal(api.backups, 1);
  assert.deepEqual(rowsFor(api.sheet).map(row => [row['Lectura Actual'], row['Lectura Anterior'], row.Consumo]), [
    [129400, 129400, 0], [129688, 129400, 288], [130100, 129688, 412]
  ]);
  assert.deepEqual(rowsFor(api.sheet, 'MEDIDA 1 (0,58)').map(row => row['Lectura Actual']), [500]);
  const audit = api.sheets.get('Registro de reparaciones');
  assert.ok(audit);
  assert.equal(audit.values[1][5], meter);
  assert.equal(audit.values[1][6], 1075531);
  assert.equal(audit.values[1][7], 129688);
});

test('corrige varias lecturas descendentes en un solo lote y crea copia completa antes de escribir', () => {
  const api = createAppsScript([
    sheetRow('2026-08-19', meter, 70000, 70000),
    sheetRow('2026-08-20', meter, 70000, 1075531),
    sheetRow('2026-08-21', meter, 1075531, 129000),
    sheetRow('2026-08-22', meter, 129000, 129688)
  ]);
  const changes = [repairChange('2026-08-20', 1075531, 128000), repairChange('2026-08-21', 129000, 129200)];
  const originalSheet = JSON.stringify(api.sheet.values);
  const preview = post(api, { action: 'previewRepair', changes });
  assert.equal(preview.canConfirm, true);
  assert.equal(preview.affectedCount, 3);
  const result = post(api, { action: 'repairReadings', changes, expectedSignature: preview.signature, confirmed: true });
  assert.equal(result.ok, true);
  assert.equal(api.backups, 1);
  assert.equal(api.backupSnapshots[0], originalSheet);
  assert.equal(result.backup.id, 'backup-1');
  assert.deepEqual(rowsFor(api.sheet).map(row => row.Consumo), [0, 58000, 1200, 488]);
  assert.equal(api.sheets.get('Registro de reparaciones').values.length, 4);
});

test('bloquea la reparación si el lote deja una bajada, sin tocar la hoja', () => {
  const api = createAppsScript([
    sheetRow('2026-08-19', meter, 0, 70000),
    sheetRow('2026-08-20', meter, 70000, 1075531),
    sheetRow('2026-08-21', meter, 1075531, 129000)
  ]);
  const before = JSON.stringify(api.sheet.values);
  const preview = post(api, { action: 'previewRepair', changes: [repairChange('2026-08-20', 1075531, 130000)] });
  assert.equal(preview.canConfirm, false);
  assert.match(preview.issues.join(' '), /Corrige también esa lectura/i);
  const previewAgain = post(api, { action: 'previewRepair', changes: [repairChange('2026-08-20', 1075531, 130000)] });
  const result = post(api, { action: 'repairReadings', changes: [repairChange('2026-08-20', 1075531, 130000)], expectedSignature: previewAgain.signature, confirmed: true });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(api.sheet.values), before);
  assert.equal(api.backups, 0);
});

test('rechaza duplicados y datos obsoletos en la reparación', () => {
  const api = createAppsScript([sheetRow('2026-08-20', meter, 0, 100), sheetRow('2026-08-21', meter, 100, 200)]);
  const duplicate = post(api, { action: 'previewRepair', changes: [repairChange('2026-08-20', 100, 150, meter, '2026-08-21')] });
  assert.equal(duplicate.canConfirm, false);
  assert.match(duplicate.issues.join(' '), /varias lecturas/i);
  const stale = post(api, { action: 'repairReadings', changes: [repairChange('2026-08-20', 99, 150)], confirmed: true });
  assert.equal(stale.ok, false);
  assert.equal(api.sheet.getLastRow(), 3);
});

test('impide confirmar una vista previa si otra fila del contador cambia antes de guardar', () => {
  const api = createAppsScript([sheetRow('2026-08-20', meter, 100, 100), sheetRow('2026-08-21', meter, 100, 200)]);
  const change = repairChange('2026-08-21', 200, 150);
  const preview = post(api, { action: 'previewRepair', changes: [change] });
  api.sheet.values[1][4] = 110;
  const result = post(api, { action: 'repairReadings', changes: [change], expectedSignature: preview.signature, confirmed: true });
  assert.equal(result.ok, false);
  assert.match(result.error, /cambió desde la vista previa/i);
  assert.equal(api.sheet.values[1][4], 110);
  assert.equal(api.sheet.values[2][4], 200);
});

test('la API de reparación exige confirmación explícita', () => {
  const api = createAppsScript([sheetRow('2026-08-20', meter, 100, 100), sheetRow('2026-08-21', meter, 100, 200)]);
  const changes = [repairChange('2026-08-21', 200, 150)];
  const preview = post(api, { action: 'previewRepair', changes });
  const result = post(api, { action: 'repairReadings', changes, expectedSignature: preview.signature });
  assert.equal(result.ok, false);
  assert.match(result.error, /confirmación explícita/i);
  assert.equal(api.sheet.values[2][4], 200);
});

test('no altera contadores distintos cuando una reparación afecta a uno solo', () => {
  const other = 'Agua PCI METER-2-2';
  const api = createAppsScript([
    sheetRow('2026-08-20', meter, 100, 100), sheetRow('2026-08-21', meter, 100, 1075531), sheetRow('2026-08-22', meter, 1075531, 1080000),
    sheetRow('2026-08-20', other, 0, 25, 'Agua', 'm³'), sheetRow('2026-08-21', other, 25, 28, 'Agua', 'm³')
  ]);
  const otherBefore = rowsFor(api.sheet, other);
  const result = confirmRepair(api, [repairChange('2026-08-21', 1075531, 200)]);
  assert.equal(result.ok, true);
  assert.deepEqual(rowsFor(api.sheet, other), otherBefore);
});

test('un fallo de escritura durante la reparación restaura las filas y libera LockService', () => {
  const api = createAppsScript([sheetRow('2026-08-20', meter, 0, 100), sheetRow('2026-08-21', meter, 100, 200)]);
  const before = JSON.stringify(api.sheet.values);
  api.sheet.failNextSetOnRow = 3;
  const result = confirmRepair(api, [repairChange('2026-08-20', 100, 150)]);
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(api.sheet.values), before);
  assert.equal(api.lockCount, 0);
});

test('el alta normal sigue rechazando una lectura inferior tras habilitar reparaciones explícitas', () => {
  const api = createAppsScript([sheetRow('2026-08-20', meter, 0, 100)]);
  const result = post(api, { action: 'saveBatch', rows: [{ Fecha: '2026-08-21', Categoria: 'Electricidad', Contador: meter, 'Lectura Anterior': 100, 'Lectura Actual': 90, Consumo: 0, Unidad: 'kWh' }] });
  assert.equal(result.ok, false);
  assert.equal(api.sheet.getLastRow(), 2);
});

test('buscar en histórico filtra lecturas reales por contador, año y mes y detecta saltos', async () => {
  const counter = 'Agua Potable METER-2-1';
  const api = createAppsScript([
    sheetRow('2025-08-01', counter, 10, 10, 'Agua', 'm³'),
    sheetRow('2026-08-01', counter, 10, 20, 'Agua', 'm³'),
    sheetRow('2026-08-02', counter, 20, 30, 'Agua', 'm³'),
    sheetRow('2026-08-03', counter, 30, 40, 'Agua', 'm³'),
    sheetRow('2026-08-04', counter, 40, 50, 'Agua', 'm³'),
    sheetRow('2026-08-05', counter, 50, 1050, 'Agua', 'm³')
  ]);
  const browser = createBrowser(api);
  await browser.context.loadData();
  browser.elements.get('repairCategory').value = 'Agua';
  browser.context.updateRepairCounterOptions();
  browser.elements.get('repairCounter').value = counter;
  browser.elements.get('repairYear').value = '2026';
  browser.elements.get('repairMonth').value = '08';
  browser.elements.get('repairSuspiciousOnly').checked = true;
  browser.context.renderRepairSearch();
  const html = browser.elements.get('repairResults').innerHTML;
  assert.match(html, /2026/);
  assert.match(html, /Salto anormal frente al histórico/);
  assert.doesNotMatch(html, /2025/);
  assert.equal((html.match(/<tr/g) || []).length, 1);
});

test('cancelar la vista previa de reparación conserva Sheets sin cambios', async () => {
  const api = createAppsScript([sheetRow('2026-08-20', meter, 100, 100), sheetRow('2026-08-21', meter, 100, 1075531), sheetRow('2026-08-22', meter, 1075531, 1080000)]);
  const before = JSON.stringify(api.sheet.values);
  const browser = createBrowser(api);
  await browser.context.loadData();
  const state = vm.runInContext('state', browser.context);
  const original = state.readings.find(row => row.Fecha === '2026-08-21');
  state.repairQueue.push({ original: { ...original }, row: { ...original, 'Lectura Actual': 200 } });
  const preview = await browser.context.postRows({ action: 'previewRepair', changes: [repairChange('2026-08-21', 1075531, 200)] });
  state.repairPreview = { changes: [repairChange('2026-08-21', 1075531, 200)], response: preview };
  browser.context.cancelRepairPreview();
  assert.equal(state.repairPreview, null);
  assert.equal(state.repairQueue.length, 1);
  assert.equal(JSON.stringify(api.sheet.values), before);
});

test('flujo de interfaz previsualiza y confirma una reparación desde el buscador', async () => {
  const api = createAppsScript([
    sheetRow('2026-08-20', meter, 100, 100),
    sheetRow('2026-08-21', meter, 100, 750000),
    sheetRow('2026-08-22', meter, 750000, 750100)
  ]);
  const browser = createBrowser(api);
  await browser.context.loadData();
  const state = vm.runInContext('state', browser.context);
  const original = state.readings.find(row => row.Fecha === '2026-08-21');
  state.repairQueue.push({ original: { ...original }, row: { ...original, 'Lectura Actual': '125' } });
  await browser.context.previewRepairBatch();
  assert.equal(state.repairPreview.response.canConfirm, true);
  assert.equal(JSON.parse(JSON.stringify(api.sheet.values[2]))[4], 750000);
  await browser.context.confirmRepairBatch();
  assert.equal(api.sheet.values[2][4], 125);
  assert.equal(api.sheet.values[3][5], 749975);
  assert.equal(state.repairQueue.length, 0);
  assert.equal(state.repairPreview, null);
});

test('el formulario corrige una lectura antigua, actualiza Sheets y vuelve a dibujar la interfaz', async () => {
  const api = createAppsScript([
    sheetRow('2026-10-01', meter, 0, 74000),
    sheetRow('2026-10-02', meter, 74000, 750000),
    sheetRow('2026-10-03', meter, 750000, 75100),
    sheetRow('2026-10-01', 'MEDIDA 1 (0,58)', 0, 100),
    sheetRow('2026-10-02', 'MEDIDA 1 (0,58)', 100, 110),
    sheetRow('2026-10-03', 'MEDIDA 1 (0,58)', 110, 120),
    sheetRow('2026-10-01', 'MEDIDA 1 (0,88)', 0, 500),
    sheetRow('2026-10-02', 'MEDIDA 1 (0,88)', 500, 510),
    sheetRow('2026-10-03', 'MEDIDA 1 (0,88)', 510, 520)
  ]);
  const browser = createBrowser(api);
  await browser.context.loadData();
  const state = vm.runInContext('state', browser.context);
  const row = state.readings.find(item => item.Contador === meter && item.Fecha === '2026-10-02');
  browser.context.beginEdit(row);
  assert.equal(browser.elements.get('electric018Now').disabled, false);
  assert.equal(browser.elements.get('electric058Now').disabled, true);
  assert.equal(browser.elements.get('electricEditStatus').hidden, false);
  browser.elements.get('electric018Now').value = '75000';
  await browser.context.saveCategory({ preventDefault() {} }, 'electric');
  const updated = state.readings.find(item => item.Contador === meter && item.Fecha === '2026-10-02');
  assert.equal(updated['Lectura Actual'], 75000);
  assert.equal(updated.Consumo, 1000);
  assert.equal(api.sheet.getLastRow(), 10);
  assert.match(browser.elements.get('electricBody').innerHTML, /Guardar|Editar/);
  assert.equal(browser.elements.get('saveElectricBtn').textContent, 'Guardar lectura');
  assert.equal(state.editing, null);
  assert.ok(browser.FakeChart.created.length > 0);
  const refreshedCharts = browser.FakeChart.created.slice(-7);
  assert.deepEqual(Array.from(refreshedCharts[0].config.data.datasets[0].data), [0, 1000, 100]);
  assert.match(browser.elements.get('electricAnnual').textContent, /kWh$/);
});

test('guarda una lectura atrasada desde el formulario y mantiene el filtro de tabla', async () => {
  const counters = [
    ['MEDIDA 1 (0,18)', 100, 300], ['MEDIDA 1 (0,58)', 10, 30], ['MEDIDA 1 (0,88)', 50, 90]
  ];
  const initial = counters.flatMap(([counter, first, last]) => [
    sheetRow('2026-10-01', counter, 0, first), sheetRow('2026-10-03', counter, first, last)
  ]);
  const api = createAppsScript(initial);
  const browser = createBrowser(api);
  await browser.context.loadData();
  browser.elements.get('electricDate').value = '2026-10-02';
  browser.context.fillPreviousReadings('electric');
  browser.elements.get('electric018Now').value = '200';
  browser.elements.get('electric058Now').value = '20';
  browser.elements.get('electric088Now').value = '70';
  browser.elements.get('electricFrom').value = '2026-10-02';
  browser.elements.get('electricTo').value = '2026-10-02';
  await browser.context.saveCategory({ preventDefault() {} }, 'electric');
  assert.equal(api.sheet.getLastRow(), 10);
  const state = vm.runInContext('state', browser.context);
  assert.equal(state.readings.filter(row => row.Fecha === '2026-10-02').length, 3);
  assert.equal(browser.elements.get('electricFrom').value, '2026-10-02');
  assert.equal(browser.elements.get('electricTo').value, '2026-10-02');
  assert.equal((browser.elements.get('electricBody').innerHTML.match(/<tr>/g) || []).length, 3);
});

test('la interfaz ofrece edición, conserva filtros y mantiene reglas responsive', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(app, /data-edit-key/);
  assert.match(html, /cancelElectricEditBtn/);
  assert.match(html, /cancelWaterEditBtn/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /\.table-wrap\s*\{[^}]*overflow:\s*auto/s);
});


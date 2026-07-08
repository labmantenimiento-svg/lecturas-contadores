const SHEET_NAME = 'Lecturas';
const HEADERS = ['Fecha', 'Categoria', 'Contador', 'Lectura Anterior', 'Lectura Actual', 'Consumo', 'Unidad'];

function doGet(e) {
  try {
    const sheet = getSheet_();
    ensureHeaders_(sheet);
    return json_({ ok: true, data: readRows_(sheet) });
  } catch (error) {
    return json_({ ok: false, error: error.message });
  }
}

function doPost(e) {
  try {
    const sheet = getSheet_();
    ensureHeaders_(sheet);
    const body = JSON.parse(e.postData.contents || '{}');
    const rows = Array.isArray(body.rows) ? body.rows : [body];
    const result = appendUniqueRows_(sheet, rows);
    return json_({ ok: true, inserted: result.inserted, skipped: result.skipped });
  } catch (error) {
    return json_({ ok: false, error: error.message });
  }
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function ensureHeaders_(sheet) {
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const needsHeaders = HEADERS.some((header, index) => firstRow[index] !== header);
  if (needsHeaders) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function readRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, HEADERS.length)
    .getValues()
    .filter(row => row[0] && row[1] && row[2])
    .map(mapRow_);
}

function appendUniqueRows_(sheet, inputRows) {
  const currentRows = readRows_(sheet);
  const existing = new Set(currentRows.map(rowKey_));
  const rowsToAdd = [];
  let skipped = 0;

  inputRows.forEach(input => {
    const row = normalizeInput_(input);
    validateRow_(row);
    const mappedRow = mapRow_(row);
    const key = rowKey_(mappedRow);
    if (existing.has(key)) {
      skipped++;
      return;
    }
    existing.add(key);
    rowsToAdd.push(mappedRow);
  });

  if (rowsToAdd.length) {
    const recalculated = recalculateRows_(currentRows.concat(rowsToAdd));
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).clearContent();
    }
    const values = recalculated.map(row => HEADERS.map(header => row[header]));
    sheet.getRange(2, 1, values.length, HEADERS.length).setValues(values);
  }

  return { inserted: rowsToAdd.length, skipped };
}

function recalculateRows_(rows) {
  const groups = {};
  rows.forEach(row => {
    if (!groups[row.Contador]) groups[row.Contador] = [];
    groups[row.Contador].push(Object.assign({}, row));
  });

  Object.keys(groups).forEach(counter => {
    groups[counter].sort((a, b) => String(a.Fecha).localeCompare(String(b.Fecha)));
    groups[counter].forEach((row, index) => {
      if (index === 0) {
        row['Lectura Anterior'] = row['Lectura Actual'];
        row.Consumo = 0;
        return;
      }
      const previous = groups[counter][index - 1]['Lectura Actual'];
      if (row['Lectura Actual'] < previous) {
        throw new Error(`${counter}: la lectura del ${row.Fecha} es menor que la lectura anterior`);
      }
      row['Lectura Anterior'] = previous;
      row.Consumo = row['Lectura Actual'] - previous;
    });
  });

  return Object.values(groups)
    .flat()
    .sort((a, b) => {
      const dateOrder = String(a.Fecha).localeCompare(String(b.Fecha));
      if (dateOrder !== 0) return dateOrder;
      const categoryOrder = String(a.Categoria).localeCompare(String(b.Categoria));
      if (categoryOrder !== 0) return categoryOrder;
      return String(a.Contador).localeCompare(String(b.Contador));
    });
}

function normalizeInput_(input) {
  return [
    input.Fecha || input.fecha,
    input.Categoria || input.categoria,
    input.Contador || input.contador,
    Number(input['Lectura Anterior'] ?? input.lecturaAnterior ?? 0),
    Number(input['Lectura Actual'] ?? input.lecturaActual ?? 0),
    Number(input.Consumo ?? input.consumo ?? 0),
    input.Unidad || input.unidad || ''
  ];
}

function mapRow_(row) {
  return {
    Fecha: formatDate_(row[0]),
    Categoria: row[1],
    Contador: row[2],
    'Lectura Anterior': Number(row[3] || 0),
    'Lectura Actual': Number(row[4] || 0),
    Consumo: Number(row[5] || 0),
    Unidad: row[6]
  };
}

function rowKey_(row) {
  return [row.Fecha, row.Categoria, row.Contador, row['Lectura Actual']].join('|');
}

function validateRow_(row) {
  if (!row[0]) throw new Error('La fecha es obligatoria');
  if (!['Electricidad', 'Agua'].includes(row[1])) throw new Error('Categoria no valida');
  if (!row[2]) throw new Error('El contador es obligatorio');
  if (row[4] < row[3]) throw new Error('La lectura actual no puede ser menor que la anterior');
}

function formatDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value);
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

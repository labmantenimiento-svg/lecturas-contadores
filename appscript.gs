const SHEET_NAME = 'Lecturas';
const HEADERS = ['Fecha', 'Tipo', 'Lectura Anterior', 'Lectura Actual', 'Consumo', 'Precio Unidad', 'Coste'];

function doGet(e) {
  try {
    const sheet = getSheet_();
    ensureHeaders_(sheet);
    const data = readRows_(sheet);
    return json_({ ok: true, data });
  } catch (error) {
    return json_({ ok: false, error: error.message });
  }
}

function doPost(e) {
  try {
    const sheet = getSheet_();
    ensureHeaders_(sheet);
    const body = JSON.parse(e.postData.contents || '{}');
    const row = [
      body.fecha,
      body.tipo,
      Number(body.lecturaAnterior || 0),
      Number(body.lecturaActual || 0),
      Number(body.consumo || 0),
      Number(body.precioUnidad || 0),
      Number(body.coste || 0)
    ];
    validateRow_(row);
    sheet.appendRow(row);
    return json_({ ok: true, saved: mapRow_(row) });
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
  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return values.filter(row => row[0] && row[1]).map(mapRow_);
}

function mapRow_(row) {
  return {
    Fecha: formatDate_(row[0]),
    Tipo: row[1],
    'Lectura Anterior': Number(row[2] || 0),
    'Lectura Actual': Number(row[3] || 0),
    Consumo: Number(row[4] || 0),
    'Precio Unidad': Number(row[5] || 0),
    Coste: Number(row[6] || 0)
  };
}

function validateRow_(row) {
  if (!row[0]) throw new Error('La fecha es obligatoria');
  if (!['Electricidad', 'Agua'].includes(row[1])) throw new Error('Tipo no valido');
  if (row[3] < row[2]) throw new Error('La lectura actual no puede ser menor que la anterior');
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

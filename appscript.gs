const SHEET_NAME = 'Lecturas';
const HEADERS = ['Fecha', 'Categoria', 'Contador', 'Lectura Anterior', 'Lectura Actual', 'Consumo', 'Unidad'];
const COUNTERS = {
  Electricidad: ['MEDIDA 1 (0,18)', 'MEDIDA 1 (0,58)', 'MEDIDA 1 (0,88)'],
  Agua: ['Agua Potable METER-2-1', 'Agua PCI METER-2-2']
};
const UNITS = { Electricidad: 'kWh', Agua: 'm³' };

function doGet() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const sheet = getSheet_();
    ensureHeaders_(sheet);
    return json_({ ok: true, data: readRows_(sheet) });
  } catch (error) {
    return json_({ ok: false, error: error.message });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const sheet = getSheet_();
    ensureHeaders_(sheet);
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = body.action || 'saveBatch';
    let result;
    if (action === 'updateReading') {
      result = updateReading_(sheet, body.original, body.row);
    } else if (action === 'saveBatch' || action === 'importBatch') {
      const rows = Array.isArray(body.rows) ? body.rows : [body];
      result = appendUniqueRows_(sheet, rows);
    } else {
      throw new Error('Operación no reconocida. Actualiza la página y vuelve a intentarlo.');
    }
    return json_(Object.assign({ ok: true }, result));
  } catch (error) {
    return json_({ ok: false, error: error.message || String(error) });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No se ha encontrado la hoja de cálculo vinculada al Apps Script.');
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function ensureHeaders_(sheet) {
  const values = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const empty = values.every(value => value === '' || value === null);
  const valid = HEADERS.every((header, index) => values[index] === header);
  if (empty) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  } else if (!valid) {
    throw new Error('Los encabezados de la hoja no coinciden. No se ha modificado ningún dato; revisa la estructura antes de continuar.');
  }
}

function readRows_(sheet) {
  return readRecords_(sheet).map(record => record.row).sort(compareRows_);
}

function readRecords_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return values.flatMap((raw, index) => {
    if (!raw[0] || !raw[1] || !raw[2]) return [];
    return [{ row: mapRow_(raw), sheetRow: index + 2 }];
  });
}

function appendUniqueRows_(sheet, inputRows) {
  if (!inputRows.length) throw new Error('No hay lecturas para guardar.');
  const records = readRecords_(sheet);
  const byIdentity = new Map();
  records.forEach(record => {
    const key = identityKey_(record.row);
    byIdentity.set(key, (byIdentity.get(key) || []).concat(record));
  });

  const added = [];
  const batch = new Map();
  let skipped = 0;
  inputRows.forEach(input => {
    const row = normalizeInput_(input);
    validateRow_(row);
    const key = identityKey_(row);
    const oldRows = byIdentity.get(key) || [];
    const batchRow = batch.get(key);
    const existing = oldRows.length ? oldRows[0].row : batchRow;
    if (oldRows.length > 1) {
      throw new Error(`${row.Contador}: hay varias filas para el ${formatDate_(row.Fecha)}. No se ha cambiado la hoja; revisa esos duplicados antes de continuar.`);
    }
    if (existing) {
      if (existing['Lectura Actual'] === row['Lectura Actual']) {
        skipped++;
        return;
      }
      throw new Error(`${row.Contador}: ya existe una lectura el ${formatDate_(row.Fecha)}. Usa Editar para corregirla; no se añadió otra fila.`);
    }
    batch.set(key, row);
    const record = { row, sheetRow: null };
    records.push(record);
    byIdentity.set(key, [record]);
    added.push(record);
  });

  if (!added.length) return { inserted: 0, skipped };
  const counters = [...new Set(added.map(record => record.row.Contador))];
  counters.forEach(counter => recalculateCounter_(records, counter));
  writeChangesSafely_(sheet, records, counters, added);
  return { inserted: added.length, skipped };
}

function updateReading_(sheet, originalInput, replacementInput) {
  const original = normalizeIdentity_(originalInput);
  const replacement = normalizeInput_(replacementInput);
  validateIdentity_(original);
  validateRow_(replacement);
  if (replacement.Categoria !== original.Categoria || replacement.Contador !== original.Contador) {
    throw new Error('La edición debe conservar la categoría y el contador originales.');
  }

  const records = readRecords_(sheet);
  const matches = records.filter(record => identityKey_(record.row) === identityKey_(original));
  if (matches.length !== 1) {
    throw new Error(matches.length
      ? `${original.Contador}: hay varias filas para el ${formatDate_(original.Fecha)}. No se ha modificado nada; primero hay que revisar los duplicados.`
      : 'No se encontró la lectura original. Actualiza los datos antes de volver a editar.');
  }
  const target = matches[0];
  const collision = records.find(record => record !== target && identityKey_(record.row) === identityKey_(replacement));
  if (collision) throw new Error(`${replacement.Contador}: ya hay una lectura en la fecha de destino (${formatDate_(replacement.Fecha)}). No se ha creado otra fila.`);

  target.row = replacement;
  recalculateCounter_(records, replacement.Contador);
  writeChangesSafely_(sheet, records, [replacement.Contador], []);
  return { updated: 1 };
}

function recalculateCounter_(records, counter) {
  const rows = records.filter(record => record.row.Contador === counter).sort((a, b) => a.row.Fecha.localeCompare(b.row.Fecha));
  let previous = null;
  rows.forEach(record => {
    const row = record.row;
    validateStoredReading_(row);
    if (previous && previous.Fecha === row.Fecha) {
      throw new Error(`${counter}: hay varias lecturas para el ${formatDate_(row.Fecha)}. No se ha modificado la hoja; revisa esos duplicados antes de continuar.`);
    }
    const current = row['Lectura Actual'];
    if (previous && current < previous['Lectura Actual']) {
      throw new Error(`${counter}: la lectura del ${formatDate_(row.Fecha)} (${current}) es menor que la del ${formatDate_(previous.Fecha)} (${previous['Lectura Actual']}). No se ha modificado la hoja.`);
    }
    row['Lectura Anterior'] = previous ? previous['Lectura Actual'] : current;
    row.Consumo = previous ? current - previous['Lectura Actual'] : 0;
    previous = row;
  });
}

function writeChangesSafely_(sheet, records, counters, added) {
  const updates = records.filter(record => record.sheetRow && counters.includes(record.row.Contador));
  const snapshots = updates.map(record => ({
    sheetRow: record.sheetRow,
    values: sheet.getRange(record.sheetRow, 1, 1, HEADERS.length).getValues()[0]
  }));
  const oldLastRow = sheet.getLastRow();
  const appendStart = oldLastRow + 1;
  let appendAttempted = false;
  let updateAttempted = false;
  try {
    updates.forEach(record => {
      updateAttempted = true;
      sheet.getRange(record.sheetRow, 1, 1, HEADERS.length).setValues([rowValues_(record.row)]);
    });
    if (added.length) {
      appendAttempted = true;
      sheet.getRange(appendStart, 1, added.length, HEADERS.length).setValues(added.map(record => rowValues_(record.row)));
    }
    SpreadsheetApp.flush();
    verifyWrittenRows_(sheet, records, counters);
  } catch (error) {
    const rollbackErrors = [];
    if (updateAttempted) {
      snapshots.forEach(snapshot => {
        try { sheet.getRange(snapshot.sheetRow, 1, 1, HEADERS.length).setValues([snapshot.values]); }
        catch (rollbackError) { rollbackErrors.push(rollbackError.message || String(rollbackError)); }
      });
    }
    if (appendAttempted) {
      try { sheet.getRange(appendStart, 1, added.length, HEADERS.length).clearContent(); }
      catch (rollbackError) { rollbackErrors.push(rollbackError.message || String(rollbackError)); }
    }
    try {
      SpreadsheetApp.flush();
      snapshots.forEach(snapshot => {
        const restored = sheet.getRange(snapshot.sheetRow, 1, 1, HEADERS.length).getValues()[0];
        if (JSON.stringify(restored) !== JSON.stringify(snapshot.values)) throw new Error(`No se verificó la restauración de la fila ${snapshot.sheetRow}.`);
      });
      if (appendAttempted) {
        const cleared = sheet.getRange(appendStart, 1, added.length, HEADERS.length).getValues();
        if (cleared.some(row => row.some(value => value !== '' && value != null))) throw new Error('No se verificó la limpieza de las filas nuevas de esta operación.');
      }
    } catch (rollbackError) { rollbackErrors.push(rollbackError.message || String(rollbackError)); }
    if (rollbackErrors.length) {
      throw new Error(`Falló la escritura y la restauración automática también dio error. No hagas más cambios hasta revisar la hoja. Detalle: ${rollbackErrors.join('; ')}`);
    }
    throw new Error(`No se guardaron los cambios; se restauraron las filas afectadas. ${error.message || error}`);
  }
}

function verifyWrittenRows_(sheet, expectedRecords, counters) {
  const actual = readRecords_(sheet).filter(record => counters.includes(record.row.Contador));
  const expected = expectedRecords.filter(record => counters.includes(record.row.Contador));
  if (actual.length !== expected.length) throw new Error('La comprobación posterior a la escritura encontró un número de filas inesperado.');
  const byIdentity = new Map(actual.map(record => [identityKey_(record.row), record.row]));
  expected.forEach(record => {
    const row = record.row;
    const persisted = byIdentity.get(identityKey_(row));
    if (!persisted || persisted['Lectura Actual'] !== row['Lectura Actual'] ||
        persisted['Lectura Anterior'] !== row['Lectura Anterior'] || persisted.Consumo !== row.Consumo) {
      throw new Error(`No se pudo verificar la lectura de ${row.Contador} del ${formatDate_(row.Fecha)}.`);
    }
  });
}

function normalizeInput_(input) {
  if (!input || typeof input !== 'object') throw new Error('Cada lectura debe ser un objeto válido.');
  const category = input.Categoria || input.categoria;
  const counter = input.Contador || input.contador;
  return {
    Fecha: formatDate_(input.Fecha || input.fecha || ''),
    Categoria: category,
    Contador: counter,
    'Lectura Anterior': Number(input['Lectura Anterior'] ?? input.lecturaAnterior ?? 0),
    'Lectura Actual': Number(input['Lectura Actual'] ?? input.lecturaActual),
    Consumo: Number(input.Consumo ?? input.consumo ?? 0),
    Unidad: input.Unidad || input.unidad || ''
  };
}

function normalizeIdentity_(input) {
  if (!input || typeof input !== 'object') throw new Error('Falta identificar la lectura original que se va a editar.');
  return {
    Fecha: formatDate_(input.Fecha || input.fecha || ''),
    Categoria: input.Categoria || input.categoria,
    Contador: input.Contador || input.contador
  };
}

function validateIdentity_(identity) {
  validateDate_(identity.Fecha);
  if (!Object.prototype.hasOwnProperty.call(COUNTERS, identity.Categoria) || !COUNTERS[identity.Categoria].includes(identity.Contador)) {
    throw new Error('La categoría y el contador de la lectura original no son válidos.');
  }
}

function validateRow_(row) {
  validateDate_(row.Fecha);
  if (!Object.prototype.hasOwnProperty.call(COUNTERS, row.Categoria)) throw new Error('Categoría no válida.');
  if (!COUNTERS[row.Categoria].includes(row.Contador)) throw new Error('El contador no corresponde a la categoría seleccionada.');
  if (row.Unidad !== UNITS[row.Categoria]) throw new Error(`La unidad debe ser ${UNITS[row.Categoria]} para ${row.Categoria}.`);
  if (!Number.isFinite(row['Lectura Anterior']) || row['Lectura Anterior'] < 0) throw new Error('La lectura anterior debe ser un número finito igual o superior a cero.');
  if (!Number.isFinite(row['Lectura Actual']) || row['Lectura Actual'] < 0) throw new Error('La lectura actual debe ser un número finito igual o superior a cero.');
  if (!Number.isFinite(row.Consumo) || row.Consumo < 0) throw new Error('El consumo debe ser un número finito igual o superior a cero.');
}

function validateStoredReading_(row) {
  validateDate_(row.Fecha);
  if (!Object.prototype.hasOwnProperty.call(COUNTERS, row.Categoria) || !COUNTERS[row.Categoria].includes(row.Contador)) {
    throw new Error(`${row.Contador}: la categoría o el contador almacenado no son válidos.`);
  }
  if (row.Unidad !== UNITS[row.Categoria]) throw new Error(`${row.Contador}: la unidad almacenada no corresponde a su categoría.`);
  if (!Number.isFinite(row['Lectura Actual']) || row['Lectura Actual'] < 0) {
    throw new Error(`${row.Contador}: existe una lectura actual no válida en la hoja. No se ha modificado nada.`);
  }
}

function validateDate_(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new Error('La fecha debe tener formato AAAA-MM-DD.');
  const parts = value.split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (date.toISOString().slice(0, 10) !== value) throw new Error('La fecha no existe.');
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

function rowValues_(row) {
  return HEADERS.map(header => row[header]);
}

function identityKey_(row) {
  return [row.Fecha, row.Categoria, row.Contador].join('|');
}

function compareRows_(a, b) {
  return a.Fecha.localeCompare(b.Fecha) || a.Categoria.localeCompare(b.Categoria) || a.Contador.localeCompare(b.Contador);
}

function formatDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value || '');
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}


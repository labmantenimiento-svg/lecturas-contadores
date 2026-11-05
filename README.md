# Lecturas de contadores

Aplicación web estática para GitHub Pages conectada a Google Sheets mediante Google Apps Script.

## Contadores incluidos

Electricidad:
- `MEDIDA 1 (0,18)`
- `MEDIDA 1 (0,58)`
- `MEDIDA 1 (0,88)`

Agua:
- `Agua Potable METER-2-1`
- `Agua PCI METER-2-2`

## Archivos

- `index.html`: interfaz con pestañas de electricidad y agua.
- `style.css`: diseño responsive, tema claro/oscuro y gráficas compactas.
- `app.js`: lógica de lectura, guardado, filtros, gráficos, CSV y deduplicado.
- `seedData.js`: lecturas históricas generadas desde `MEDIDA Contador (1).txt`.
- `lecturas_historicas_contadores.csv`: CSV histórico listo para copiar/pegar en Google Sheets.
- `appscript.gs`: API GET/POST para Google Apps Script.

## Estructura de Google Sheets

La hoja debe llamarse `Lecturas` y tener estas columnas:

| Fecha | Categoria | Contador | Lectura Anterior | Lectura Actual | Consumo | Unidad |

Ejemplos:

| 2026-06-07 | Electricidad | MEDIDA 1 (0,18) | 74042 | 74300 | 258 | kWh |
| 2026-06-07 | Agua | Agua Potable METER-2-1 | 13593 | 13600 | 7 | m³ |

## Actualizar Google Sheets

1. Abre tu Google Sheet.
2. Comprueba que `Lecturas` tenga los encabezados:
   `Fecha`, `Categoria`, `Contador`, `Lectura Anterior`, `Lectura Actual`, `Consumo`, `Unidad`.
3. Si la hoja ya tiene otra estructura o columnas de coste/precio, no sobrescribas la fila de encabezados: crea una copia y define una migración revisable antes de modificar datos.

## Actualizar Apps Script

Antes de publicar Apps Script, crea una copia del Google Sheet (**Archivo > Hacer una copia**) y prueba allí la nueva versión con filas de ejemplo. El script no migra automáticamente fechas duplicadas preexistentes.

1. Abre la hoja de Google Sheets.
2. Ve a `Extensiones > Apps Script`.
3. Sustituye todo el código por el contenido de `appscript.gs`.
4. Guarda.
5. Pulsa `Implementar > Gestionar implementaciones`.
6. Edita la implementación web actual.
7. Selecciona `Nueva versión`.
8. Guarda/implementa.

Actualiza la implementación existente para conservar la URL `/exec`; no hace falta cambiarla en la aplicación. El nuevo código no cambia las siete columnas ni borra filas existentes. Si la hoja no tiene encabezados, los crea; si los encabezados no coinciden, detiene la operación para que se revise manualmente.

## Publicar en GitHub Pages

Sube o reemplaza en tu repositorio estos archivos:

- `index.html`
- `style.css`
- `app.js`
- `seedData.js`
- `appscript.gs`
- `README.md`
- `lecturas_historicas_contadores.csv`

Después GitHub Pages actualizará la web.

La publicación de GitHub Pages es manual: revisa el diff local, confirma los cambios y súbelos a la rama configurada para Pages. No publiques directamente desde Apps Script ni sustituyas la URL guardada en la web.

## Usar la web

1. Abre la web publicada en GitHub Pages.
2. Pega la URL de Apps Script en `URL de Google Apps Script`.
3. Pulsa `Guardar configuración`.
4. Usa la pestaña `⚡ Contador eléctrico` para guardar las tres medidas eléctricas en una sola fecha.
5. Usa la pestaña `💧 Contador de agua` para guardar agua potable y agua PCI en una sola fecha.

## Añadir lecturas de fechas anteriores

1. Selecciona primero la fecha antigua en el formulario.
2. La web buscará automáticamente la última lectura anterior a esa fecha.
3. Introduce las lecturas actuales y guarda.
4. Apps Script reordenará las filas y recalculará los consumos posteriores del mismo contador.

La fecha acepta días pasados y futuros. La web muestra la lectura anterior y la posterior disponibles para cada contador. Una lectura nueva debe conservar el orden cronológico: no puede ser menor que la anterior ni mayor que la posterior.

Si el contador ya tiene una fila para esa fecha, la web pide editar la fila existente en vez de crear otra.

## Editar y corregir lecturas

1. Busca la lectura en la tabla del contador. Los filtros Desde/Hasta también se aplican a la tabla.
2. Pulsa **Editar** en la fila. El formulario muestra el contador y la fecha originales; los otros contadores quedan desactivados.
3. Cambia la fecha o la lectura actual y pulsa **Guardar cambios**. La validación compara la nueva lectura con sus vecinas cronológicas, excluyendo el registro antiguo. Esta edición ordinaria solo se acepta si la secuencia completa queda coherente.
4. La fila original se actualiza en Google Sheets y se recalculan la lectura anterior y el consumo del contador, incluidos los registros posteriores. Los demás contadores no cambian.
5. **Cancelar edición** abandona la corrección sin enviar cambios.

El identificador lógico es **fecha + categoría + contador**. No se añade una columna ni se cambia el esquema de siete columnas. Si ya hay varias filas para el mismo contador y fecha, no se elige ni elimina ninguna automáticamente: el Apps Script rechaza la operación y esas filas deben revisarse manualmente después de crear una copia de seguridad. El CSV y `seedData.js` incluidos no tienen esas colisiones; el contenido actual de Google Sheets debe comprobarse por separado.

## Buscar y reparar lecturas históricas

`BUSCAR / REPARAR LECTURAS` consulta las lecturas obtenidas de Google Sheets al actualizar la aplicación. Permite filtrar por categoría, contador, fechas, año y mes, mostrar todo el histórico de un contador y revisar filas duplicadas, secuencias decrecientes o saltos estadísticos. La marca de salto usa una regla descriptiva basada en la mediana de incrementos del contador (mediana + seis desviaciones absolutas medianas; si estas son cero, cuatro veces la mediana). Es una señal para revisión humana, no una conclusión sobre el estado del contador.

Para una reparación, añade una o varias lecturas al lote, cambia su fecha y/o lectura actual y pulsa **Revisar reparación**. Apps Script devuelve una vista previa sin escribir: lectura original y corregida, vecinas, consumos afectados e indicación de inconsistencias. Si la secuencia sigue decreciendo, incluye en el mismo lote las demás lecturas erróneas necesarias. **Confirmar reparación** revalida los datos bajo `LockService`, compara la huella del contador con la vista previa, rechaza duplicados o cambios concurrentes y solo escribe si todo el tramo es coherente. Cancelar la vista previa no cambia Google Sheets.

Las reparaciones actualizan solo las filas cuyo dato o consumo recalculado cambia; no borran filas. Se registra cada lectura modificada o recalculada en una hoja separada `Registro de reparaciones`, sin cambiar las siete columnas de `Lecturas`. Si se afectan varias filas, Apps Script crea y verifica una copia completa del Spreadsheet antes de escribir. La copia usa Drive y requiere autorización de Apps Script para Google Drive. Las operaciones normales `saveBatch` e `importBatch` siguen rechazando lecturas decrecientes.

La búsqueda requiere una conexión reciente a Apps Script. Si falla la carga desde Google Sheets, la pantalla no ofrece resultados antiguos como si fueran datos actuales.

## Orden y gráficas

- Las tablas muestran primero la lectura más reciente.
- Cada pestaña permite elegir gráficas de barras, líneas o círculo con porcentajes.
- En la vista circular, los porcentajes aparecen al colocar el cursor sobre cada sección.

## Importar lecturas históricas

Opción 1, desde la web:

1. Configura la URL de Apps Script.
2. Pulsa `Importar lecturas históricas`.
3. Confirma el aviso.
4. La web enviará las filas de `seedData.js` a Google Sheets.

Opción 2, con CSV:

1. Abre `lecturas_historicas_contadores.csv`.
2. Copia las filas.
3. Pégalas en Google Sheets bajo la fila de encabezados.

## Evitar duplicados

La fecha, categoría y contador identifican la fila. Repetir la misma lectura es idempotente; enviar un valor diferente para una fecha ya ocupada muestra un error y requiere editar la fila. Apps Script vuelve a comprobarlo bajo un bloqueo de escritura para evitar duplicados por peticiones simultáneas.

Las escrituras validan todos los datos antes de modificar la hoja, cambian únicamente las filas del contador afectado, comprueban el resultado y restauran las filas modificadas si una escritura falla. No se borra ni se reconstruye toda la tabla. Si falla también la restauración, el mensaje lo indica para detener nuevas operaciones y revisar la hoja.

## Funciones incluidas

- Guardar en Google Sheets.
- Leer datos desde Google Sheets.
- Actualizar datos.
- Editar y corregir una lectura existente por fecha y contador.
- Buscar el histórico por contador, categoría, rango de fechas, año y mes.
- Preparar reparaciones históricas con vista previa, confirmación, auditoría y recalculo atómico por contador.
- Recalcular consumos posteriores del mismo contador tras una inserción o corrección.
- Exportar CSV con la nueva estructura.
- Tema claro/oscuro.
- URL de Apps Script configurable.
- Pestañas separadas para electricidad y agua.
- Gráficas compactas por día, mes y año.
- Importación histórica desde `MEDIDA Contador (1).txt`.

## Pruebas locales

Con Node.js instalado, ejecuta `node --test tests/regression.test.js`. Las pruebas usan datos ficticios y una hoja simulada para comprobar reparaciones descendentes, lotes de errores consecutivos, copia de seguridad simulada, auditoría, recalculo aislado por contador, duplicados, cancelación, recuperación ante fallos, búsqueda por fecha/año/mes y alta normal. No escriben en la hoja real ni sustituyen una prueba de despliegue de Apps Script.

## Endpoints de Apps Script

- `GET /exec` (también admite `?action=list`): devuelve `{ ok, data }` con todas las filas de `Lecturas`.
- `POST { action: "saveBatch", rows }`: alta normal con deduplicado y recálculo; no admite lecturas decrecientes.
- `POST { action: "importBatch", rows }`: importación idempotente del histórico con las mismas validaciones.
- `POST { action: "updateReading", original, row }`: edición ordinaria de una fila existente.
- `POST { action: "previewRepair", changes }`: solo lectura; devuelve valores afectados, incidencias y una firma de la secuencia revisada.
- `POST { action: "repairReadings", changes, expectedSignature, confirmed: true }`: confirma expresamente un lote reparado, vuelve a validar bajo bloqueo, escribe auditoría y crea copia completa previa si hay varias filas afectadas.

## Publicar la actualización

1. Prueba primero el código en una copia del Spreadsheet, con la aplicación apuntando al endpoint de esa copia.
2. En el proyecto de Apps Script que está vinculado al Spreadsheet de producción, reemplaza el contenido de `Código.gs` por `appscript.gs` y guarda.
3. Ejecuta `authorizeRepairDrive` desde el editor para confirmar el acceso a Drive y aceptar el ámbito nuevo solicitado; la función solo lee el tipo del archivo y no crea copias ni altera datos. Ejecuta también `doGet` para validar la lectura. No autorices ni continúes si el proyecto no es el vinculado al Sheet esperado.
4. En **Implementar → Gestionar implementaciones**, edita la implementación web activa, selecciona **Nueva versión** e implementa. Conserva tipo de implementación, acceso y URL `/exec` actuales; no crees una implementación nueva.
5. Verifica con `GET /exec` que devuelve `{ ok: true }` y las lecturas existentes. Luego abre GitHub Pages y comprueba que la web vuelve a cargar esos datos. No hagas altas ni correcciones de prueba en el Sheet de producción.

El código usa `SpreadsheetApp.getActiveSpreadsheet()` y la pestaña existente `Lecturas`; no contiene un Spreadsheet ID literal ni reconstruye el histórico. La publicación de GitHub Pages y el despliegue de Apps Script son operaciones separadas.


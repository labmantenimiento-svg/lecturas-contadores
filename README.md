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
2. En la pestaña `Lecturas`, cambia la fila 1 por:
   `Fecha`, `Categoria`, `Contador`, `Lectura Anterior`, `Lectura Actual`, `Consumo`, `Unidad`.
3. Si tenías datos antiguos con columnas de coste/precio, guárdalos aparte antes de cambiar la estructura.

## Actualizar Apps Script

1. Abre la hoja de Google Sheets.
2. Ve a `Extensiones > Apps Script`.
3. Sustituye todo el código por el contenido de `appscript.gs`.
4. Guarda.
5. Pulsa `Implementar > Gestionar implementaciones`.
6. Edita la implementación web actual.
7. Selecciona `Nueva versión`.
8. Guarda/implementa.

La URL `/exec` puede seguir siendo la misma si actualizas la implementación existente. La app mantiene la URL configurable en pantalla.

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

La lectura introducida no puede ser menor que la anterior ni mayor que una lectura posterior ya registrada.

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

La web evita duplicados antes de enviar datos. Apps Script también evita duplicados en Google Sheets.

Una fila se considera duplicada si coincide:

- Fecha
- Categoria
- Contador
- Lectura Actual

Además, al pulsar `Guardar lectura`, el botón se desactiva y cambia a `Guardando...` hasta que termina la operación.

## Funciones incluidas

- Guardar en Google Sheets.
- Leer datos desde Google Sheets.
- Actualizar datos.
- Exportar CSV con la nueva estructura.
- Tema claro/oscuro.
- URL de Apps Script configurable.
- Pestañas separadas para electricidad y agua.
- Gráficas compactas por día, mes y año.
- Importación histórica desde `MEDIDA Contador (1).txt`.

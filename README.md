# Lecturas de contadores

Aplicacion web estatica para gestionar lecturas de agua y electricidad con Google Sheets como base de datos y Google Apps Script como API.

## Archivos

- `index.html`: estructura de la aplicacion.
- `style.css`: diseno responsive con tema claro y oscuro.
- `app.js`: logica, filtros, graficas, CSV y conexion con Apps Script.
- `appscript.gs`: API para Google Apps Script.
- `README.md`: instrucciones de instalacion.

## Estructura de Google Sheets

La hoja se llama `Lecturas` y usa estas columnas:

| Fecha | Tipo | Lectura Anterior | Lectura Actual | Consumo | Precio Unidad | Coste |

## 1. Crear Google Sheet

1. Entra en Google Drive.
2. Crea una hoja de calculo nueva.
3. Llamala `Lecturas contadores`.
4. Crea una pestaña llamada `Lecturas`.
5. En la primera fila escribe:
   `Fecha`, `Tipo`, `Lectura Anterior`, `Lectura Actual`, `Consumo`, `Precio Unidad`, `Coste`.

## 2. Crear Apps Script

1. Dentro de la hoja, ve a `Extensiones > Apps Script`.
2. Borra el codigo inicial.
3. Copia todo el contenido de `appscript.gs`.
4. Pegalo en Apps Script.
5. Guarda el proyecto.

## 3. Publicar Apps Script como Web App

1. Pulsa `Implementar > Nueva implementacion`.
2. En tipo, elige `Aplicacion web`.
3. Ejecutar como: `Yo`.
4. Quien tiene acceso: `Cualquier usuario`.
5. Pulsa `Implementar`.
6. Autoriza permisos.
7. Copia la URL que termina en `/exec`.

## 4. Configurar la URL en la app

1. Abre `app.js`.
2. No hace falta escribir la URL dentro del codigo.
3. Al abrir la web, pega la URL en el campo `URL de Google Apps Script`.
4. Pulsa `Guardar configuracion`.

La URL se guarda en el navegador del usuario.

## 5. Subir a GitHub

1. Crea un repositorio en GitHub.
2. Sube estos archivos a la raiz del repositorio:
   - `index.html`
   - `style.css`
   - `app.js`
   - `appscript.gs`
   - `README.md`
3. Confirma los cambios.

## 6. Activar GitHub Pages

1. Entra en `Settings` del repositorio.
2. Ve a `Pages`.
3. En `Build and deployment`, selecciona:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
4. Guarda.
5. GitHub mostrara una URL tipo:
   `https://usuario.github.io/nombre-repositorio/`

## 7. Acceder desde movil y ordenador

1. Abre la URL de GitHub Pages.
2. Pega la URL de Apps Script si es la primera vez en ese dispositivo.
3. Pulsa `Guardar configuracion`.
4. Usa la aplicacion normalmente.

## Funciones incluidas

- Lecturas de electricidad.
- Lecturas de agua.
- Lectura anterior automatica.
- Consumo automatico.
- Precio por kWh o m3 configurable.
- Coste automatico.
- Panel de consumo diario, mensual y anual.
- Coste mensual y anual.
- Ultima lectura registrada.
- Graficas con Chart.js.
- Busqueda por fechas.
- Filtros por tipo, dia, mes y ano.
- Exportacion CSV compatible con Excel.
- Copia de seguridad automatica en Google Sheets, porque cada lectura queda guardada en la hoja.

## Nota sobre permisos

Si el navegador bloquea una peticion a Apps Script por permisos o CORS, vuelve a publicar la implementacion como Web App y verifica que el acceso sea `Cualquier usuario`.

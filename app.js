const CONFIG_KEY = "contador.config.v1";
const THEME_KEY = "contador.theme.v1";

const state = {
  apiUrl: "",
  readings: [],
  charts: {}
};

const els = {
  apiUrl: document.getElementById("apiUrl"),
  saveConfigBtn: document.getElementById("saveConfigBtn"),
  status: document.getElementById("status"),
  refreshBtn: document.getElementById("refreshBtn"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  themeToggle: document.getElementById("themeToggle"),
  form: document.getElementById("readingForm"),
  date: document.getElementById("date"),
  type: document.getElementById("type"),
  previousReading: document.getElementById("previousReading"),
  currentReading: document.getElementById("currentReading"),
  consumption: document.getElementById("consumption"),
  unitPrice: document.getElementById("unitPrice"),
  cost: document.getElementById("cost"),
  filterType: document.getElementById("filterType"),
  periodFilter: document.getElementById("periodFilter"),
  fromDate: document.getElementById("fromDate"),
  toDate: document.getElementById("toDate"),
  readingsBody: document.getElementById("readingsBody"),
  dailyConsumption: document.getElementById("dailyConsumption"),
  monthlyConsumption: document.getElementById("monthlyConsumption"),
  annualConsumption: document.getElementById("annualConsumption"),
  monthlyCost: document.getElementById("monthlyCost"),
  annualCost: document.getElementById("annualCost"),
  lastReading: document.getElementById("lastReading")
};

const chartDefs = [
  ["electricDayChart", "Electricidad", "day", "#c98912"],
  ["electricMonthChart", "Electricidad", "month", "#c98912"],
  ["electricYearChart", "Electricidad", "year", "#c98912"],
  ["waterDayChart", "Agua", "day", "#137fa5"],
  ["waterMonthChart", "Agua", "month", "#137fa5"],
  ["waterYearChart", "Agua", "year", "#137fa5"]
];

function init() {
  const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
  state.apiUrl = config.apiUrl || "";
  els.apiUrl.value = state.apiUrl;
  els.date.valueAsDate = new Date();
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  bindEvents();
  updatePreviousReading();
  calculateForm();
  loadData();
}

function bindEvents() {
  els.saveConfigBtn.addEventListener("click", saveConfig);
  els.refreshBtn.addEventListener("click", loadData);
  els.exportCsvBtn.addEventListener("click", exportCsv);
  els.themeToggle.addEventListener("click", toggleTheme);
  els.form.addEventListener("submit", saveReading);
  els.form.addEventListener("reset", () => setTimeout(() => {
    els.date.valueAsDate = new Date();
    updatePreviousReading();
    calculateForm();
  }));
  [els.type, els.currentReading, els.unitPrice].forEach(el => el.addEventListener("input", () => {
    updatePreviousReading();
    calculateForm();
  }));
  [els.filterType, els.periodFilter, els.fromDate, els.toDate].forEach(el => el.addEventListener("change", render));
}

function saveConfig() {
  state.apiUrl = els.apiUrl.value.trim();
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ apiUrl: state.apiUrl }));
  setStatus("Configuracion guardada");
  loadData();
}

async function loadData() {
  if (!state.apiUrl) {
    setStatus("Configura la URL de Apps Script");
    render();
    return;
  }
  try {
    setStatus("Cargando datos...");
    const res = await fetch(`${state.apiUrl}?action=list`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Respuesta no valida");
    state.readings = normalizeRows(json.data || []);
    setStatus("Datos sincronizados con Google Sheets");
  } catch (error) {
    setStatus(`Error: ${error.message}`);
  }
  updatePreviousReading();
  calculateForm();
  render();
}

async function saveReading(event) {
  event.preventDefault();
  if (!state.apiUrl) {
    alert("Primero configura la URL de Google Apps Script.");
    return;
  }
  calculateForm();
  const payload = {
    fecha: els.date.value,
    tipo: els.type.value,
    lecturaAnterior: numberValue(els.previousReading.value),
    lecturaActual: numberValue(els.currentReading.value),
    consumo: numberValue(els.consumption.value),
    precioUnidad: numberValue(els.unitPrice.value),
    coste: numberValue(els.cost.value)
  };
  try {
    setStatus("Guardando en Google Sheets...");
    const res = await fetch(state.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "No se pudo guardar");
    els.form.reset();
    els.date.valueAsDate = new Date();
    await loadData();
    setStatus("Lectura guardada en Google Sheets");
  } catch (error) {
    setStatus(`Error: ${error.message}`);
    alert("No se pudo guardar. Revisa la URL del Apps Script y los permisos.");
  }
}

function normalizeRows(rows) {
  return rows.map(row => ({
    fecha: row.Fecha || row.fecha,
    tipo: row.Tipo || row.tipo,
    lecturaAnterior: numberValue(row["Lectura Anterior"] ?? row.lecturaAnterior),
    lecturaActual: numberValue(row["Lectura Actual"] ?? row.lecturaActual),
    consumo: numberValue(row.Consumo ?? row.consumo),
    precioUnidad: numberValue(row["Precio Unidad"] ?? row.precioUnidad),
    coste: numberValue(row.Coste ?? row.coste)
  })).filter(row => row.fecha && row.tipo).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function updatePreviousReading() {
  const last = [...state.readings].reverse().find(row => row.tipo === els.type.value);
  els.previousReading.value = last ? last.lecturaActual : 0;
}

function calculateForm() {
  const previous = numberValue(els.previousReading.value);
  const current = numberValue(els.currentReading.value);
  const price = numberValue(els.unitPrice.value);
  const consumption = Math.max(0, current - previous);
  els.consumption.value = Number.isFinite(consumption) ? consumption.toFixed(3) : "0.000";
  els.cost.value = Number.isFinite(consumption * price) ? (consumption * price).toFixed(2) : "0.00";
}

function filteredRows() {
  return state.readings.filter(row => {
    const typeOk = els.filterType.value === "Todos" || row.tipo === els.filterType.value;
    const fromOk = !els.fromDate.value || row.fecha >= els.fromDate.value;
    const toOk = !els.toDate.value || row.fecha <= els.toDate.value;
    return typeOk && fromOk && toOk;
  });
}

function render() {
  const rows = filteredRows();
  renderSummary(rows);
  renderTable(rows);
  renderCharts();
}

function renderSummary(rows) {
  const now = new Date();
  const today = toKey(now, "day");
  const month = toKey(now, "month");
  const year = toKey(now, "year");
  els.dailyConsumption.textContent = fmt(sum(rows.filter(r => toKey(r.fecha, "day") === today), "consumo"));
  els.monthlyConsumption.textContent = fmt(sum(rows.filter(r => toKey(r.fecha, "month") === month), "consumo"));
  els.annualConsumption.textContent = fmt(sum(rows.filter(r => toKey(r.fecha, "year") === year), "consumo"));
  els.monthlyCost.textContent = money(sum(rows.filter(r => toKey(r.fecha, "month") === month), "coste"));
  els.annualCost.textContent = money(sum(rows.filter(r => toKey(r.fecha, "year") === year), "coste"));
  const last = [...state.readings].sort((a, b) => a.fecha.localeCompare(b.fecha)).at(-1);
  els.lastReading.textContent = last ? `${formatDate(last.fecha)} · ${last.tipo} · ${fmt(last.lecturaActual)}` : "-";
}

function renderTable(rows) {
  els.readingsBody.innerHTML = rows.map(row => `
    <tr>
      <td>${formatDate(row.fecha)}</td>
      <td>${row.tipo === "Agua" ? "💧 Agua" : "⚡ Electricidad"}</td>
      <td>${fmt(row.lecturaAnterior)}</td>
      <td>${fmt(row.lecturaActual)}</td>
      <td>${fmt(row.consumo)}</td>
      <td>${money(row.precioUnidad, 4)}</td>
      <td>${money(row.coste)}</td>
    </tr>
  `).join("");
}

function renderCharts() {
  for (const [canvasId, type, period, color] of chartDefs) {
    const canvas = document.getElementById(canvasId);
    const grouped = groupRows(state.readings.filter(row => row.tipo === type), period);
    const labels = Object.keys(grouped).sort();
    const data = labels.map(label => grouped[label]);
    if (state.charts[canvasId]) state.charts[canvasId].destroy();
    state.charts[canvasId] = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{ label: "Consumo", data, backgroundColor: color }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: false } }
      }
    });
  }
}

function groupRows(rows, period) {
  return rows.reduce((acc, row) => {
    const key = toKey(row.fecha, period);
    acc[key] = (acc[key] || 0) + row.consumo;
    return acc;
  }, {});
}

function exportCsv() {
  const rows = filteredRows();
  const header = ["Fecha", "Tipo", "Lectura Anterior", "Lectura Actual", "Consumo", "Precio Unidad", "Coste"];
  const csv = [header, ...rows.map(row => [
    row.fecha, row.tipo, row.lecturaAnterior, row.lecturaActual, row.consumo, row.precioUnidad, row.coste
  ])].map(line => line.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  download("lecturas-contadores.csv", csv, "text/csv;charset=utf-8");
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toggleTheme() {
  applyTheme(document.body.classList.contains("dark") ? "light" : "dark");
}

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  localStorage.setItem(THEME_KEY, theme);
}

function toKey(value, period) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  if (period === "year") return String(y);
  if (period === "month") return `${y}-${m}`;
  return `${y}-${m}-${d}`;
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-ES");
}

function numberValue(value) {
  const number = Number(String(value ?? "0").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + numberValue(row[key]), 0);
}

function fmt(value) {
  return numberValue(value).toLocaleString("es-ES", { maximumFractionDigits: 3 });
}

function money(value, decimals = 2) {
  return `${numberValue(value).toLocaleString("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} €`;
}

function setStatus(message) {
  els.status.textContent = message;
}

init();

const CONFIG_KEY = "contador.config.v1";
const THEME_KEY = "contador.theme.v1";
const CHART_COLORS = ["#137fa5", "#c98912", "#6b6fb7", "#7a8c3a", "#b9533d", "#2f7d55", "#9a5d9a", "#4f87c7", "#d06f3c", "#7195a6", "#9b8b36", "#3f9a82"];

const CATEGORIES = {
  electric: {
    label: "Electricidad",
    unit: "kWh",
    counters: [
      { key: "018", name: "MEDIDA 1 (0,18)" },
      { key: "058", name: "MEDIDA 1 (0,58)" },
      { key: "088", name: "MEDIDA 1 (0,88)" }
    ]
  },
  water: {
    label: "Agua",
    unit: "m³",
    counters: [
      { key: "potable", name: "Agua Potable METER-2-1" },
      { key: "pci", name: "Agua PCI METER-2-2" }
    ]
  }
};

const state = {
  apiUrl: "",
  activeTab: "electric",
  readings: [],
  charts: {},
  saving: false
};

const els = {
  apiUrl: document.getElementById("apiUrl"),
  saveConfigBtn: document.getElementById("saveConfigBtn"),
  status: document.getElementById("status"),
  refreshBtn: document.getElementById("refreshBtn"),
  importHistoryBtn: document.getElementById("importHistoryBtn"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  themeToggle: document.getElementById("themeToggle"),
  tabs: document.querySelectorAll(".tab"),
  electricView: document.getElementById("electricView"),
  waterView: document.getElementById("waterView"),
  toast: document.getElementById("toast"),
  electricForm: document.getElementById("electricForm"),
  waterForm: document.getElementById("waterForm"),
  saveElectricBtn: document.getElementById("saveElectricBtn"),
  saveWaterBtn: document.getElementById("saveWaterBtn"),
  electricDate: document.getElementById("electricDate"),
  waterDate: document.getElementById("waterDate"),
  electricBody: document.getElementById("electricBody"),
  waterBody: document.getElementById("waterBody"),
  electricFrom: document.getElementById("electricFrom"),
  electricTo: document.getElementById("electricTo"),
  electricChartMode: document.getElementById("electricChartMode"),
  waterFrom: document.getElementById("waterFrom"),
  waterTo: document.getElementById("waterTo"),
  waterChartMode: document.getElementById("waterChartMode"),
  electricLastDate: document.getElementById("electricLastDate"),
  electricDaily: document.getElementById("electricDaily"),
  electricMonthly: document.getElementById("electricMonthly"),
  electricAnnual: document.getElementById("electricAnnual"),
  last018: document.getElementById("last018"),
  last058: document.getElementById("last058"),
  last088: document.getElementById("last088"),
  waterLastDate: document.getElementById("waterLastDate"),
  waterDaily: document.getElementById("waterDaily"),
  waterMonthly: document.getElementById("waterMonthly"),
  waterAnnual: document.getElementById("waterAnnual"),
  lastPotable: document.getElementById("lastPotable"),
  lastPci: document.getElementById("lastPci")
};

const fields = {
  electric: {
    "MEDIDA 1 (0,18)": {
      previous: document.getElementById("electric018Prev"),
      current: document.getElementById("electric018Now"),
      consumption: document.getElementById("electric018Use")
    },
    "MEDIDA 1 (0,58)": {
      previous: document.getElementById("electric058Prev"),
      current: document.getElementById("electric058Now"),
      consumption: document.getElementById("electric058Use")
    },
    "MEDIDA 1 (0,88)": {
      previous: document.getElementById("electric088Prev"),
      current: document.getElementById("electric088Now"),
      consumption: document.getElementById("electric088Use")
    },
    total: document.getElementById("electricTotal")
  },
  water: {
    "Agua Potable METER-2-1": {
      previous: document.getElementById("waterPotablePrev"),
      current: document.getElementById("waterPotableNow"),
      consumption: document.getElementById("waterPotableUse")
    },
    "Agua PCI METER-2-2": {
      previous: document.getElementById("waterPciPrev"),
      current: document.getElementById("waterPciNow"),
      consumption: document.getElementById("waterPciUse")
    },
    total: document.getElementById("waterTotal")
  }
};

function init() {
  const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
  state.apiUrl = config.apiUrl || "";
  els.apiUrl.value = state.apiUrl;
  const today = new Date();
  els.electricDate.valueAsDate = today;
  els.waterDate.valueAsDate = today;
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  bindEvents();
  loadData();
}

function bindEvents() {
  els.saveConfigBtn.addEventListener("click", saveConfig);
  els.refreshBtn.addEventListener("click", loadData);
  els.importHistoryBtn.addEventListener("click", importHistoricalReadings);
  els.exportCsvBtn.addEventListener("click", exportCsv);
  els.themeToggle.addEventListener("click", toggleTheme);
  els.tabs.forEach(tab => tab.addEventListener("click", () => setTab(tab.dataset.tab)));
  els.electricForm.addEventListener("submit", event => saveCategory(event, "electric"));
  els.waterForm.addEventListener("submit", event => saveCategory(event, "water"));
  els.electricForm.addEventListener("reset", () => setTimeout(() => resetForm("electric")));
  els.waterForm.addEventListener("reset", () => setTimeout(() => resetForm("water")));
  [els.electricFrom, els.electricTo, els.electricChartMode, els.waterFrom, els.waterTo, els.waterChartMode].forEach(el => el.addEventListener("change", render));
  els.electricDate.addEventListener("change", () => fillPreviousReadings("electric"));
  els.waterDate.addEventListener("change", () => fillPreviousReadings("water"));
  for (const category of ["electric", "water"]) {
    for (const group of Object.values(fields[category])) {
      if (group.current) group.current.addEventListener("input", () => calculateCategory(category));
    }
  }
}

function setTab(tab) {
  state.activeTab = tab;
  els.tabs.forEach(button => button.classList.toggle("active", button.dataset.tab === tab));
  els.electricView.classList.toggle("active", tab === "electric");
  els.waterView.classList.toggle("active", tab === "water");
}

function saveConfig() {
  state.apiUrl = els.apiUrl.value.trim();
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ apiUrl: state.apiUrl }));
  setStatus("Configuración guardada");
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
    const response = await fetch(`${state.apiUrl}?action=list`);
    const json = await response.json();
    if (!json.ok) throw new Error(json.error || "Respuesta no válida");
    state.readings = normalizeRows(json.data || []);
    setStatus("Datos sincronizados con Google Sheets");
  } catch (error) {
    setStatus(`Error: ${error.message}`);
  }
  fillPreviousReadings();
  render();
}

async function saveCategory(event, category) {
  event.preventDefault();
  if (state.saving) return;
  if (!state.apiUrl) {
    showToast("❌ Configura primero la URL de Apps Script", "error");
    return;
  }

  const button = category === "electric" ? els.saveElectricBtn : els.saveWaterBtn;
  const originalText = button.textContent;
  state.saving = true;
  button.disabled = true;
  button.textContent = "Guardando...";

  try {
    const rows = buildRowsFromForm(category);
    const freshRows = removeExistingRows(rows);
    if (!freshRows.length) {
      showToast("✅ Esa lectura ya existe, no se duplicó", "ok");
      return;
    }
    await postRows(freshRows, "saveBatch");
    showToast("✅ Lectura guardada correctamente", "ok");
    resetForm(category);
    await loadData();
  } catch (error) {
    setStatus(`Error: ${error.message}`);
    showToast("❌ Error al guardar la lectura", "error");
  } finally {
    state.saving = false;
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function importHistoricalReadings() {
  if (!state.apiUrl) {
    showToast("❌ Configura primero la URL de Apps Script", "error");
    return;
  }
  if (!confirm("Esto importará las lecturas históricas. ¿Continuar?")) return;
  try {
    els.importHistoryBtn.disabled = true;
    els.importHistoryBtn.textContent = "Importando...";
    const historical = normalizeRows(window.HISTORICAL_READINGS || []);
    const rows = removeExistingRows(historical);
    if (!rows.length) {
      showToast("✅ Las lecturas históricas ya estaban importadas", "ok");
      return;
    }
    const result = await postRows(rows, "importBatch");
    showToast(`✅ Importadas ${result.inserted || rows.length} lecturas históricas`, "ok");
    await loadData();
  } catch (error) {
    setStatus(`Error: ${error.message}`);
    showToast("❌ Error al importar lecturas históricas", "error");
  } finally {
    els.importHistoryBtn.disabled = false;
    els.importHistoryBtn.textContent = "Importar lecturas históricas";
  }
}

async function postRows(rows, action) {
  const response = await fetch(state.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, rows })
  });
  const json = await response.json();
  if (!json.ok) throw new Error(json.error || "No se pudo guardar");
  return json;
}

function buildRowsFromForm(category) {
  calculateCategory(category);
  const config = CATEGORIES[category];
  const date = category === "electric" ? els.electricDate.value : els.waterDate.value;
  const rows = config.counters.map(counter => {
    const group = fields[category][counter.name];
    return {
      Fecha: date,
      Categoria: config.label,
      Contador: counter.name,
      "Lectura Anterior": numberValue(group.previous.value),
      "Lectura Actual": numberValue(group.current.value),
      Consumo: numberValue(group.consumption.value),
      Unidad: config.unit
    };
  });
  validateChronology(rows);
  return rows;
}

function validateChronology(rows) {
  rows.forEach(row => {
    const previous = numberValue(row["Lectura Anterior"]);
    const current = numberValue(row["Lectura Actual"]);
    if (current < previous) {
      throw new Error(`${row.Contador}: la lectura actual es menor que la anterior`);
    }
    const next = nextForCounter(row.Contador, row.Fecha);
    if (next && current > next["Lectura Actual"]) {
      throw new Error(`${row.Contador}: la lectura supera la lectura posterior del ${formatDate(next.Fecha)}`);
    }
  });
}

function removeExistingRows(rows) {
  const existing = new Set(state.readings.map(rowKey));
  return rows.filter(row => !existing.has(rowKey(row)));
}

function rowKey(row) {
  return `${row.Fecha}|${row.Categoria}|${row.Contador}|${numberValue(row["Lectura Actual"])}`;
}

function normalizeRows(rows) {
  return rows.map(row => ({
    Fecha: row.Fecha || row.fecha,
    Categoria: row.Categoria || row.categoria || row.Tipo || row.tipo,
    Contador: row.Contador || row.contador || row.Tipo || row.tipo,
    "Lectura Anterior": numberValue(row["Lectura Anterior"] ?? row.lecturaAnterior),
    "Lectura Actual": numberValue(row["Lectura Actual"] ?? row.lecturaActual),
    Consumo: numberValue(row.Consumo ?? row.consumo),
    Unidad: row.Unidad || row.unidad || (row.Tipo === "Agua" ? "m³" : "kWh")
  })).filter(row => row.Fecha && row.Categoria && row.Contador).sort((a, b) => a.Fecha.localeCompare(b.Fecha));
}

function fillPreviousReadings(onlyCategory = null) {
  const categories = onlyCategory ? [onlyCategory] : ["electric", "water"];
  for (const category of categories) {
    const selectedDate = category === "electric" ? els.electricDate.value : els.waterDate.value;
    for (const counter of CATEGORIES[category].counters) {
      const last = latestForCounter(counter.name, selectedDate);
      fields[category][counter.name].previous.value = last ? last["Lectura Actual"] : 0;
    }
    calculateCategory(category);
  }
}

function calculateCategory(category) {
  let total = 0;
  for (const counter of CATEGORIES[category].counters) {
    const group = fields[category][counter.name];
    const previous = numberValue(group.previous.value);
    const current = numberValue(group.current.value);
    const consumption = Math.max(0, current - previous);
    group.consumption.value = consumption.toFixed(3);
    total += consumption;
  }
  fields[category].total.textContent = `${fmt(total)} ${CATEGORIES[category].unit}`;
}

function resetForm(category) {
  const form = category === "electric" ? els.electricForm : els.waterForm;
  form.reset();
  const dateInput = category === "electric" ? els.electricDate : els.waterDate;
  dateInput.valueAsDate = new Date();
  fillPreviousReadings();
}

function render() {
  fillPreviousReadings();
  renderSummaries();
  renderTables();
  renderCharts();
}

function renderSummaries() {
  const today = toKey(new Date(), "day");
  const month = toKey(new Date(), "month");
  const year = toKey(new Date(), "year");
  renderCategorySummary("Electricidad", "electric", today, month, year);
  renderCategorySummary("Agua", "water", today, month, year);
}

function renderCategorySummary(categoryName, tab, today, month, year) {
  const rows = state.readings.filter(row => row.Categoria === categoryName);
  const last = rows.at(-1);
  const daily = sum(rows.filter(row => toKey(row.Fecha, "day") === today), "Consumo");
  const monthly = sum(rows.filter(row => toKey(row.Fecha, "month") === month), "Consumo");
  const annual = sum(rows.filter(row => toKey(row.Fecha, "year") === year), "Consumo");
  if (tab === "electric") {
    els.electricLastDate.textContent = last ? formatDate(last.Fecha) : "-";
    els.electricDaily.textContent = `${fmt(daily)} kWh`;
    els.electricMonthly.textContent = `${fmt(monthly)} kWh`;
    els.electricAnnual.textContent = `${fmt(annual)} kWh`;
    els.last018.textContent = fmtLatest("MEDIDA 1 (0,18)");
    els.last058.textContent = fmtLatest("MEDIDA 1 (0,58)");
    els.last088.textContent = fmtLatest("MEDIDA 1 (0,88)");
  } else {
    els.waterLastDate.textContent = last ? formatDate(last.Fecha) : "-";
    els.waterDaily.textContent = `${fmt(daily)} m³`;
    els.waterMonthly.textContent = `${fmt(monthly)} m³`;
    els.waterAnnual.textContent = `${fmt(annual)} m³`;
    els.lastPotable.textContent = fmtLatest("Agua Potable METER-2-1");
    els.lastPci.textContent = fmtLatest("Agua PCI METER-2-2");
  }
}

function renderTables() {
  const electricRows = filteredRows("Electricidad", els.electricFrom.value, els.electricTo.value)
    .sort((a, b) => b.Fecha.localeCompare(a.Fecha));
  const waterRows = filteredRows("Agua", els.waterFrom.value, els.waterTo.value)
    .sort((a, b) => b.Fecha.localeCompare(a.Fecha));
  els.electricBody.innerHTML = electricRows.map(renderRow).join("");
  els.waterBody.innerHTML = waterRows.map(renderRow).join("");
}

function renderRow(row) {
  return `
    <tr>
      <td>${formatDate(row.Fecha)}</td>
      <td>${row.Contador}</td>
      <td>${fmt(row["Lectura Anterior"])}</td>
      <td>${fmt(row["Lectura Actual"])}</td>
      <td>${fmt(row.Consumo)}</td>
      <td>${row.Unidad}</td>
    </tr>
  `;
}

function renderCharts() {
  const electricMode = els.electricChartMode.value;
  const waterMode = els.waterChartMode.value;
  renderChart("electricDailyChart", electricMode, dailyDatasets("Electricidad", CATEGORIES.electric.counters));
  renderChart("electricMonthlyChart", electricMode, totalDataset("Electricidad", "month", "#c98912"));
  renderChart("electricAnnualChart", electricMode, totalDataset("Electricidad", "year", "#9a6a0e"));
  renderChart("waterPotableChart", waterMode, singleCounterDataset("Agua Potable METER-2-1", "day", "#137fa5"));
  renderChart("waterPciChart", waterMode, singleCounterDataset("Agua PCI METER-2-2", "day", "#52a6bd"));
  renderChart("waterMonthlyChart", waterMode, totalDataset("Agua", "month", "#137fa5"));
  renderChart("waterAnnualChart", waterMode, totalDataset("Agua", "year", "#0d5e7a"));
}

function dailyDatasets(category, counters) {
  const labels = sortedLabels(state.readings.filter(row => row.Categoria === category), "day");
  const colors = ["#c98912", "#6b6fb7", "#7a8c3a"];
  return {
    labels,
    datasets: counters.map((counter, index) => ({
      label: counter.name,
      data: labels.map(label => sum(state.readings.filter(row => row.Categoria === category && row.Contador === counter.name && toKey(row.Fecha, "day") === label), "Consumo")),
      borderColor: colors[index],
      backgroundColor: colors[index],
      tension: 0.25
    }))
  };
}

function totalDataset(category, period, color) {
  const rows = state.readings.filter(row => row.Categoria === category);
  const labels = sortedLabels(rows, period);
  return {
    labels,
    datasets: [{
      label: "Consumo total",
      data: labels.map(label => sum(rows.filter(row => toKey(row.Fecha, period) === label), "Consumo")),
      backgroundColor: labels.map((_, index) => CHART_COLORS[index % CHART_COLORS.length]),
      borderColor: color
    }]
  };
}

function singleCounterDataset(counter, period, color) {
  const rows = state.readings.filter(row => row.Contador === counter);
  const labels = sortedLabels(rows, period);
  return {
    labels,
    datasets: [{
      label: counter,
      data: labels.map(label => sum(rows.filter(row => toKey(row.Fecha, period) === label), "Consumo")),
      backgroundColor: labels.map((_, index) => CHART_COLORS[index % CHART_COLORS.length]),
      borderColor: color
    }]
  };
}

function renderChart(id, type, data) {
  const canvas = document.getElementById(id);
  if (!canvas || !window.Chart) return;
  if (state.charts[id]) state.charts[id].destroy();
  const circular = type === "doughnut";
  state.charts[id] = new Chart(canvas, {
    type,
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: circular ? {} : { y: { beginAtZero: true } },
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 10 } },
        tooltip: {
          callbacks: {
            label(context) {
              const value = numberValue(context.raw);
              const total = context.dataset.data.reduce((sumValue, item) => sumValue + numberValue(item), 0);
              const percent = total ? (value / total) * 100 : 0;
              return circular
                ? `${context.dataset.label}: ${fmt(value)} (${percent.toFixed(1)}%)`
                : `${context.dataset.label}: ${fmt(value)}`;
            }
          }
        }
      }
    }
  });
}

function filteredRows(category, from, to) {
  return state.readings.filter(row => {
    return row.Categoria === category && (!from || row.Fecha >= from) && (!to || row.Fecha <= to);
  });
}

function sortedLabels(rows, period) {
  return [...new Set(rows.map(row => toKey(row.Fecha, period)))].sort();
}

function latestForCounter(counter, beforeDate = "") {
  return state.readings
    .filter(row => row.Contador === counter && (!beforeDate || row.Fecha < beforeDate))
    .sort((a, b) => a.Fecha.localeCompare(b.Fecha))
    .at(-1);
}

function nextForCounter(counter, afterDate) {
  return state.readings
    .filter(row => row.Contador === counter && row.Fecha > afterDate)
    .sort((a, b) => a.Fecha.localeCompare(b.Fecha))
    .at(0);
}

function fmtLatest(counter) {
  const row = latestForCounter(counter);
  return row ? fmt(row["Lectura Actual"]) : "-";
}

function exportCsv() {
  const header = ["Fecha", "Categoria", "Contador", "Lectura Anterior", "Lectura Actual", "Consumo", "Unidad"];
  const rows = state.readings;
  const csv = [header, ...rows.map(row => header.map(col => row[col]))]
    .map(line => line.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
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

function setStatus(message) {
  els.status.textContent = message;
}

function showToast(message, type) {
  els.toast.textContent = message;
  els.toast.className = `toast show ${type}`;
  setTimeout(() => {
    els.toast.className = "toast";
  }, 3000);
}

init();

import { parse } from "yaml";

const CHART_TYPES = new Set(["bar", "line", "pie", "doughnut", "radar", "polarArea", "scatter", "bubble", "sankey"]);
const COLORS = ["#7659a6", "#34313b", "#a998c3", "#87838c", "#534763", "#bdbac2"];

function axisOptions(chart, axis) {
  return {
    min: chart[`${axis}Min`],
    max: chart[`${axis}Max`],
    reverse: chart[`${axis}Reverse`],
    display: chart[`${axis}Display`],
    stacked: chart.stacked,
    beginAtZero: axis === (chart.indexAxis === "y" ? "x" : "y") ? chart.beginAtZero : undefined,
    grid: { color: "#dedbe3" },
    ticks: { display: chart[`${axis}TickDisplay`], padding: chart[`${axis}TickPadding`] },
    title: { display: Boolean(chart[`${axis}Title`]), text: chart[`${axis}Title`] },
    ...(axis === "x" && chart.time ? { type: "time", time: { unit: chart.time } } : {}),
  };
}

// Translate Obsidian Charts' declarative YAML; note content is never executed.
export function chartConfiguration(source, language = "chart") {
  const chart = language === "advanced-chart" ? JSON.parse(source) : parse(source);
  if (!chart || typeof chart !== "object" || Array.isArray(chart)) {
    throw new Error("Expected a chart configuration.");
  }

  let configuration;
  if (language === "advanced-chart") {
    configuration = chart.chartOptions || chart;
  } else {
    if (chart.id || chart.file) throw new Error("Use inline labels and series; chart table references are not supported.");
    if (!Array.isArray(chart.series) || !chart.series.length) throw new Error("Add at least one series with a data array.");
    if (chart.labels !== undefined && !Array.isArray(chart.labels)) throw new Error("Chart labels must be an array.");

    const opacity = typeof chart.transparency === "number" ? Math.max(0, Math.min(1, chart.transparency)) : 0.25;
    const backgrounds = COLORS.map((color) => `${color}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`);
    const datasets = chart.series.map((series, index) => {
      if (!series || !Array.isArray(series.data)) throw new Error(`Series ${index + 1} needs a data array.`);
      const { title, ...dataset } = series;
      const result = {
        label: title ?? "",
        borderColor: chart.labelColors ? COLORS : COLORS[index % COLORS.length],
        backgroundColor: chart.labelColors ? backgrounds : backgrounds[index % COLORS.length],
        borderWidth: 1,
        fill: chart.fill ? (chart.stacked && index > 0 ? "-1" : "origin") : false,
        tension: chart.tension ?? 0,
        ...dataset,
      };
      if ((series.type || chart.type) === "sankey") {
        result.data = series.data.map((point) => Array.isArray(point)
          ? { from: point[0], flow: point[1], to: point[2] }
          : point);
        for (const key of ["colorFrom", "colorTo"]) {
          if (series[key] && typeof series[key] === "object") {
            result[key] = ({ dataset: data, dataIndex }) => series[key][data.data[dataIndex][key === "colorFrom" ? "from" : "to"]] || COLORS[index % COLORS.length];
          }
        }
      }
      return result;
    });

    const options = {
      color: chart.textColor || "#534763",
      font: { family: "Space Mono, monospace" },
      layout: { padding: chart.padding ?? 0 },
      plugins: { legend: { display: chart.legend ?? true, position: chart.legendPosition || "top" } },
      spanGaps: chart.spanGaps,
    };
    if (["bar", "line", "scatter", "bubble"].includes(chart.type)) {
      options.indexAxis = chart.indexAxis;
      options.scales = { x: axisOptions(chart, "x"), y: axisOptions(chart, "y") };
    } else if (["radar", "polarArea"].includes(chart.type)) {
      options.scales = { r: {
        min: chart.rMin,
        max: chart.rMax,
        beginAtZero: chart.beginAtZero,
        grid: { color: "#dedbe3" },
        ticks: { backdropColor: "#ffffff" },
      } };
    }
    configuration = { type: chart.type, data: { labels: chart.labels, datasets }, options };
  }

  if (!CHART_TYPES.has(configuration.type)) throw new Error(`Unsupported chart type: ${configuration.type || "(missing)"}.`);
  if (!Array.isArray(configuration.data?.datasets) || !configuration.data.datasets.length) {
    throw new Error("Add at least one chart dataset.");
  }
  for (const dataset of configuration.data.datasets) {
    if (!dataset || !Array.isArray(dataset.data)) throw new Error("Each chart dataset needs a data array.");
    if (dataset.type && !CHART_TYPES.has(dataset.type)) throw new Error(`Unsupported chart type: ${dataset.type}.`);
  }
  configuration.options = {
    ...configuration.options,
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
  };
  return { configuration, width: typeof chart.width === "string" ? chart.width : "100%" };
}

export async function renderCharts(article, { signal } = {}) {
  const blocks = [...article.querySelectorAll("pre > code.language-chart, pre > code.language-advanced-chart")];
  if (!blocks.length || signal?.aborted) return () => {};

  const charts = [];
  const restore = [];
  const view = article.ownerDocument.defaultView;
  const beforePrint = () => charts.forEach((chart) => chart.resize(640, 360));
  const afterPrint = () => charts.forEach((chart) => chart.resize());
  const cleanup = () => {
    signal?.removeEventListener("abort", cleanup);
    view.removeEventListener("beforeprint", beforePrint);
    view.removeEventListener("afterprint", afterPrint);
    charts.splice(0).forEach((chart) => chart.destroy());
    restore.splice(0).reverse().forEach((restoreBlock) => restoreBlock());
  };
  signal?.addEventListener("abort", cleanup, { once: true });

  const entries = [];
  const showError = (block, error) => {
    const message = article.ownerDocument.createElement("p");
    message.className = "vault-chart-error";
    message.setAttribute("role", "alert");
    message.textContent = `Chart could not render. ${error.message}`;
    block.parentElement.after(message);
    restore.push(() => message.remove());
  };
  for (const block of blocks) {
    try {
      const language = block.classList.contains("language-advanced-chart") ? "advanced-chart" : "chart";
      entries.push({ block, ...chartConfiguration(block.textContent, language) });
    } catch (error) {
      showError(block, error);
    }
  }
  if (!entries.length) return cleanup;

  try {
    const [{ default: Chart }] = await Promise.all([
      import("chart.js/auto"),
      entries.some(({ configuration }) => Object.values(configuration.options.scales || {}).some((scale) => ["time", "timeseries"].includes(scale?.type)))
        ? import("chartjs-adapter-date-fns") : null,
    ]);
    if (signal?.aborted) return cleanup;
    if (entries.some(({ configuration }) => configuration.type === "sankey" || configuration.data.datasets.some((dataset) => dataset.type === "sankey"))) {
      const { SankeyController, Flow } = await import("chartjs-chart-sankey");
      if (signal?.aborted) return cleanup;
      Chart.register(SankeyController, Flow);
    }

    for (const { block, configuration, width } of entries) {
      const pre = block.parentElement;
      const figure = article.ownerDocument.createElement("figure");
      figure.className = "vault-chart";
      if (pre.id) figure.id = pre.id;
      figure.style.width = width;
      const canvas = article.ownerDocument.createElement("canvas");
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `${configuration.type} chart: ${configuration.data.datasets.map((dataset) => dataset.label).filter(Boolean).join(", ") || "note data"}`);
      figure.append(canvas);
      pre.replaceWith(figure);
      try {
        charts.push(new Chart(canvas, configuration));
        restore.push(() => figure.replaceWith(pre));
      } catch (error) {
        Chart.getChart(canvas)?.destroy();
        figure.replaceWith(pre);
        showError(block, error);
      }
    }
    view.addEventListener("beforeprint", beforePrint);
    view.addEventListener("afterprint", afterPrint);
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}

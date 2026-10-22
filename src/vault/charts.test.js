import assert from "node:assert/strict";
import test from "node:test";
import { chartConfiguration } from "./charts.js";

test("Obsidian line chart modifiers and per-series overrides reach Chart.js", () => {
  const { configuration, width } = chartConfiguration(`
type: line
labels: [Baseline, Experiment]
series:
  - title: Accuracy
    data: [72, 91]
    borderColor: '#123456'
  - title: Control
    data: [70, null]
stacked: true
fill: true
spanGaps: true
tension: 0.2
legend: false
width: 80%
yMin: 0
yMax: 100
yTitle: Accuracy (%)
`);
  assert.equal(width, "80%");
  assert.deepEqual(configuration.data.labels, ["Baseline", "Experiment"]);
  assert.equal(configuration.data.datasets[0].label, "Accuracy");
  assert.equal(configuration.data.datasets[0].borderColor, "#123456");
  assert.equal(configuration.data.datasets[0].fill, "origin");
  assert.equal(configuration.data.datasets[1].fill, "-1");
  assert.deepEqual(configuration.data.datasets[1].data, [70, null]);
  assert.equal(configuration.data.datasets[1].tension, 0.2);
  assert.equal(configuration.options.spanGaps, true);
  assert.equal(configuration.options.plugins.legend.display, false);
  assert.equal(configuration.options.scales.y.stacked, true);
  assert.equal(configuration.options.scales.y.max, 100);
  assert.equal(configuration.options.scales.y.title.text, "Accuracy (%)");
  assert.equal(configuration.options.animation, false);
});

test("horizontal bars apply beginAtZero to their value axis and retain explicit bounds", () => {
  const { configuration } = chartConfiguration(`
type: bar
labels: [One, Two]
series:
  - data: [5, 12]
indexAxis: y
beginAtZero: true
xMin: -2
xReverse: true
yTickDisplay: false
`);
  assert.equal(configuration.options.indexAxis, "y");
  assert.equal(configuration.options.scales.x.beginAtZero, true);
  assert.equal(configuration.options.scales.x.min, -2);
  assert.equal(configuration.options.scales.x.reverse, true);
  assert.equal(configuration.options.scales.y.ticks.display, false);
});

test("dated and radial charts use the correct scale options", () => {
  const dated = chartConfiguration(`
type: line
labels: [2026-10-01, 2026-10-02]
series:
  - data: [1, 2]
time: day
`).configuration;
  assert.equal(dated.options.scales.x.type, "time");
  assert.equal(dated.options.scales.x.time.unit, "day");

  const radial = chartConfiguration(`
type: radar
labels: [Speed, Accuracy]
series:
  - data: [3, 9]
rMin: 0
rMax: 10
`).configuration;
  assert.equal(radial.options.scales.r.min, 0);
  assert.equal(radial.options.scales.r.max, 10);
  assert.equal(radial.options.scales.x, undefined);
});

test("Sankey tuples and declarative node colors work without note callbacks", () => {
  const { configuration } = chartConfiguration(`
type: sankey
series:
  - title: Flow
    data: [[Input, 12, Output]]
    colorFrom:
      Input: red
    colorTo:
      Output: blue
`);
  const dataset = configuration.data.datasets[0];
  assert.deepEqual(dataset.data, [{ from: "Input", flow: 12, to: "Output" }]);
  const context = { dataset, dataIndex: 0 };
  assert.equal(dataset.colorFrom(context), "red");
  assert.equal(dataset.colorTo(context), "blue");
});

test("advanced JSON retains Chart.js data and options in both supported forms", () => {
  const raw = {
    type: "scatter",
    data: { datasets: [{ label: "Samples", data: [{ x: 1, y: 3 }, { x: 5, y: 9 }] }] },
    options: { scales: { x: { type: "logarithmic" } } },
  };
  for (const input of [raw, { chartOptions: raw, width: "400px" }]) {
    const { configuration } = chartConfiguration(JSON.stringify(input), "advanced-chart");
    assert.deepEqual(configuration.data, raw.data);
    assert.equal(configuration.options.scales.x.type, "logarithmic");
    assert.equal(configuration.options.responsive, true);
    assert.equal(configuration.options.animation, false);
  }
});

test("invalid chart configurations fail with readable errors", () => {
  for (const [source, message] of [
    ["[", /YAML|flow sequence/i],
    ["null", /configuration/],
    ["type: bar", /series/],
    ["type: bar\nseries: [{data: bad}]", /data array/],
    ["type: bar\nlabels: bad\nseries: [{data: [1]}]", /labels/],
    ["type: unknown\nseries: [{data: [1]}]", /Unsupported chart type/],
    ["type: bar\nid: table", /table references/],
  ]) assert.throws(() => chartConfiguration(source), message);
  assert.throws(() => chartConfiguration("{", "advanced-chart"), SyntaxError);
});

const byId = (id) => document.getElementById(id);
const stages = ["predict", "simulate", "verify"];
const limit = 80;
let trace = [];
let selected = 0;
let prediction = "";
let simulationRevision = "";
let loadingReport = false;
let reportReady = false;

function showStage(name) {
  for (const stage of stages) {
    byId(stage).hidden = stage !== name;
    const button = byId("step-" + stage);
    if (stage === name) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  }
  byId(name + "-title").focus();
  if (name === "simulate") drawPlot();
}

function parseTrace(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.shift()?.startsWith("Cycle") || lines.length === 0) throw new Error("Missing trace");
  return lines.map((line, index) => {
    const fields = line.trim().split(/\s+/);
    const [cycle, a, b, heat, reset, lock, output] = fields;
    if (fields.length !== 7 || Number(cycle) !== index + 1 ||
        !/^-?\d+$/.test(a) || !/^-?\d+$/.test(b) ||
        !["yes", "no"].includes(heat) || !["yes", "no"].includes(reset) ||
        !["clear", "latched"].includes(lock) || !["ON", "OFF"].includes(output)) {
      throw new Error("Unexpected trace format");
    }
    return {cycle: Number(cycle), a: Number(a), b: Number(b), heat, reset, lock, output};
  });
}

const yesNo = (value) => value === "yes" ? "Yes" : "No";
const lockText = (value) => value === "latched" ? "Engaged" : "Clear";

function fillTraceTable() {
  const body = byId("trace-rows");
  body.replaceChildren();
  for (const row of trace) {
    const tr = document.createElement("tr");
    const first = document.createElement("th");
    first.scope = "row";
    first.textContent = row.cycle;
    tr.append(first);
    for (const value of [row.a, row.b, yesNo(row.heat), yesNo(row.reset), lockText(row.lock), row.output]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      tr.append(cell);
    }
    body.append(tr);
  }
  byId("table-count").textContent = "(" + trace.length + " cycles)";
}

function selectCycle(index) {
  const row = trace[index];
  selected = index;
  const range = byId("cycle");
  range.value = index;
  range.setAttribute("aria-valuetext", "Cycle " + row.cycle + " of " + trace.length + ", heater " + row.output);
  byId("selected-cycle").textContent = row.cycle + " / " + trace.length;
  byId("sensor-a").textContent = row.a + " °C";
  byId("sensor-b").textContent = row.b + " °C";
  byId("heat-request").textContent = yesNo(row.heat);
  byId("reset-state").textContent = yesNo(row.reset);
  byId("latch-state").textContent = lockText(row.lock);
  byId("heater-output").textContent = row.output;
  const rows = byId("trace-rows").children;
  for (let i = 0; i < rows.length; i++) {
    if (i === index) rows[i].setAttribute("aria-current", "true");
    else rows[i].removeAttribute("aria-current");
  }
  drawPlot();
}

function drawPlot() {
  if (!trace.length || byId("simulate").hidden) return;
  const canvas = byId("plot");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const {width, height} = canvas.getBoundingClientRect();
  if (width === 0 || height === 0) return;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const low = Math.floor(Math.min(limit, ...trace.map(r => Math.min(r.a, r.b))) / 5) * 5;
  const high = Math.max(low + 5, Math.ceil(Math.max(limit, ...trace.map(r => Math.max(r.a, r.b))) / 5) * 5);
  const left = 32, right = width - 14, top = 16, bottom = height - 22;
  const x = i => left + i * (right - left) / Math.max(trace.length - 1, 1);
  const y = t => bottom - (t - low) * (bottom - top) / (high - low);
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let tick = low; tick <= high; tick += 5) {
    ctx.strokeStyle = tick === limit ? "#ad501e" : "#d8e1d7";
    ctx.setLineDash(tick === limit ? [2, 3] : []);
    ctx.beginPath(); ctx.moveTo(left, y(tick)); ctx.lineTo(right, y(tick)); ctx.stroke();
    ctx.fillStyle = "#526459";
    ctx.fillText(tick + "°", left - 5, y(tick));
  }
  ctx.setLineDash([]);
  ctx.textAlign = "center";
  for (const i of [0, Math.floor(trace.length / 2), trace.length - 1]) {
    ctx.fillText(trace[i].cycle, x(i), bottom + 14);
  }
  ctx.strokeStyle = "#72877b";
  ctx.beginPath(); ctx.moveTo(x(selected), top); ctx.lineTo(x(selected), bottom); ctx.stroke();
  for (const [sensor, color, dash] of [["b", "#427398", [5, 3]], ["a", "#155c48", []]]) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.setLineDash(dash);
    ctx.beginPath();
    trace.forEach((row, i) => {
      if (i === 0) ctx.moveTo(x(i), y(row[sensor]));
      else ctx.lineTo(x(i), y(row[sensor]));
    });
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x(selected), y(trace[selected][sensor]), 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = color; ctx.fill();
  }
}

const form = byId("prediction-form");
form.addEventListener("change", () => {
  byId("run").disabled = !form.elements.prediction.value;
  byId("run-message").textContent = "";
  const matchesRun = trace.length > 0 && form.elements.prediction.value === prediction;
  byId("step-simulate").disabled = !matchesRun;
  byId("step-verify").disabled = !matchesRun;
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const answer = form.elements.prediction.value;
  if (!answer || byId("run").disabled) return;
  form.querySelector("fieldset").disabled = true;
  byId("run").disabled = true;
  byId("run-message").textContent = "Running the C controller…";
  try {
    const {runSimulation, sourceRevision} = await import("./simulation.mjs");
    if (!/^[a-f0-9]{40}$/.test(sourceRevision)) throw new Error("Missing simulation version");
    const rows = parseTrace(await runSimulation());
    const firstAtLimit = rows.findIndex(row => row.a >= limit || row.b >= limit);
    if (firstAtLimit < 0) throw new Error("The simulation did not reach the prediction scenario");
    trace = rows;
    prediction = answer;
    simulationRevision = sourceRevision;
    fillTraceTable();
    byId("your-pick").textContent = answer;
    byId("cycle").min = 0;
    byId("cycle").max = rows.length - 1;
    selectCycle(firstAtLimit);
    byId("step-simulate").disabled = false;
    byId("step-verify").disabled = false;
    byId("run-message").textContent = "";
    showStage("simulate");
  } catch (error) {
    console.error(error);
    byId("run-message").textContent = "The simulation could not run. Check your connection and retry in a browser with WebAssembly support.";
  } finally {
    form.querySelector("fieldset").disabled = false;
    byId("run").disabled = false;
  }
});

function displayEvidence(report) {
  if (!/^[a-f0-9]{40}$/.test(report.commit) || !Array.isArray(report.rules) ||
      report.rules.length !== 4 || !Array.isArray(report.eva?.invalid) ||
      typeof report.eva.ran !== "boolean") throw new Error("Incomplete verification report");
  const list = document.createDocumentFragment();
  const ids = new Set();
  for (const rule of report.rules) {
    if (!/^A[1-4]$/.test(rule.id) || ids.has(rule.id) || typeof rule.title !== "string" ||
        !["PROVED", "UNPROVED"].includes(rule.status)) throw new Error("Invalid verification result");
    ids.add(rule.id);
    const item = document.createElement("li");
    const id = document.createElement("span");
    id.className = "rule-id";
    id.textContent = rule.id;
    const title = document.createElement("span");
    title.textContent = rule.title;
    const verdict = document.createElement("span");
    const proved = rule.status === "PROVED";
    verdict.className = proved ? "verdict proved" : "verdict unproved";
    verdict.textContent = proved ? "Proved" : "Unproved";
    item.append(id, title, verdict);
    list.append(item);
  }
  if (!report.eva.invalid.every(id => ids.has(id))) throw new Error("Invalid Eva result");
  byId("rule-list").replaceChildren(list);
  let finding;
  if (!report.eva.ran) {
    finding = "The verification build did not run Eva for this version.";
  } else if (report.eva.invalid.length) {
    finding = "Eva marked " + report.eva.invalid.join(", ") + " invalid. The controller broke " +
      (report.eva.invalid.length === 1 ? "this promise" : "these promises") + " during the simulated run.";
  } else {
    finding = "Eva reported no invalid requirement in this simulation.";
  }
  byId("eva-outcome").textContent = finding;
  byId("eva-link").hidden = !report.eva.ran;
  const versionUrl = "https://github.com/Sebastian-Kom/formal-verification-lab/tree/" + report.commit + "/examples/heater-shutdown";
  const version = byId("version-link");
  version.textContent = report.commit.slice(0, 8);
  version.href = versionUrl;
  byId("proof-model").textContent = report.machineModel ? " · Proof model " + report.machineModel : "";
  byId("study-source").href = versionUrl;
}

async function revealReport() {
  if (!trace.length) return;
  showStage("verify");
  if (reportReady || loadingReport) return;
  loadingReport = true;
  byId("report-message").textContent = "Loading the verification report…";
  byId("retry-report").hidden = true;
  try {
    const response = await fetch("./evidence.json?revision=" + simulationRevision);
    if (!response.ok) throw new Error("Report request failed");
    const report = await response.json();
    if (report.commit && report.commit !== simulationRevision) {
      byId("report-message").textContent = "A new version has been published. Reload this page to run the simulation and view the matching results.";
      return;
    }
    displayEvidence(report);
    reportReady = true;
    byId("report-body").hidden = false;
    byId("report-message").textContent = "";
  } catch (error) {
    console.error(error);
    byId("report-message").textContent = "The verification report could not be loaded. Check your connection and try again.";
    byId("retry-report").hidden = false;
  } finally {
    loadingReport = false;
  }
}

byId("step-predict").addEventListener("click", () => showStage("predict"));
byId("step-simulate").addEventListener("click", () => showStage("simulate"));
byId("step-verify").addEventListener("click", revealReport);
byId("show-report").addEventListener("click", revealReport);
byId("retry-report").addEventListener("click", revealReport);
byId("back-to-trace").addEventListener("click", () => showStage("simulate"));
byId("cycle").addEventListener("input", event => selectCycle(Number(event.target.value)));
if ("ResizeObserver" in window) new ResizeObserver(drawPlot).observe(byId("plot"));
else window.addEventListener("resize", drawPlot);

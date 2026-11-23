const byId = (id) => document.getElementById(id);
const motion = byId("motion");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function setDiagramMotion(playing) {
  const path = playing ? "./heater-architecture.gif" : "./heater-architecture.png";
  byId("diagram").src = path;
  byId("full-size").href = path;
  motion.dataset.playing = String(playing);
  byId("motion-label").textContent = playing ? "Pause animation" : "Play animation";
}

setDiagramMotion(!reducedMotion.matches);
motion.hidden = false;
motion.addEventListener("click", () => setDiagramMotion(motion.dataset.playing !== "true"));
reducedMotion.addEventListener("change", event => setDiagramMotion(!event.matches));

const limit = 80;
const repository = "https://github.com/Sebastian-Kom/formal-verification-lab";
let manifest;
let sources;
let headerLoading = false;
let order = "original";
let requestNumber = 0;
let trace = [];
let selected = 0;

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
  const proved = report.rules.filter(rule => rule.status === "PROVED").length;
  byId("wp-summary").textContent = "WP proved " + proved + " of 4 requirements";
  let finding = "Eva reported no invalid requirement in this simulation.";
  if (!report.eva.ran) {
    finding = "The build did not run Eva for this order.";
  } else if (report.eva.invalid.length) {
    finding = "Eva found a violation in the simulated run and marked " + report.eva.invalid.join(", ") + " invalid.";
  }
  byId("eva-outcome").textContent = finding;
  byId("eva-link").hidden = !report.eva.ran;
  byId("proof-model").textContent = "Frama-C " + report.frama_c + " · " + report.machineModel;
  byId("source-link").href = assetUrl(order, "controller.c");
  byId("wp-report-link").href = assetUrl(order, "wp.json");
  byId("wp-log-link").href = assetUrl(order, "wp.log");
  byId("eva-link").href = assetUrl(order, "eva.log");
}

function assetUrl(variant, file) {
  const url = new URL("./" + variant + "/" + file, import.meta.url);
  url.searchParams.set("revision", manifest.commit);
  url.searchParams.set("source", manifest.variants[variant].controllerSha256);
  return url.href;
}

async function fetchAsset(url) {
  const response = await fetch(url, {cache: "no-cache"});
  if (!response.ok) throw new Error("Could not load " + url);
  return response;
}

async function fetchListing(url, expectedDigest) {
  const file = await (await fetchAsset(url)).arrayBuffer();
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", file));
  const digest = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  if (digest !== expectedDigest) throw new Error("Source version mismatch");
  return new TextDecoder().decode(file).replace(/\r?\n$/, "").split(/\r?\n/);
}

function renderListing(target, lines, highlight) {
  const rows = document.createDocumentFragment();
  for (const [index, text] of lines.entries()) {
    const line = document.createElement("span");
    line.className = highlight(index + 1, text) ? "code-line highlighted" : "code-line";
    const number = document.createElement("span");
    number.className = "line-number";
    number.setAttribute("aria-hidden", "true");
    number.textContent = index + 1;
    const code = document.createElement("span");
    code.textContent = text;
    line.append(number, code);
    rows.append(line);
  }
  target.replaceChildren(rows);
}

function renderSource() {
  renderListing(byId("source-code"), sources[order], number => manifest.editableLines.includes(number));
  byId("order-label").textContent = order === "original" ? "Original order" : "Swapped order";
}

async function loadHeader() {
  if (headerLoading || byId("header-code").childElementCount) return;
  headerLoading = true;
  byId("retry-header").hidden = true;
  byId("header-status").textContent = "Loading controller.h…";
  try {
    const url = new URL("./controller.h", import.meta.url);
    url.searchParams.set("revision", manifest.commit);
    const lines = await fetchListing(url.href, manifest.headerSha256);
    renderListing(byId("header-code"), lines, (_number, text) => /^\s*ensures\s/.test(text));
    const firstRule = byId("header-code").querySelector(".highlighted");
    if (firstRule) {
      firstRule.id = "first-requirement";
      firstRule.tabIndex = -1;
      byId("jump-to-rule").hidden = false;
    }
    byId("header-scroll").hidden = false;
    byId("header-status").textContent = "";
  } catch (error) {
    console.error(error);
    byId("header-status").textContent = "The contract file for this revision could not be loaded.";
    byId("retry-header").hidden = false;
  } finally {
    headerLoading = false;
  }
}

const tabs = [byId("implementation-tab"), byId("header-tab")];

function selectTab(tab) {
  if (tab.disabled) return;
  for (const item of tabs) {
    const active = item === tab;
    item.setAttribute("aria-selected", String(active));
    item.tabIndex = active ? 0 : -1;
    byId(item.getAttribute("aria-controls")).hidden = !active;
  }
  const headerOpen = tab === byId("header-tab");
  byId("swap-button").hidden = headerOpen;
  tab.focus();
  if (headerOpen) loadHeader();
}

async function openEditor() {
  byId("retry-source").hidden = true;
  byId("activity").textContent = "Loading controller.c…";
  try {
    manifest = await (await fetchAsset("./variants.json")).json();
    if (!/^[a-f0-9]{40}$/.test(manifest.commit) ||
        !["original", "swapped"].every(key => /^[a-f0-9]{64}$/.test(manifest.variants?.[key]?.controllerSha256)) ||
        !Array.isArray(manifest.editableLines) || manifest.editableLines.length !== 2 ||
        !manifest.editableLines.every(n => Number.isSafeInteger(n) && n > 0)) {
      throw new Error("Invalid source manifest");
    }
    const [original, swapped] = await Promise.all(["original", "swapped"].map(variant =>
      fetchListing(assetUrl(variant, "controller.c"), manifest.variants[variant].controllerSha256)));
    sources = {original, swapped};
    renderSource();
    byId("modules-link").href = repository + "/tree/" + manifest.commit + "/examples/heater-shutdown/src";
    for (const id of ["demo-button", "verify-button", "swap-button", "header-tab"]) byId(id).disabled = false;
    byId("activity").textContent = "";
  } catch (error) {
    console.error(error);
    byId("activity").textContent = "The source files could not be loaded. Check your connection and reload the code.";
    byId("retry-source").hidden = false;
  }
}

function hideResults() {
  byId("simulate").hidden = true;
  byId("verify").hidden = true;
}

function swapCalls() {
  requestNumber++;
  order = order === "original" ? "swapped" : "original";
  hideResults();
  trace = [];
  renderSource();
  byId("activity").textContent = "Call order changed. Choose Demo or Verify to see the result for this order.";
}

function showResult(section) {
  byId(section).hidden = false;
  byId("activity").textContent = "";
  if (!document.activeElement?.closest('[role="tablist"], [role="tabpanel"]')) byId(section + "-title").focus();
}

function checkVersion(revision, digest, variant) {
  if (revision !== manifest.commit || digest !== manifest.variants[variant].controllerSha256) {
    throw new Error("Build and displayed source versions differ");
  }
}

async function runDemo() {
  byId("demo-button").focus();
  const request = ++requestNumber;
  const variant = order;
  hideResults();
  byId("activity").textContent = "Running the C simulation…";
  try {
    const simulation = await import(assetUrl(variant, "simulation.mjs"));
    checkVersion(simulation.sourceRevision, simulation.controllerSha256, variant);
    const rows = parseTrace(await simulation.runSimulation());
    if (request !== requestNumber) return;
    trace = rows;
    fillTraceTable();
    byId("cycle").min = 0;
    byId("cycle").max = rows.length - 1;
    showResult("simulate");
    selectCycle(0);
  } catch (error) {
    if (request !== requestNumber) return;
    console.error(error);
    byId("activity").textContent = "The simulation could not run. Check your connection and try Demo again in a browser with WebAssembly support.";
  }
}

async function verify() {
  byId("verify-button").focus();
  const request = ++requestNumber;
  const variant = order;
  hideResults();
  byId("activity").textContent = "Loading the Frama-C results for the displayed code…";
  try {
    const report = await (await fetchAsset(assetUrl(variant, "evidence.json"))).json();
    if (request !== requestNumber) return;
    checkVersion(report.commit, report.controllerSha256, variant);
    if (report.variant !== variant) throw new Error("Unexpected report variant");
    displayEvidence(report);
    showResult("verify");
  } catch (error) {
    if (request !== requestNumber) return;
    console.error(error);
    byId("activity").textContent = "The matching verification report could not be loaded. Refresh the page and try Verify again.";
  }
}

for (const tab of tabs) {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", event => {
    let next;
    if (event.key === "Home") next = tabs[0];
    else if (event.key === "End") next = tabs[1];
    else if (event.key === "ArrowLeft" || event.key === "ArrowRight") next = tabs.find(item => item !== tab);
    else return;
    event.preventDefault();
    selectTab(next);
  });
}
for (const link of document.querySelectorAll('a[href="#implementation-tab"], a[href="#header-tab"]')) {
  link.addEventListener("click", event => {
    event.preventDefault();
    selectTab(byId(link.hash.slice(1)));
  });
}
byId("retry-header").addEventListener("click", loadHeader);
byId("swap-button").addEventListener("click", swapCalls);
byId("demo-button").addEventListener("click", runDemo);
byId("verify-button").addEventListener("click", verify);
byId("retry-source").addEventListener("click", openEditor);
byId("cycle").addEventListener("input", event => selectCycle(Number(event.target.value)));
if ("ResizeObserver" in window) new ResizeObserver(drawPlot).observe(byId("plot"));
else window.addEventListener("resize", drawPlot);
openEditor();

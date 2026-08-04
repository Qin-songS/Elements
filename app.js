import { initBuildMode } from "./build-mode.js";

const MANIFEST_URLS = {
  edifice: "./knowledge/edifice.json",
  geometry: "./knowledge/manifest.json"
};
const NODE_WIDTH = 188;
const NODE_HEIGHT = 82;

const typeLabels = new Map();
let model;
let nodeMap;
let selectedId = "prop.1";
let disabledAxioms = new Set();
let visibleTypes = new Set();
let invalidNodes = new Set();
let pan = { x: 0, y: 0 };
let zoom = 0.68;
let isDragging = false;
let dragOrigin = null;
let appMode = "atlas";
let activeScope = "edifice";
let buildController;

const elements = {
  viewport: document.querySelector("#graphViewport"),
  world: document.querySelector("#graphWorld"),
  nodeLayer: document.querySelector("#nodeLayer"),
  edgeLayer: document.querySelector("#edgeLayer"),
  floorLayer: document.querySelector("#floorLayer"),
  axiomList: document.querySelector("#axiomList"),
  filterList: document.querySelector("#filterList"),
  search: document.querySelector("#knowledgeSearch"),
  searchResults: document.querySelector("#searchResults"),
  zoomLevel: document.querySelector("#zoomLevel"),
  inspector: document.querySelector("#inspector"),
  sidebar: document.querySelector("#sidebar"),
  buildInspector: document.querySelector("#buildInspector"),
  buildSidebar: document.querySelector("#buildSidebar"),
  backdrop: document.querySelector("#mobileBackdrop"),
  contextEyebrow: document.querySelector("#atlasContextEyebrow"),
  contextTitle: document.querySelector("#atlasContextTitle"),
  contextDescription: document.querySelector("#atlasContextDescription"),
  foundationControlTitle: document.querySelector("#foundationControlTitle"),
  foundationControlNote: document.querySelector("#foundationControlNote"),
  workspaceEyebrow: document.querySelector("#atlasWorkspaceEyebrow"),
  workspaceTitle: document.querySelector("#atlasWorkspaceTitle")
};

async function init() {
  await loadAtlasScope("edifice", false);
  buildController = initBuildMode();
  bindEvents();
  setAppMode("atlas", false);

  requestAnimationFrame(() => {
    updateState();
    positionAtlas(false);
  });
}

async function loadAtlasScope(scope, animate = true) {
  const url = MANIFEST_URLS[scope];
  if (!url) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`无法读取知识数据：${response.status}`);

  model = await response.json();
  activeScope = scope;
  typeLabels.clear();
  model.types.forEach((type) => typeLabels.set(type.id, type.label));
  nodeMap = new Map(model.nodes.map((node) => [node.id, node]));
  selectedId = model.meta.defaultNode || (scope === "geometry" ? "prop.1" : model.nodes[0]?.id);
  disabledAxioms = new Set();
  visibleTypes = new Set(model.types.map((type) => type.id));

  renderScopeMeta();
  renderFloors();
  renderControls();
  renderGraph();
  updateState();

  requestAnimationFrame(() => {
    positionAtlas(animate);
  });
}

function positionAtlas(animate) {
  if (activeScope === "edifice") {
    if (window.innerWidth <= 620) {
      zoom = 0.5;
      focusSelected(animate);
    } else {
      fitGraph(animate);
    }
    return;
  }

  zoom = window.innerWidth > 900
    ? clamp(elements.viewport.clientWidth / 1250, 0.48, 0.68)
    : clamp(elements.viewport.clientWidth / 620, 0.5, 0.68);
  focusSelected(animate);
}

function renderScopeMeta() {
  const globalScope = activeScope === "edifice";
  elements.contextEyebrow.textContent = model.meta.eyebrow || (globalScope ? "总览 00" : "语境 01");
  elements.contextTitle.textContent = globalScope ? "整座知识大厦" : "欧氏几何";
  elements.contextDescription.textContent = model.meta.description;
  elements.foundationControlTitle.textContent = model.meta.controlTitle || (globalScope ? "可检验地基" : "公理与公设");
  elements.foundationControlNote.textContent = model.meta.controlNote || "关闭一条地基，观察哪些上层结论会失去支持。";
  elements.workspaceEyebrow.textContent = model.meta.workspaceEyebrow || (globalScope ? "全局剖面" : "依赖剖面");
  elements.workspaceTitle.textContent = model.meta.workspaceTitle || (globalScope ? "从元规则向应用层阅读" : "由地基向上阅读");
  document.querySelector("#nodeCount").textContent = model.nodes.length;
  document.querySelector("#edgeCount").textContent = model.nodes.reduce((sum, node) => sum + node.dependsOn.length, 0);
  document.querySelectorAll("[data-atlas-scope]").forEach((button) => {
    const active = button.dataset.atlasScope === activeScope;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderFloors() {
  elements.floorLayer.innerHTML = model.floors
    .map((floor) => `<div class="floor-line" style="top:${floor.y}px"><span>${floor.label}</span></div>`)
    .join("");
}

function renderControls() {
  const toggleable = model.nodes.filter((node) => node.toggleable);
  elements.axiomList.innerHTML = toggleable
    .map((node) => `
      <div class="axiom-row">
        <span title="${escapeHtml(node.title)}">${escapeHtml(node.code)} · ${escapeHtml(node.title)}</span>
        <button
          class="switch"
          type="button"
          role="switch"
          aria-label="启用${escapeHtml(node.title)}"
          aria-checked="true"
          data-axiom-id="${node.id}"
        ></button>
      </div>
    `)
    .join("");

  elements.filterList.innerHTML = model.types
    .map((type) => {
      const count = model.nodes.filter((node) => node.type === type.id).length;
      return `
        <div class="filter-row">
          <span>${escapeHtml(type.label)} <small>· ${count}</small></span>
          <button
            class="filter-button"
            type="button"
            role="checkbox"
            aria-label="显示${escapeHtml(type.label)}"
            aria-checked="true"
            data-type-id="${type.id}"
          ></button>
        </div>
      `;
    })
    .join("");

}

function renderGraph() {
  elements.world.style.width = `${model.meta.world.width}px`;
  elements.world.style.height = `${model.meta.world.height}px`;
  elements.edgeLayer.setAttribute("viewBox", `0 0 ${model.meta.world.width} ${model.meta.world.height}`);
  elements.nodeLayer.innerHTML = model.nodes
    .map((node, index) => `
      <button
        class="knowledge-node"
        type="button"
        data-node-id="${node.id}"
        style="left:${node.x}px;top:${node.y}px;--delay:${Math.min(index * 34, 460)}ms"
        aria-label="${escapeHtml(typeLabels.get(node.type))}：${escapeHtml(node.title)}"
      >
        <span class="node-topline">
          <span class="node-code">${escapeHtml(node.code)}</span>
          <span class="node-type">${escapeHtml(typeLabels.get(node.type))}</span>
        </span>
        <span class="node-title">${escapeHtml(node.title)}</span>
        <span class="node-foot">
          <span>${formatFloor(node.floor)}</span>
          <span class="support-count">${node.dependsOn.length} 前提</span>
        </span>
      </button>
    `)
    .join("");

  const paths = [];
  for (const node of model.nodes) {
    for (const dependencyId of node.dependsOn) {
      const dependency = nodeMap.get(dependencyId);
      if (!dependency) continue;
      const startX = dependency.x + NODE_WIDTH / 2;
      const startY = dependency.y;
      const endX = node.x + NODE_WIDTH / 2;
      const endY = node.y + NODE_HEIGHT;
      const middleY = startY - Math.max(42, (startY - endY) * 0.46);
      const path = `M ${startX} ${startY} C ${startX} ${middleY}, ${endX} ${middleY}, ${endX} ${endY}`;
      paths.push(`<path class="edge-path" data-from="${dependencyId}" data-to="${node.id}" d="${path}"></path>`);
    }
  }
  elements.edgeLayer.innerHTML = paths.join("");
}

function computeInvalidNodes() {
  const invalid = new Set(disabledAxioms);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of model.nodes) {
      if (invalid.has(node.id)) continue;
      if (node.dependsOn.some((id) => invalid.has(id))) {
        invalid.add(node.id);
        changed = true;
      }
    }
  }
  return invalid;
}

function updateState() {
  invalidNodes = computeInvalidNodes();
  const related = getRelatedNodes(selectedId);
  const hasSelection = Boolean(selectedId);

  document.querySelectorAll("[data-axiom-id]").forEach((button) => {
    button.setAttribute("aria-checked", String(!disabledAxioms.has(button.dataset.axiomId)));
  });
  document.querySelectorAll("[data-type-id]").forEach((button) => {
    button.setAttribute("aria-checked", String(visibleTypes.has(button.dataset.typeId)));
  });

  document.querySelectorAll(".knowledge-node").forEach((element) => {
    const id = element.dataset.nodeId;
    const node = nodeMap.get(id);
    element.classList.toggle("is-selected", id === selectedId);
    element.classList.toggle("is-related", related.has(id));
    element.classList.toggle("is-dimmed", hasSelection && !related.has(id));
    element.classList.toggle("is-invalid", invalidNodes.has(id));
    element.classList.toggle("is-disabled-root", disabledAxioms.has(id));
    element.classList.toggle("is-hidden", !visibleTypes.has(node.type));
  });

  document.querySelectorAll(".edge-path").forEach((path) => {
    const from = path.dataset.from;
    const to = path.dataset.to;
    const hidden = !visibleTypes.has(nodeMap.get(from).type) || !visibleTypes.has(nodeMap.get(to).type);
    const edgeIsRelated = related.has(from) && related.has(to) && (from === selectedId || to === selectedId || getAncestors(selectedId).has(from));
    path.classList.toggle("is-related", edgeIsRelated);
    path.classList.toggle("is-dimmed", hidden || (hasSelection && !(related.has(from) && related.has(to))));
    path.classList.toggle("is-invalid", invalidNodes.has(from) || invalidNodes.has(to));
  });

  updateIntegrity();
  renderInspector();
}

function selectNode(id, focus = false) {
  if (!nodeMap.has(id)) return;
  selectedId = id;
  updateState();
  if (focus) focusSelected();
  if (window.innerWidth <= 900 && appMode === "atlas") openPanel("inspector");
}

function getAncestors(id, found = new Set()) {
  const node = nodeMap.get(id);
  if (!node) return found;
  for (const dependency of node.dependsOn) {
    if (found.has(dependency)) continue;
    found.add(dependency);
    getAncestors(dependency, found);
  }
  return found;
}

function getDescendants(id) {
  const found = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of model.nodes) {
      if (node.id === id || found.has(node.id)) continue;
      if (node.dependsOn.includes(id) || node.dependsOn.some((dependency) => found.has(dependency))) {
        found.add(node.id);
        changed = true;
      }
    }
  }
  return found;
}

function getRelatedNodes(id) {
  if (!id) return new Set();
  return new Set([id, ...getAncestors(id), ...getDescendants(id)]);
}

function getBlockingAxioms(id) {
  const ancestors = getAncestors(id);
  return [...disabledAxioms].filter((axiomId) => axiomId === id || ancestors.has(axiomId));
}

function renderInspector() {
  const node = nodeMap.get(selectedId);
  if (!node) return;
  const isInvalid = invalidNodes.has(node.id);
  const descendants = getDescendants(node.id);
  const blocking = getBlockingAxioms(node.id);

  document.querySelector("#inspectorCode").textContent = node.code;
  document.querySelector("#inspectorType").textContent = typeLabels.get(node.type);
  document.querySelector("#inspectorTitle").textContent = node.title;
  document.querySelector("#inspectorClaim").textContent = `“${node.claim}”`;
  document.querySelector("#inspectorContext").textContent = node.context;
  document.querySelector("#sourceNote").textContent = node.source;

  const status = document.querySelector("#inspectorStatus");
  status.textContent = isInvalid ? "失去支持" : "已建模 · 待核验";
  status.classList.toggle("is-invalid", isInvalid);

  const dependencyList = document.querySelector("#dependencyList");
  if (!node.dependsOn.length) {
    dependencyList.innerHTML = `<p class="empty-detail">这是当前语境中的地基节点，不依赖更低层节点。</p>`;
  } else {
    dependencyList.innerHTML = node.dependsOn
      .map((id) => {
        const dependency = nodeMap.get(id);
        return `
          <button class="dependency-item" type="button" data-dependency-id="${id}">
            <small>${escapeHtml(dependency.code)}</small>
            <span>${escapeHtml(dependency.title)}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg>
          </button>
        `;
      })
      .join("");
  }

  document.querySelector("#proofList").innerHTML = node.proof.map((step) => `<li>${escapeHtml(step)}</li>`).join("");

  const impactText = document.querySelector("#impactText");
  if (isInvalid) {
    const labels = blocking.map((id) => `${nodeMap.get(id).code} ${nodeMap.get(id).title}`).join("、");
    impactText.textContent = `当前节点因“${labels}”被关闭而失去支持；恢复这些地基后可重新成立。`;
  } else if (descendants.size) {
    const nodeKind = activeScope === "edifice" ? "路线节点" : "演示节点";
    impactText.textContent = `当前节点继续支撑上方 ${descendants.size} 个${nodeKind}。关闭其地基不会改写内容，只会标记依赖链失效。`;
  } else {
    impactText.textContent = "当前节点位于这组演示结构的顶层，暂时没有进一步依赖它的结论。";
  }

  dependencyList.querySelectorAll("[data-dependency-id]").forEach((button) => {
    button.addEventListener("click", () => selectNode(button.dataset.dependencyId, true));
  });
}

function updateIntegrity() {
  const invalidDerivedCount = [...invalidNodes].filter((id) => !disabledAxioms.has(id)).length;
  const section = document.querySelector(".integrity-section");
  const title = document.querySelector("#integrityTitle");
  const description = document.querySelector("#integrityDescription");

  section.classList.toggle("is-broken", disabledAxioms.size > 0);
  if (disabledAxioms.size === 0) {
    title.textContent = "结构完整";
    description.textContent = activeScope === "edifice"
      ? "所有路线节点都有可追溯的地基。"
      : "所有演示节点都有可追溯的地基。";
  } else {
    title.textContent = `${invalidDerivedCount} 个${activeScope === "edifice" ? "区域" : "结论"}失去支持`;
    description.textContent = `${disabledAxioms.size} 条地基已关闭；内容仍保留，仅改变成立状态。`;
  }
}

function bindEvents() {
  document.querySelectorAll("[data-app-mode]").forEach((button) => {
    button.addEventListener("click", () => setAppMode(button.dataset.appMode));
  });

  document.querySelector("#restoreAxioms").addEventListener("click", () => {
    disabledAxioms.clear();
    updateState();
  });

  document.querySelectorAll("[data-atlas-scope]").forEach((button) => {
    button.addEventListener("click", () => loadAtlasScope(button.dataset.atlasScope));
  });

  document.querySelectorAll("[data-open-scope]").forEach((button) => {
    button.addEventListener("click", async () => {
      setAppMode("atlas");
      await loadAtlasScope(button.dataset.openScope);
    });
  });

  elements.axiomList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-axiom-id]");
    if (!button) return;
    const id = button.dataset.axiomId;
    if (disabledAxioms.has(id)) disabledAxioms.delete(id);
    else disabledAxioms.add(id);
    updateState();
  });

  elements.filterList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-type-id]");
    if (!button) return;
    const id = button.dataset.typeId;
    if (visibleTypes.has(id)) visibleTypes.delete(id);
    else visibleTypes.add(id);
    updateState();
  });

  elements.nodeLayer.addEventListener("click", (event) => {
    const button = event.target.closest("[data-node-id]");
    if (!button) return;
    selectNode(button.dataset.nodeId, false);
  });

  document.querySelector("#fitButton").addEventListener("click", () => fitGraph(true));
  document.querySelector("#focusButton").addEventListener("click", focusSelected);
  document.querySelector("#zoomIn").addEventListener("click", () => setZoom(zoom + 0.1));
  document.querySelector("#zoomOut").addEventListener("click", () => setZoom(zoom - 0.1));

  elements.viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = elements.viewport.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const worldX = (pointerX - pan.x) / zoom;
    const worldY = (pointerY - pan.y) / zoom;
    const nextZoom = clamp(zoom * (event.deltaY > 0 ? 0.9 : 1.1), 0.35, 1.45);
    pan.x = pointerX - worldX * nextZoom;
    pan.y = pointerY - worldY * nextZoom;
    zoom = nextZoom;
    applyTransform();
  }, { passive: false });

  elements.viewport.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".knowledge-node") || event.target.closest(".canvas-controls")) return;
    isDragging = true;
    dragOrigin = { x: event.clientX - pan.x, y: event.clientY - pan.y };
    elements.viewport.classList.add("is-dragging");
    elements.viewport.setPointerCapture(event.pointerId);
  });

  elements.viewport.addEventListener("pointermove", (event) => {
    if (!isDragging) return;
    pan.x = event.clientX - dragOrigin.x;
    pan.y = event.clientY - dragOrigin.y;
    applyTransform();
  });

  const stopDragging = (event) => {
    if (!isDragging) return;
    isDragging = false;
    elements.viewport.classList.remove("is-dragging");
    if (elements.viewport.hasPointerCapture(event.pointerId)) elements.viewport.releasePointerCapture(event.pointerId);
  };
  elements.viewport.addEventListener("pointerup", stopDragging);
  elements.viewport.addEventListener("pointercancel", stopDragging);

  elements.search.addEventListener("input", renderSearchResults);
  elements.search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const first = elements.searchResults.querySelector("[data-search-id]");
      if (first) chooseSearchResult(first.dataset.searchId);
    }
    if (event.key === "Escape") {
      elements.searchResults.hidden = true;
      elements.search.blur();
    }
  });

  elements.searchResults.addEventListener("click", (event) => {
    const result = event.target.closest("[data-search-id]");
    if (result) chooseSearchResult(result.dataset.searchId);
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      elements.search.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-box")) elements.searchResults.hidden = true;
  });

  document.querySelector("#navToggle").addEventListener("click", () => openPanel("sidebar"));
  document.querySelector("#inspectorToggle").addEventListener("click", () => openPanel("inspector"));
  document.querySelector("#inspectorClose").addEventListener("click", closePanels);
  document.querySelector("#buildInspectorClose").addEventListener("click", closePanels);
  elements.backdrop.addEventListener("click", closePanels);

  window.addEventListener("build:open-inspector", () => {
    if (appMode === "build" && window.innerWidth <= 900) openPanel("inspector");
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closePanels();
    if (appMode === "atlas") positionAtlas(false);
  });
}

function renderSearchResults() {
  const query = elements.search.value.trim().toLowerCase();
  if (!query) {
    elements.searchResults.hidden = true;
    return;
  }

  const matches = model.nodes
    .filter((node) => `${node.code} ${node.title} ${node.claim}`.toLowerCase().includes(query))
    .slice(0, 7);

  elements.searchResults.innerHTML = matches.length
    ? matches.map((node) => `
        <button class="search-result" type="button" data-search-id="${node.id}">
          <small>${escapeHtml(node.code)}</small>
          <strong>${escapeHtml(node.title)}</strong>
        </button>
      `).join("")
    : `<div class="search-result"><small>—</small><strong>没有匹配的知识节点</strong></div>`;
  elements.searchResults.hidden = false;
}

function chooseSearchResult(id) {
  elements.search.value = "";
  elements.searchResults.hidden = true;
  selectNode(id, true);
}

function setZoom(nextZoom) {
  const rect = elements.viewport.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const worldX = (centerX - pan.x) / zoom;
  const worldY = (centerY - pan.y) / zoom;
  zoom = clamp(nextZoom, 0.35, 1.45);
  pan.x = centerX - worldX * zoom;
  pan.y = centerY - worldY * zoom;
  applyTransform();
}

function fitGraph(animate) {
  const rect = elements.viewport.getBoundingClientRect();
  const width = model.meta.world.width;
  const height = model.meta.world.height;
  const padding = window.innerWidth < 620 ? 20 : 54;
  const minimumZoom = window.innerWidth <= 900 ? 0.16 : 0.35;
  zoom = clamp(Math.min((rect.width - padding * 2) / width, (rect.height - padding * 2) / height), minimumZoom, 1.1);
  pan.x = (rect.width - width * zoom) / 2;
  pan.y = (rect.height - height * zoom) / 2;
  elements.world.style.transition = animate ? "transform 360ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
  applyTransform();
  window.setTimeout(() => { elements.world.style.transition = "none"; }, 380);
}

function focusSelected(animate = true) {
  const node = nodeMap.get(selectedId);
  if (!node) return;
  const rect = elements.viewport.getBoundingClientRect();
  pan.x = rect.width / 2 - (node.x + NODE_WIDTH / 2) * zoom;
  pan.y = rect.height / 2 - (node.y + NODE_HEIGHT / 2) * zoom;
  elements.world.style.transition = animate ? "transform 360ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
  applyTransform();
  if (animate) window.setTimeout(() => { elements.world.style.transition = "none"; }, 380);
}

function applyTransform() {
  elements.world.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  elements.zoomLevel.value = `${Math.round(zoom * 100)}%`;
  elements.zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
}

function openPanel(panel) {
  closePanels();
  const target = appMode === "build"
    ? panel === "sidebar" ? elements.buildSidebar : elements.buildInspector
    : panel === "sidebar" ? elements.sidebar : elements.inspector;
  target.classList.add("is-open");
  elements.backdrop.classList.add("is-visible");
}

function closePanels() {
  elements.sidebar.classList.remove("is-open");
  elements.inspector.classList.remove("is-open");
  elements.buildSidebar.classList.remove("is-open");
  elements.buildInspector.classList.remove("is-open");
  elements.backdrop.classList.remove("is-visible");
}

function setAppMode(mode, announce = true) {
  if (mode !== "atlas" && mode !== "build") return;
  appMode = mode;
  const atlasActive = mode === "atlas";

  document.body.classList.toggle("mode-build", !atlasActive);
  document.querySelectorAll(".atlas-mode-panel").forEach((panel) => panel.classList.toggle("is-hidden", !atlasActive));
  document.querySelectorAll(".build-mode-panel").forEach((panel) => panel.classList.toggle("is-hidden", atlasActive));
  document.querySelectorAll(".atlas-top-action").forEach((action) => action.classList.toggle("is-hidden", !atlasActive));
  document.querySelectorAll(".build-top-action").forEach((action) => action.classList.toggle("is-hidden", atlasActive));
  document.querySelectorAll("[data-app-mode]").forEach((button) => {
    const active = button.dataset.appMode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  document.querySelector("#navToggle").setAttribute("aria-label", atlasActive ? "打开筛选面板" : "打开建造路线");
  document.querySelector("#inspectorToggle").setAttribute("aria-label", atlasActive ? "打开节点详情" : "打开挑战详情");
  elements.searchResults.hidden = true;
  closePanels();

  if (!atlasActive) buildController?.onActivated();
  if (announce && atlasActive) elements.viewport.focus({ preventScroll: true });
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatFloor(floor) {
  if (floor < 0) return "第 −1 层";
  return `第 ${String(floor).padStart(2, "0")} 层`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init().catch((error) => {
  console.error(error);
  elements.nodeLayer.innerHTML = `<p style="padding:40px;color:#d5796f">知识数据加载失败。请通过本地服务器打开此页面。</p>`;
});

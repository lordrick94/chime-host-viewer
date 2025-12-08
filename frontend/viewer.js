console.log("viewer.js loaded");

const API_BASE = "/api";

let allEntries = [];
let filteredEntries = [];
let selectedEntry = null;

// PATH candidate data
let allCandidates = [];
let filteredCandidates = [];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function formatFloat(v, digits) {
  if (v === null || v === undefined || isNaN(v)) return "N/A";
  return Number(v).toFixed(digits);
}

function isPathImage(img) {
  return img.repo === "chime-path";
}

function isHostImage(img) {
  return img.repo === "chime-host-analysis";
}

function getTop1Pox(entry) {
  const path = entry.path || {};
  if (typeof path.top1_pox === "number") return path.top1_pox;
  if (path.top1 && typeof path.top1.pox === "number") return path.top1.pox;
  return null;
}

function getSumTop2Pox(entry) {
  const path = entry.path || {};
  if (typeof path.sum_top2_pox === "number") return path.sum_top2_pox;
  return null;
}

// -----------------------------------------------------------------------------
// Load FRB index
// -----------------------------------------------------------------------------

async function loadData() {
  const status = document.getElementById("status");
  try {
    if (status) status.textContent = "Loading FRB index…";

    const response = await fetch(`${API_BASE}/index`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const data = await response.json();
    allEntries = data || [];
    filteredEntries = allEntries.slice();

    if (status) status.textContent = `Loaded ${allEntries.length} FRBs`;

    applyFilters(); // render table + update candidates
  } catch (err) {
    console.error("loadData error:", err);
    if (status) status.textContent = "Failed to load FRB index";
  }
}

// -----------------------------------------------------------------------------
// Load PATH candidate table
// -----------------------------------------------------------------------------

async function loadPathTable() {
  try {
    const response = await fetch(`${API_BASE}/path-table`, {
      credentials: "include",
    });
    if (!response.ok) {
      console.error("Failed to load /api/path-table:", response.status);
      allCandidates = [];
      filteredCandidates = [];
      return;
    }
    const data = await response.json();
    allCandidates = data || [];
    filteredCandidates = allCandidates.slice();

    console.log("Loaded path-table rows:", allCandidates.length);

    populatePlotColumnSelects();
    computeFilteredCandidates();
    renderCandidateTable();
  } catch (err) {
    console.error("loadPathTable error:", err);
    allCandidates = [];
    filteredCandidates = [];
  }
}

// -----------------------------------------------------------------------------
// Filtering FRBs (sidebar filters)
// -----------------------------------------------------------------------------

function applyFilters() {
  const frbFilterEl = document.getElementById("filter-frb-id");
  const minTop1El = document.getElementById("filter-min-top1");
  const minSumEl = document.getElementById("filter-min-sum");

  const frbFilter = frbFilterEl
    ? frbFilterEl.value.trim().toLowerCase()
    : "";

  const minTop1 = minTop1El ? parseFloat(minTop1El.value) : NaN;
  const minSum = minSumEl ? parseFloat(minSumEl.value) : NaN;

  filteredEntries = allEntries.filter((entry) => {
    if (frbFilter) {
      if (!entry.frb_id.toLowerCase().includes(frbFilter)) {
        return false;
      }
    }

    const top1 = getTop1Pox(entry);
    const sumTop2 = getSumTop2Pox(entry);

    if (!Number.isNaN(minTop1) && top1 !== null && top1 < minTop1) {
      return false;
    }

    if (!Number.isNaN(minSum)) {
      if (
        sumTop2 === null ||
        typeof sumTop2 !== "number" ||
        !Number.isFinite(sumTop2) ||
        sumTop2 < minSum
      ) {
        return false;
      }
    }

    return true;
  });

  renderTable();

  // Whenever FRB filters change, update candidates as well
  computeFilteredCandidates();
  renderCandidateTable();
}

// -----------------------------------------------------------------------------
// Render FRB table
// -----------------------------------------------------------------------------

function renderTable() {
  const tbody = document.getElementById("frb-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!filteredEntries.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.textContent = "No FRBs match the current filters.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  filteredEntries.forEach((entry) => {
    const tr = document.createElement("tr");
    tr.className = "frb-row";

    const tdFrb = document.createElement("td");
    tdFrb.textContent = entry.frb_id;
    tr.appendChild(tdFrb);

    const tdYear = document.createElement("td");
    tdYear.textContent = entry.year || "";
    tr.appendChild(tdYear);

    const tdTop1 = document.createElement("td");
    const top1 = getTop1Pox(entry);
    tdTop1.textContent =
      typeof top1 === "number" ? formatFloat(top1, 3) : "";
    tr.appendChild(tdTop1);

    const tdSum = document.createElement("td");
    const sumTop2 = getSumTop2Pox(entry);
    tdSum.textContent =
      typeof sumTop2 === "number" ? formatFloat(sumTop2, 3) : "";
    tr.appendChild(tdSum);

    tr.addEventListener("click", () => {
      setSelectedEntry(entry);
    });

    tbody.appendChild(tr);
  });
}

// -----------------------------------------------------------------------------
// Selected FRB details & images
// -----------------------------------------------------------------------------

function setSelectedEntry(entry) {
  selectedEntry = entry;
  const title = document.getElementById("selected-title");
  const info = document.getElementById("selected-info");
  const imagesContainer = document.getElementById("images-container");

  if (!title || !info || !imagesContainer) return;

  if (!entry) {
    title.textContent = "No FRB selected";
    info.textContent =
      "Use the filters and table on the left to pick an FRB.";
    imagesContainer.textContent =
      "Select an FRB in the table on the left.";
    return;
  }

  title.textContent = entry.frb_id;

  const path = entry.path || {};
  const top1 = getTop1Pox(entry);
  const sumTop2 = getSumTop2Pox(entry);

  let html = "";
  html += `<strong>${entry.frb_id}</strong>`;
  if (entry.year) {
    html += ` &mdash; Year ${entry.year}`;
  }
  if (entry.date) {
    html += ` (date: ${entry.date})`;
  }
  html += "<br>";

  html += `Top1 P_Ox: ${
    typeof top1 === "number" ? formatFloat(top1, 3) : "N/A"
  }<br>`;
  html += `Sum top2 P_Ox: ${
    typeof sumTop2 === "number" ? formatFloat(sumTop2, 3) : "N/A"
  }<br>`;

  const nCand =
    typeof path.n_candidates === "number" ? path.n_candidates : null;
  if (nCand !== null) {
    html += `Number of PATH candidates: ${nCand}<br>`;
  }

  info.innerHTML = html;

  renderFrbImages(entry);
}

function imageUrl(imgInfo) {
  const params = new URLSearchParams();
  params.set("repo", imgInfo.repo);
  params.set("rel_path", imgInfo.rel_path);
  return `${API_BASE}/image?${params.toString()}`;
}

function renderFrbImages(entry) {
  const container = document.getElementById("images-container");
  if (!container) return;

  container.innerHTML = "";

  const images = entry.images || [];
  if (!images.length) {
    container.textContent = "No images found for this FRB.";
    return;
  }

  images.forEach((imgInfo) => {
    const card = document.createElement("div");
    card.className = "img-card";

    const title = document.createElement("div");
    title.className = "img-card-title";
    title.textContent = `${entry.frb_id} — ${imgInfo.kind}`;
    card.appendChild(title);

    const img = document.createElement("img");
    img.src = imageUrl(imgInfo);
    img.alt = imgInfo.filename;
    card.appendChild(img);

    const caption = document.createElement("div");
    caption.className = "img-caption";
    caption.textContent = imgInfo.filename;
    card.appendChild(caption);

    container.appendChild(card);
  });
}

// -----------------------------------------------------------------------------
// Grid view by mode (PATH / HOST)
// -----------------------------------------------------------------------------

function showGridForMode(mode) {
  const infoDiv = document.getElementById("selected-info");
  const container = document.getElementById("images-container");
  if (!infoDiv || !container) return;

  container.innerHTML = "";

  let label = "";
  let predicate = (entry, img) => true;

  switch (mode) {
    case "path-main":
      label = "CHIME-PATH main images";
      predicate = (entry, img) => isPathImage(img) && img.kind === "path-main";
      break;
    case "path-zoomin":
      label = "CHIME-PATH zoom-in images";
      predicate = (entry, img) =>
        isPathImage(img) && img.kind === "path-zoomin";
      break;
    case "path-local-stars":
      label = "CHIME-PATH local (with stars)";
      predicate = (entry, img) =>
        isPathImage(img) && img.kind === "path-local-stars";
      break;
    case "path-local-nostars":
      label = "CHIME-PATH local (no stars)";
      predicate = (entry, img) =>
        isPathImage(img) && img.kind === "path-local-nostars";
      break;
    case "host-all":
      label = "All CHIME-HOST images";
      predicate = (entry, img) => isHostImage(img);
      break;
    case "host-ppxf":
      label = "CHIME-HOST pPXF images";
      predicate = (entry, img) =>
        isHostImage(img) && img.kind === "host-ppxf";
      break;
    case "host-sed":
      label = "CHIME-HOST SED images";
      predicate = (entry, img) =>
        isHostImage(img) && img.kind === "host-sed";
      break;
    case "host-spectra":
      label = "CHIME-HOST spectra images";
      predicate = (entry, img) =>
        isHostImage(img) && img.kind === "host-spectra";
      break;
    default:
      label = "Images";
      predicate = () => true;
  }

  infoDiv.textContent = `Grid view: ${label} for ${filteredEntries.length} filtered FRBs.`;

  let count = 0;

  filteredEntries.forEach((entry) => {
    (entry.images || []).forEach((imgInfo) => {
      if (predicate(entry, imgInfo)) {
        const card = document.createElement("div");
        card.className = "img-card";

        const title = document.createElement("div");
        title.className = "img-card-title";
        title.textContent = `${entry.frb_id} — ${imgInfo.kind}`;
        card.appendChild(title);

        const img = document.createElement("img");
        img.src = imageUrl(imgInfo);
        img.alt = imgInfo.filename;
        card.appendChild(img);

        const caption = document.createElement("div");
        caption.className = "img-caption";
        caption.textContent = imgInfo.filename;
        card.appendChild(caption);

        container.appendChild(card);
        count += 1;
      }
    });
  });

  if (count === 0) {
    container.textContent =
      "No images match this mode for the current FRB filter.";
  }
}

// -----------------------------------------------------------------------------
// Data & Plots — column selection for Plotly
// -----------------------------------------------------------------------------

function populatePlotColumnSelects() {
  const xSelect = document.getElementById("plot-x-column");
  const ySelect = document.getElementById("plot-y-column");
  if (!xSelect || !ySelect) return;

  xSelect.innerHTML = "";
  ySelect.innerHTML = "";

  if (!allCandidates.length) return;

  const sample = allCandidates.find(
    (row) => row && typeof row === "object"
  );
  if (!sample) return;

  const numericKeys = Object.keys(sample).filter((key) => {
    const v = sample[key];
    return typeof v === "number" && !Number.isNaN(v);
  });

  if (!numericKeys.length) return;

  const defaultX = numericKeys.includes("mag") ? "mag" : numericKeys[0];
  const defaultY = numericKeys.includes("pox")
    ? "pox"
    : numericKeys[1] || numericKeys[0];

  numericKeys.forEach((key) => {
    const optX = document.createElement("option");
    optX.value = key;
    optX.textContent = key;
    if (key === defaultX) optX.selected = true;
    xSelect.appendChild(optX);

    const optY = document.createElement("option");
    optY.value = key;
    optY.textContent = key;
    if (key === defaultY) optY.selected = true;
    ySelect.appendChild(optY);
  });
}

// -----------------------------------------------------------------------------
// Compute filteredCandidates (FRB filter + candidate cuts)
// -----------------------------------------------------------------------------

function computeFilteredCandidates() {
  if (!allCandidates || !allCandidates.length) {
    filteredCandidates = [];
    return;
  }

  const allowedFrbIds = new Set(filteredEntries.map((e) => e.frb_id));

  const minPoxEl = document.getElementById("cut-min-pox");
  const maxPoxEl = document.getElementById("cut-max-pox");
  const maxMagEl = document.getElementById("cut-max-mag");

  const minPox = minPoxEl ? parseFloat(minPoxEl.value) : NaN;
  const maxPox = maxPoxEl ? parseFloat(maxPoxEl.value) : NaN;
  const maxMag = maxMagEl ? parseFloat(maxMagEl.value) : NaN;

  filteredCandidates = allCandidates.filter((row) => {
    if (!allowedFrbIds.has(row.frb_id)) return false;

    const pox = row.pox;
    const mag = row.mag;

    if (!Number.isNaN(minPox) && pox != null && pox < minPox) {
      return false;
    }
    if (!Number.isNaN(maxPox) && pox != null && pox > maxPox) {
      return false;
    }
    if (!Number.isNaN(maxMag) && mag != null && mag > maxMag) {
      return false;
    }

    return true;
  });
}

// -----------------------------------------------------------------------------
// Render candidate table
// -----------------------------------------------------------------------------

function renderCandidateTable() {
  const tbody = document.getElementById("path-data-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!filteredCandidates.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 9;
    td.textContent = "No PATH candidates match current filters and cuts.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  filteredCandidates.forEach((row) => {
    const tr = document.createElement("tr");

    function addCell(value) {
      const td = document.createElement("td");
      if (
        value === null ||
        value === undefined ||
        (typeof value === "number" && Number.isNaN(value))
      ) {
        td.textContent = "";
      } else {
        td.textContent = value;
      }
      tr.appendChild(td);
    }

    addCell(row.frb_id);
    addCell(row.cand_id);
    addCell(row.mag);
    addCell(row.pox);
    addCell(row.po);
    addCell(row.pxo);
    addCell(row.survey);
    addCell(row.z_phot);
    addCell(row.z_spec);

    tbody.appendChild(tr);
  });
}

// -----------------------------------------------------------------------------
// Generate Plotly scatter plot from filteredCandidates
// -----------------------------------------------------------------------------

function generateCandidatePlot() {
  const xSelect = document.getElementById("plot-x-column");
  const ySelect = document.getElementById("plot-y-column");
  if (!xSelect || !ySelect) return;

  const xCol = xSelect.value;
  const yCol = ySelect.value;
  if (!xCol || !yCol) return;

  const xs = [];
  const ys = [];
  const texts = [];

  filteredCandidates.forEach((row) => {
    const x = row[xCol];
    const y = row[yCol];
    if (
      typeof x === "number" &&
      typeof y === "number" &&
      !Number.isNaN(x) &&
      !Number.isNaN(y)
    ) {
      xs.push(x);
      ys.push(y);
      texts.push(`${row.frb_id} / cand ${row.cand_id}`);
    }
  });

  const trace = {
    x: xs,
    y: ys,
    text: texts,
    mode: "markers",
    type: "scatter",
    hovertemplate:
      "%{text}<br>" +
      xCol +
      ": %{x}<br>" +
      yCol +
      ": %{y}<extra></extra>",
  };

  const layout = {
    title: `${yCol} vs ${xCol} (PATH candidates)`,
    xaxis: { title: xCol },
    yaxis: { title: yCol },
    margin: { t: 40, r: 10, b: 50, l: 60 },
  };

  Plotly.newPlot("path-plot", [trace], layout, { responsive: true });
}

// -----------------------------------------------------------------------------
// Event wiring
// -----------------------------------------------------------------------------

function setupEventListeners() {
  // FRB filters
  const frbIdInput = document.getElementById("filter-frb-id");
  const minTop1Input = document.getElementById("filter-min-top1");
  const minSumInput = document.getElementById("filter-min-sum");

  [frbIdInput, minTop1Input, minSumInput].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", () => {
      applyFilters();
    });
  });

  // Clear selection
  const clearBtn = document.getElementById("clear-selection");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      selectedEntry = null;
      setSelectedEntry(null);
    });
  }

  // Dropdowns: CHIME-PATH
  const pathLinks = document.querySelectorAll("#dropdown-path a");
  if (pathLinks && pathLinks.length) {
    pathLinks.forEach((link) => {
      link.addEventListener("click", (evt) => {
        evt.preventDefault();
        const mode = link.getAttribute("data-mode");
        showGridForMode(mode);
      });
    });
  }

  // Dropdowns: CHIME-HOST
  const hostLinks = document.querySelectorAll("#dropdown-host a");
  if (hostLinks && hostLinks.length) {
    hostLinks.forEach((link) => {
      link.addEventListener("click", (evt) => {
        evt.preventDefault();
        const mode = link.getAttribute("data-mode");
        showGridForMode(mode);
      });
    });
  }

  // Tabs
  const tabDetails = document.getElementById("tab-details");
  const tabData = document.getElementById("tab-data");
  const panelDetails = document.getElementById("panel-details");
  const panelData = document.getElementById("panel-data");

  if (tabDetails && tabData && panelDetails && panelData) {
    tabDetails.addEventListener("click", () => {
    tabDetails.classList.add("active");
    tabData.classList.remove("active");

    panelDetails.classList.remove("hidden");
    panelData.classList.add("hidden");
  });

    tabData.addEventListener("click", () => {
    tabData.classList.add("active");
    tabDetails.classList.remove("active");

    panelData.classList.remove("hidden");
    panelDetails.classList.add("hidden");
  });
  }

  // Data & Plots buttons
  const btnApplyCuts = document.getElementById("btn-apply-cuts");
  const btnGeneratePlot = document.getElementById("btn-generate-plot");

  if (btnApplyCuts) {
    btnApplyCuts.addEventListener("click", () => {
      computeFilteredCandidates();
      renderCandidateTable();
    });
  }

  if (btnGeneratePlot) {
    btnGeneratePlot.addEventListener("click", () => {
      computeFilteredCandidates();
      renderCandidateTable();
      generateCandidatePlot();
    });
  }
}

// -----------------------------------------------------------------------------
// Kickoff
// -----------------------------------------------------------------------------

window.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded, initializing viewer...");
  document.getElementById("panel-details").classList.remove("hidden");
  document.getElementById("panel-data").classList.add("hidden");
  setupEventListeners();
  loadData();
  loadPathTable();
});

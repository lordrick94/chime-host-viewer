// API base. Because frontend is served by the same FastAPI app,
// we can just use relative URLs like "/api/index".
const API_BASE = "/api";

let allEntries = [];
let filteredEntries = [];

// ----------------- Utility helpers -----------------

function formatFloat(v, digits) {
  if (v === null || v === undefined || isNaN(v)) return "N/A";
  return Number(v).toFixed(digits);
}

function isMainImage(img) {
  // "main PATH" images (from build_index.py classify_kind)
  return img.kind === "path-main" || img.kind === "path-local";
}

function isZoomImage(img) {
  return img.kind === "path-zoomin";
}

// ----------------- Data loading -----------------

async function loadData() {
  const status = document.getElementById("status");
  try {
    status.textContent = "Loading index…";
    const response = await fetch(`${API_BASE}/index`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
    allEntries = await response.json();
    status.textContent = `Loaded ${allEntries.length} FRBs`;
    applyFilters();
  } catch (err) {
    console.error(err);
    status.textContent = "Failed to load FRB index";
  }
}

// ----------------- Filtering & table -----------------

function applyFilters() {
  const frbFilter = document
    .getElementById("filter-frb")
    .value.trim()
    .toLowerCase();
  const yearFilter = document.getElementById("filter-year").value.trim();

  const minScoreStr = document
    .getElementById("filter-min-score")
    .value.trim();
  const minScore =
    minScoreStr === "" ? null : parseFloat(minScoreStr);

  const minSumStr = document
    .getElementById("filter-min-sum")
    .value.trim();
  const minSum = minSumStr === "" ? null : parseFloat(minSumStr);

  filteredEntries = allEntries.filter((entry) => {
    if (frbFilter && !entry.frb_id.toLowerCase().includes(frbFilter)) {
      return false;
    }
    if (yearFilter && String(entry.year) !== yearFilter) {
      return false;
    }

    const path = entry.path || {};
    const top1 =
      typeof path.top1_pox === "number"
        ? path.top1_pox
        : path.best_score;
    const sumTop2 =
      typeof path.sum_top2_pox === "number"
        ? path.sum_top2_pox
        : null;

    if (minScore !== null) {
      if (
        top1 === null ||
        typeof top1 !== "number" ||
        top1 < minScore
      ) {
        return false;
      }
    }

    if (minSum !== null) {
      if (
        sumTop2 === null ||
        typeof sumTop2 !== "number" ||
        sumTop2 < minSum
      ) {
        return false;
      }
    }

    return true;
  });

  renderTable();
}

function renderTable() {
  const tbody = document.querySelector("#frb-table tbody");
  tbody.innerHTML = "";

  filteredEntries.forEach((entry, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.index = idx;

    const path = entry.path || {};
    const scoreVal =
      typeof path.best_score === "number" ? path.best_score : null;
    const score =
      scoreVal !== null ? scoreVal.toFixed(3) : "";

    const date = entry.date || "";

    const nImages = (entry.images || []).length;

    tr.innerHTML = `
      <td>${entry.frb_id}</td>
      <td>${entry.year || ""}</td>
      <td>${date}</td>
      <td>${score}</td>
      <td>${nImages}</td>
    `;

    tr.addEventListener("click", () => {
      selectEntry(idx);
    });

    tbody.appendChild(tr);
  });

  const info = document.getElementById("selected-info");
  info.textContent = filteredEntries.length
    ? `Showing ${filteredEntries.length} FRBs. Click one to view images and candidate info.`
    : "No FRBs match the current filters.";

  document.getElementById("images-container").innerHTML = "";
}

// ----------------- Single-FRB view -----------------

function imageUrl(img) {
  // Build the URL to fetch an image via /api/image
  const params = new URLSearchParams({
    repo: img.repo,
    rel_path: img.rel_path,
  });
  return `${API_BASE}/image?${params.toString()}`;
}

function selectEntry(idxInFiltered) {
  const entry = filteredEntries[idxInFiltered];
  if (!entry) return;

  const path = entry.path || {};
  const top1 = path.top1 || {};
  const top1Pox =
    typeof path.top1_pox === "number"
      ? path.top1_pox
      : path.best_score;
  const sumTop2 =
    typeof path.sum_top2_pox === "number" ? path.sum_top2_pox : null;

  const infoDiv = document.getElementById("selected-info");

  let html = `<strong>${entry.frb_id}</strong>`;
  if (entry.year) {
    html += ` (Year ${entry.year})`;
  }
  html += "<br>";

  html += `Top1 P_Ox: ${
    top1Pox !== null && top1Pox !== undefined
      ? top1Pox.toFixed(3)
      : "N/A"
  }`;
  if (sumTop2 !== null && sumTop2 !== undefined) {
    html += ` | (Top1 + Top2) P_Ox: ${sumTop2.toFixed(3)}`;
  }
  if (typeof path.n_candidates === "number") {
    html += ` | # candidates: ${path.n_candidates}`;
  }

  html += "<br>";

  if (Object.keys(top1).length > 0) {
    html += `
      <small>
        Top candidate: ID=${top1.id || "?"},
        RA=${formatFloat(top1.ra, 5)},
        Dec=${formatFloat(top1.dec, 5)},
        mag=${formatFloat(top1.mag, 2)},
        ang_size=${formatFloat(top1.ang_size, 3)},
        sep=${formatFloat(top1.sep, 2)},
        P_O=${formatFloat(top1.p_o, 3)},
        p_xO=${formatFloat(top1.p_xo, 3)},
        P_Ux=${formatFloat(top1.p_ux, 3)},
        z_phot=${formatFloat(top1.z_phot_median, 3)},
        z_spec=${formatFloat(top1.z_spec, 3)},
        survey=${top1.survey || "?"}
      </small>
    `;
  }

  infoDiv.innerHTML = html;

  const container = document.getElementById("images-container");
  container.innerHTML = "";

  (entry.images || []).forEach((imgInfo) => {
    const card = document.createElement("div");
    card.className = "img-card";

    const title = document.createElement("div");
    title.style.fontWeight = "600";
    title.style.fontSize = "0.8rem";
    title.textContent = `${entry.frb_id} — ${imgInfo.kind}`;

    const img = document.createElement("img");
    img.src = imageUrl(imgInfo);
    img.alt = imgInfo.filename;

    const caption = document.createElement("div");
    caption.className = "img-caption";
    caption.textContent = imgInfo.filename;

    card.appendChild(title);
    card.appendChild(img);
    card.appendChild(caption);

    container.appendChild(card);
  });

  if ((entry.images || []).length === 0) {
    container.textContent = "No images found for this FRB.";
  }
}

// ----------------- Grid views across filtered FRBs -----------------

function showGridView(mode) {
  const container = document.getElementById("images-container");
  container.innerHTML = "";
  const infoDiv = document.getElementById("selected-info");

  if (!filteredEntries.length) {
    infoDiv.textContent = "No FRBs match the current filters.";
    container.textContent = "Nothing to show.";
    return;
  }

  let label;
  let predicate;

  if (mode === "main") {
    label = "main PATH PNGs";
    predicate = isMainImage;
  } else if (mode === "zoomin") {
    label = "zoom-in PATH PNGs";
    predicate = isZoomImage;
  } else {
    label = "images";
    predicate = () => true;
  }

  infoDiv.textContent = `Grid view: ${label} for ${filteredEntries.length} filtered FRBs.`;

  let count = 0;

  filteredEntries.forEach((entry) => {
    (entry.images || []).forEach((imgInfo) => {
      if (!predicate(imgInfo)) return;
      count += 1;

      const card = document.createElement("div");
      card.className = "img-card";

      const title = document.createElement("div");
      title.style.fontWeight = "600";
      title.style.fontSize = "0.8rem";
      title.textContent = `${entry.frb_id} — ${imgInfo.kind}`;

      const img = document.createElement("img");
      img.src = imageUrl(imgInfo);
      img.alt = imgInfo.filename;

      const caption = document.createElement("div");
      caption.className = "img-caption";
      caption.textContent = imgInfo.filename;

      card.appendChild(title);
      card.appendChild(img);
      card.appendChild(caption);

      container.appendChild(card);
    });
  });

  if (count === 0) {
    container.textContent = `No ${label} found for the current filtered FRBs.`;
  }
}

// ----------------- Wire up events -----------------

document.getElementById("filter-frb").addEventListener("input", applyFilters);
document.getElementById("filter-year").addEventListener("input", applyFilters);
document
  .getElementById("filter-min-score")
  .addEventListener("input", applyFilters);
document
  .getElementById("filter-min-sum")
  .addEventListener("input", applyFilters);

document
  .getElementById("btn-single-view")
  .addEventListener("click", () => {
    const info = document.getElementById("selected-info");
    info.textContent = filteredEntries.length
      ? `Showing ${filteredEntries.length} FRBs. Click one to view images and candidate info.`
      : "No FRBs match the current filters.";
    document.getElementById("images-container").innerHTML =
      "Select an FRB in the table on the left.";
  });

document
  .getElementById("btn-grid-main")
  .addEventListener("click", () => showGridView("main"));

document
  .getElementById("btn-grid-zoomin")
  .addEventListener("click", () => showGridView("zoomin"));

// Kick off the initial load
loadData();

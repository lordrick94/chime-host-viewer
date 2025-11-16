console.log("viewer.js loaded");

const API_BASE = "/api";

let allEntries = [];
let filteredEntries = [];

// ----------------- Utility helpers -----------------

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

// For old “main PATH” style views; we’ll still use this in some modes if you like.
function isMainImage(img) {
  return (
    img.kind === "path-main" ||
    img.kind === "path-local-stars" ||
    img.kind === "path-local-nostars"
  );
}

// ----------------- Data loading -----------------

async function loadData() {
  const status = document.getElementById("status");
  try {
    status.textContent = "Loading index…";
    const response = await fetch(`${API_BASE}/index`, {
      credentials: "include",
    });
    console.log("GET /api/index status:", response.status);
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
    const data = await response.json();
    console.log("Index length:", data.length);
    allEntries = data;
    // start with all entries visible
    filteredEntries = allEntries.slice();
    status.textContent = `Loaded ${allEntries.length} FRBs`;
    applyFilters(); // to sync with any pre-filled inputs
  } catch (err) {
    console.error("loadData error:", err);
    status.textContent = "Failed to load FRB index";
  }
}

// ----------------- Filtering & table -----------------

function applyFilters() {
  const frbFilter = document
    .getElementById("filter-frb")
    .value.trim()
    .toLowerCase();
  const yearFilter = document
    .getElementById("filter-year")
    .value.trim();

  const minScoreStr = document
    .getElementById("filter-min-score")
    .value.trim();
  const minSumStr = document
    .getElementById("filter-min-sum")
    .value.trim();

  const minScore =
    minScoreStr === "" ? null : parseFloat(minScoreStr);
  const minSum = minSumStr === "" ? null : parseFloat(minSumStr);

  filteredEntries = allEntries.filter((entry) => {
    // FRB ID substring filter
    if (frbFilter && !entry.frb_id.toLowerCase().includes(frbFilter)) {
      return false;
    }
    // Year filter (exact match)
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

    // Min top1 P_Ox
    if (minScore !== null) {
      if (
        top1 === null ||
        typeof top1 !== "number" ||
        !Number.isFinite(top1) ||
        top1 < minScore
      ) {
        return false;
      }
    }

    // Min (top1 + top2) P_Ox
    if (minSum !== null) {
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

  console.log(
    "applyFilters: allEntries =",
    allEntries.length,
    "filteredEntries =",
    filteredEntries.length
  );

  renderTable();
}

function renderTable() {
  const tbody = document.querySelector("#frb-table tbody");
  tbody.innerHTML = "";

  console.log("renderTable: rendering", filteredEntries.length, "entries");

  filteredEntries.forEach((entry, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.index = idx;

    const date = entry.date || "";
    const path = entry.path || {};
    const scoreVal =
      typeof path.best_score === "number" ? path.best_score : null;
    const score =
      scoreVal !== null ? scoreVal.toFixed(3) : "";

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

  // Don't touch images-container here; selection/grid controls manage it
}

// ----------------- Per-FRB view -----------------

function imageUrl(img) {
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

// ----------------- Grid views (PATH / HOST) -----------------

function showGridForMode(mode) {
  const container = document.getElementById("images-container");
  container.innerHTML = "";
  const infoDiv = document.getElementById("selected-info");

  if (!filteredEntries.length) {
    infoDiv.textContent = "No FRBs match the current filters.";
    container.textContent = "Nothing to show.";
    return;
  }

  let label = "";
  let predicate = (entry, img) => true;

  switch (mode) {
    case "all-images":
      label = "all images (all repos)";
      predicate = () => true;
      break;

    // PATH
    case "path-all":
      label = "all CHIME-PATH images";
      predicate = (entry, img) => isPathImage(img);
      break;
    case "path-main":
      label = "CHIME-PATH main PATH images";
      predicate = (entry, img) =>
        isPathImage(img) && img.kind === "path-main";
      break;
    case "path-local-stars":
      label = "CHIME-PATH local-with-stars images";
      predicate = (entry, img) =>
        isPathImage(img) && img.kind === "path-local-stars";
      break;
    case "path-local-nostars":
      label = "CHIME-PATH local-without-stars images";
      predicate = (entry, img) =>
        isPathImage(img) && img.kind === "path-local-nostars";
      break;
    case "path-zoomin":
      label = "CHIME-PATH zoom-in images";
      predicate = (entry, img) =>
        isPathImage(img) && img.kind === "path-zoomin";
      break;

    // HOST
    case "host-all":
      label = "all CHIME-HOST analysis images";
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
      label = "images";
      predicate = () => true;
  }

  infoDiv.textContent = `Grid view: ${label} for ${filteredEntries.length} filtered FRBs.`;

  let count = 0;

  filteredEntries.forEach((entry) => {
    (entry.images || []).forEach((imgInfo) => {
      if (!predicate(entry, imgInfo)) return;
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

// Filters
document
  .getElementById("filter-frb")
  .addEventListener("input", applyFilters);

document
  .getElementById("filter-year")
  .addEventListener("input", applyFilters);

document
  .getElementById("filter-min-score")
  .addEventListener("input", applyFilters);

document
  .getElementById("filter-min-sum")
  .addEventListener("input", applyFilters);

// "Selected FRB" button: reset message and rely on table click for per-FRB view
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

// Wire CHIME-PATH dropdown
document.querySelectorAll("#dropdown-path a").forEach((link) => {
  link.addEventListener("click", (evt) => {
    evt.preventDefault();
    const mode = link.getAttribute("data-mode");
    showGridForMode(mode);
  });
});

// Wire CHIME-HOST dropdown
document.querySelectorAll("#dropdown-host a").forEach((link) => {
  link.addEventListener("click", (evt) => {
    evt.preventDefault();
    const mode = link.getAttribute("data-mode");
    showGridForMode(mode);
  });
});

// ----------------- Kick off the initial load -----------------
loadData();

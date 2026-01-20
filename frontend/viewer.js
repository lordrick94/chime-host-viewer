console.log("viewer.js loaded");

const API_BASE = "/api";

let allEntries = [];
let filteredEntries = [];
let selectedEntry = null;

// PATH candidate data - now using pagination
let allCandidates = [];
let filteredCandidates = [];

// Pagination state
let paginationState = {
  offset: 0,
  limit: 100,
  total: 0,
  hasMore: false,
  currentPage: 1,
};

// Data source state
let currentDataSource = null;
let availableDataSources = [];

// Lightbox state
let lightboxImages = [];
let lightboxCurrentIndex = 0;

// -----------------------------------------------------------------------------
// Data Source Management
// -----------------------------------------------------------------------------

async function loadDataSources() {
  const select = document.getElementById("data-source-select");
  if (!select) return;

  try {
    const response = await fetch(`${API_BASE}/data-sources`, {
      credentials: "include",
    });
    if (!response.ok) {
      console.error("Failed to load data sources:", response.status);
      return;
    }

    const data = await response.json();
    availableDataSources = data.sources || [];
    currentDataSource = data.active;

    // Populate select
    select.innerHTML = "";
    availableDataSources.forEach((source) => {
      const option = document.createElement("option");
      option.value = source;
      option.textContent = source;
      if (source === currentDataSource) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    select.disabled = false;
    console.log("Data sources loaded:", availableDataSources, "Active:", currentDataSource);
  } catch (err) {
    console.error("loadDataSources error:", err);
  }
}

async function switchDataSource(sourceName) {
  const select = document.getElementById("data-source-select");
  const switchStatus = document.getElementById("switch-status");
  const status = document.getElementById("status");

  if (!sourceName || sourceName === currentDataSource) return;

  // Disable select and show loading
  if (select) select.disabled = true;
  if (switchStatus) {
    switchStatus.textContent = "Switching...";
    switchStatus.className = "loading";
  }
  if (status) status.textContent = "Rebuilding index...";

  try {
    const response = await fetch(
      `${API_BASE}/data-sources/switch?source_name=${encodeURIComponent(sourceName)}`,
      {
        method: "POST",
        credentials: "include",
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Switch failed");
    }

    const result = await response.json();
    currentDataSource = result.active;

    if (switchStatus) {
      switchStatus.textContent = "✓";
      switchStatus.className = "success";
      setTimeout(() => {
        switchStatus.textContent = "";
      }, 2000);
    }

    // Reset all data loaded flag
    allDataLoaded = false;
    const loadAllBtn = document.getElementById("btn-load-all");
    if (loadAllBtn) loadAllBtn.textContent = "Load all data";

    // Reload all data
    await loadData();
    await loadPathTable(0, paginationState.limit);

    if (status) status.textContent = `Switched to ${sourceName} - ${result.frb_count} FRBs`;
  } catch (err) {
    console.error("switchDataSource error:", err);
    if (switchStatus) {
      switchStatus.textContent = "✗ Error";
      switchStatus.className = "error";
    }
    if (status) status.textContent = `Switch failed: ${err.message}`;

    // Reset select to previous value
    if (select) {
      select.value = currentDataSource;
    }
  } finally {
    if (select) select.disabled = false;
  }
}

// -----------------------------------------------------------------------------
// Lightbox Functions
// -----------------------------------------------------------------------------

function openLightbox(images, startIndex = 0) {
  lightboxImages = images;
  lightboxCurrentIndex = startIndex;

  const lightbox = document.getElementById("lightbox");
  if (!lightbox) return;

  lightbox.classList.remove("hidden");
  document.body.style.overflow = "hidden"; // Prevent background scroll

  updateLightboxImage();
}

function closeLightbox() {
  const lightbox = document.getElementById("lightbox");
  if (!lightbox) return;

  lightbox.classList.add("hidden");
  document.body.style.overflow = ""; // Restore scroll
}

function updateLightboxImage() {
  const img = document.getElementById("lightbox-img");
  const caption = document.getElementById("lightbox-caption");
  const current = document.getElementById("lightbox-current");
  const total = document.getElementById("lightbox-total");
  const prevBtn = document.getElementById("lightbox-prev");
  const nextBtn = document.getElementById("lightbox-next");

  if (!img || !lightboxImages.length) return;

  const imageData = lightboxImages[lightboxCurrentIndex];
  img.src = imageData.url;

  if (caption) {
    caption.textContent = `${imageData.frbId} — ${imageData.kind} — ${imageData.filename}`;
  }

  if (current) current.textContent = lightboxCurrentIndex + 1;
  if (total) total.textContent = lightboxImages.length;

  // Update nav button states
  if (prevBtn) prevBtn.disabled = lightboxCurrentIndex === 0;
  if (nextBtn) nextBtn.disabled = lightboxCurrentIndex >= lightboxImages.length - 1;
}

function lightboxPrev() {
  if (lightboxCurrentIndex > 0) {
    lightboxCurrentIndex--;
    updateLightboxImage();
  }
}

function lightboxNext() {
  if (lightboxCurrentIndex < lightboxImages.length - 1) {
    lightboxCurrentIndex++;
    updateLightboxImage();
  }
}

function downloadCurrentImage() {
  if (!lightboxImages.length) return;

  const imageData = lightboxImages[lightboxCurrentIndex];
  const link = document.createElement("a");
  link.href = imageData.url;
  link.download = imageData.filename || `${imageData.frbId}_${imageData.kind}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function setupLightboxEventListeners() {
  const lightbox = document.getElementById("lightbox");
  const overlay = lightbox?.querySelector(".lightbox-overlay");
  const closeBtn = document.getElementById("lightbox-close");
  const prevBtn = document.getElementById("lightbox-prev");
  const nextBtn = document.getElementById("lightbox-next");
  const downloadBtn = document.getElementById("lightbox-download");

  // Close on overlay click
  if (overlay) {
    overlay.addEventListener("click", closeLightbox);
  }

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener("click", closeLightbox);
  }

  // Navigation buttons
  if (prevBtn) {
    prevBtn.addEventListener("click", lightboxPrev);
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", lightboxNext);
  }

  // Download button
  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadCurrentImage);
  }

  // Keyboard navigation
  document.addEventListener("keydown", (e) => {
    const lightbox = document.getElementById("lightbox");
    if (!lightbox || lightbox.classList.contains("hidden")) return;

    switch (e.key) {
      case "Escape":
        closeLightbox();
        break;
      case "ArrowLeft":
        lightboxPrev();
        break;
      case "ArrowRight":
        lightboxNext();
        break;
      case "d":
      case "D":
        downloadCurrentImage();
        break;
    }
  });
}

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
// Load PATH candidate table with pagination
// -----------------------------------------------------------------------------

async function loadPathTable(offset = 0, limit = 100) {
  const paginationInfo = document.getElementById("pagination-info");
  const dataLoadStatus = document.getElementById("data-load-status");

  if (paginationInfo) {
    paginationInfo.textContent = "Loading candidates...";
  }

  // Reset allDataLoaded if we're doing a paginated load
  if (limit < 10000) {
    allDataLoaded = false;
  }

  try {
    const params = new URLSearchParams();
    params.set("offset", offset);
    params.set("limit", limit);

    const response = await fetch(`${API_BASE}/path-table?${params.toString()}`, {
      credentials: "include",
    });
    if (!response.ok) {
      console.error("Failed to load /api/path-table:", response.status);
      allCandidates = [];
      filteredCandidates = [];
      updatePaginationInfo();
      return;
    }

    const result = await response.json();

    // Handle paginated response
    allCandidates = result.data || [];
    paginationState.offset = result.offset;
    paginationState.limit = result.limit;
    paginationState.total = result.total;
    paginationState.hasMore = result.has_more;
    paginationState.currentPage = Math.floor(result.offset / result.limit) + 1;

    filteredCandidates = allCandidates.slice();

    console.log(`Loaded path-table: ${allCandidates.length} rows (${result.offset}-${result.offset + allCandidates.length} of ${result.total})`);

    populatePlotColumnSelects();
    computeFilteredCandidates();
    renderCandidateTable();
    updatePaginationControls();
    updatePaginationInfo();
  } catch (err) {
    console.error("loadPathTable error:", err);
    allCandidates = [];
    filteredCandidates = [];
    updatePaginationInfo();
  }
}

function updatePaginationInfo() {
  const paginationInfo = document.getElementById("pagination-info");
  const pageIndicator = document.getElementById("page-indicator");

  if (paginationInfo) {
    const start = paginationState.offset + 1;
    const end = Math.min(paginationState.offset + allCandidates.length, paginationState.total);
    paginationInfo.textContent = `Showing ${start}-${end} of ${paginationState.total.toLocaleString()} candidates`;
  }

  if (pageIndicator) {
    const totalPages = Math.ceil(paginationState.total / paginationState.limit) || 1;
    pageIndicator.textContent = `Page ${paginationState.currentPage} of ${totalPages}`;
  }
}

function updatePaginationControls() {
  const prevBtn = document.getElementById("btn-prev-page");
  const nextBtn = document.getElementById("btn-next-page");

  if (prevBtn) {
    prevBtn.disabled = paginationState.offset === 0;
  }

  if (nextBtn) {
    nextBtn.disabled = !paginationState.hasMore;
  }
}

function goToNextPage() {
  if (paginationState.hasMore) {
    const newOffset = paginationState.offset + paginationState.limit;
    loadPathTable(newOffset, paginationState.limit);
  }
}

function goToPrevPage() {
  if (paginationState.offset > 0) {
    const newOffset = Math.max(0, paginationState.offset - paginationState.limit);
    loadPathTable(newOffset, paginationState.limit);
  }
}

function changePageSize(newSize) {
  paginationState.limit = newSize;
  paginationState.offset = 0; // Reset to first page
  loadPathTable(0, newSize);
}

// Track if we've loaded all data
let allDataLoaded = false;

async function loadAllCandidates() {
  const loadAllBtn = document.getElementById("btn-load-all");
  const statusEl = document.getElementById("data-load-status");
  const modeSelect = document.getElementById("candidates-mode-select");
  const mode = modeSelect ? modeSelect.value : "top1";

  // Parse mode to get top_n value (null means all)
  let topN = null;
  let modeText = "all candidates";
  if (mode === "top1") {
    topN = 1;
    modeText = "top 1 per FRB";
  } else if (mode === "top2") {
    topN = 2;
    modeText = "top 2 per FRB";
  } else if (mode === "top5") {
    topN = 5;
    modeText = "top 5 per FRB";
  }

  if (loadAllBtn) {
    loadAllBtn.disabled = true;
    loadAllBtn.classList.add("loading");
    loadAllBtn.textContent = "Loading...";
  }

  if (statusEl) {
    statusEl.textContent = `Loading ${modeText}...`;
    statusEl.className = "data-load-status warning";
  }

  try {
    // First, get the total count
    const countParams = new URLSearchParams();
    countParams.set("offset", 0);
    countParams.set("limit", 1);
    if (topN !== null) countParams.set("top_n", topN);

    const countResponse = await fetch(`${API_BASE}/path-table?${countParams.toString()}`, {
      credentials: "include",
    });
    if (!countResponse.ok) throw new Error(`HTTP ${countResponse.status}`);
    const countResult = await countResponse.json();
    const total = countResult.total;

    // Warn for large datasets
    if (total > 50000) {
      const confirmLoad = window.confirm(
        `This will load ${total.toLocaleString()} candidates into memory.\n\n` +
        `This may take a while and could slow down your browser.\n\n` +
        `Consider using "Top 1 per FRB" for faster loading.\n\n` +
        `Continue?`
      );
      if (!confirmLoad) {
        if (loadAllBtn) {
          loadAllBtn.disabled = false;
          loadAllBtn.classList.remove("loading");
          loadAllBtn.textContent = "Load data for plot";
        }
        if (statusEl) statusEl.textContent = "";
        return;
      }
    }

    // Load data in batches (API max limit is 10000)
    const batchSize = 10000;
    const allData = [];
    let offset = 0;

    while (offset < total) {
      if (statusEl) {
        const progress = Math.min(offset + batchSize, total);
        statusEl.textContent = `Loading ${modeText}: ${progress.toLocaleString()} / ${total.toLocaleString()}...`;
      }

      const params = new URLSearchParams();
      params.set("offset", offset);
      params.set("limit", batchSize);
      if (topN !== null) params.set("top_n", topN);

      const response = await fetch(`${API_BASE}/path-table?${params.toString()}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      allData.push(...(result.data || []));

      if (!result.has_more) break;
      offset += batchSize;
    }

    allCandidates = allData;
    allDataLoaded = true;

    // Update pagination state
    paginationState.total = allCandidates.length;
    paginationState.offset = 0;
    paginationState.limit = allCandidates.length;
    paginationState.hasMore = false;

    if (statusEl) {
      statusEl.textContent = `Loaded ${allCandidates.length.toLocaleString()} candidates (${modeText}). Ready for plotting.`;
      statusEl.className = "data-load-status success";
    }

    console.log(`Loaded ${allCandidates.length} candidates (${modeText}) for plotting`);

    // Recompute filtered candidates and update UI
    computeFilteredCandidates();
    renderCandidateTable();
    updatePaginationInfo();
    updatePaginationControls();

  } catch (err) {
    console.error("loadAllCandidates error:", err);
    if (statusEl) {
      statusEl.textContent = `Error loading data: ${err.message}`;
      statusEl.className = "data-load-status warning";
    }
  } finally {
    if (loadAllBtn) {
      loadAllBtn.disabled = false;
      loadAllBtn.classList.remove("loading");
      loadAllBtn.textContent = allDataLoaded ? "Data loaded ✓" : "Load data for plot";
    }
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

  // Build lightbox image array for this FRB
  const lightboxData = images.map((imgInfo) => ({
    url: imageUrl(imgInfo),
    frbId: entry.frb_id,
    kind: imgInfo.kind,
    filename: imgInfo.filename,
  }));

  images.forEach((imgInfo, index) => {
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

    // Click to open lightbox
    card.addEventListener("click", () => {
      openLightbox(lightboxData, index);
    });

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

  // Collect all matching images for lightbox
  const allGridImages = [];

  filteredEntries.forEach((entry) => {
    (entry.images || []).forEach((imgInfo) => {
      if (predicate(entry, imgInfo)) {
        allGridImages.push({
          url: imageUrl(imgInfo),
          frbId: entry.frb_id,
          kind: imgInfo.kind,
          filename: imgInfo.filename,
        });
      }
    });
  });

  // Render image cards
  allGridImages.forEach((imageData, index) => {
    const card = document.createElement("div");
    card.className = "img-card";

    const title = document.createElement("div");
    title.className = "img-card-title";
    title.textContent = `${imageData.frbId} — ${imageData.kind}`;
    card.appendChild(title);

    const img = document.createElement("img");
    img.src = imageData.url;
    img.alt = imageData.filename;
    card.appendChild(img);

    const caption = document.createElement("div");
    caption.className = "img-caption";
    caption.textContent = imageData.filename;
    card.appendChild(caption);

    // Click to open lightbox
    card.addEventListener("click", () => {
      openLightbox(allGridImages, index);
    });

    container.appendChild(card);
  });

  if (allGridImages.length === 0) {
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
      // Warn if not all data is loaded
      if (!allDataLoaded && paginationState.total > paginationState.limit) {
        const statusEl = document.getElementById("data-load-status");
        if (statusEl) {
          statusEl.textContent = `Warning: Only ${allCandidates.length} of ${paginationState.total.toLocaleString()} candidates loaded. Click "Load all data" for complete plot.`;
          statusEl.className = "data-load-status warning";
        }
      }
      computeFilteredCandidates();
      renderCandidateTable();
      generateCandidatePlot();
    });
  }

  // Load all data button
  const btnLoadAll = document.getElementById("btn-load-all");
  if (btnLoadAll) {
    btnLoadAll.addEventListener("click", loadAllCandidates);
  }

  // Candidates mode dropdown - reset loaded state when changed
  const candidatesModeSelect = document.getElementById("candidates-mode-select");
  if (candidatesModeSelect) {
    candidatesModeSelect.addEventListener("change", () => {
      allDataLoaded = false;
      const loadAllBtn = document.getElementById("btn-load-all");
      if (loadAllBtn) loadAllBtn.textContent = "Load data for plot";
      const statusEl = document.getElementById("data-load-status");
      if (statusEl) {
        statusEl.textContent = "Mode changed - click 'Load data for plot' to reload.";
        statusEl.className = "data-load-status";
      }
    });
  }

  // Pagination controls
  const btnPrevPage = document.getElementById("btn-prev-page");
  const btnNextPage = document.getElementById("btn-next-page");
  const pageSizeSelect = document.getElementById("page-size-select");

  if (btnPrevPage) {
    btnPrevPage.addEventListener("click", goToPrevPage);
  }

  if (btnNextPage) {
    btnNextPage.addEventListener("click", goToNextPage);
  }

  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", (e) => {
      changePageSize(parseInt(e.target.value, 10));
    });
  }

  // Data source selector
  const dataSourceSelect = document.getElementById("data-source-select");
  if (dataSourceSelect) {
    dataSourceSelect.addEventListener("change", (e) => {
      switchDataSource(e.target.value);
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
  setupLightboxEventListeners();

  // Load data sources first, then load data
  loadDataSources();
  loadData();

  // Load path table with default pagination (100 rows per page)
  const pageSizeSelect = document.getElementById("page-size-select");
  const defaultPageSize = pageSizeSelect ? parseInt(pageSizeSelect.value, 10) : 100;
  loadPathTable(0, defaultPageSize);
});

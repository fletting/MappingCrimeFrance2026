// frontend/js/report.js

// ==================== CONFIG ====================

// URL de ton API Render
const API_BASE_URL = "https://mappingcrime-api.onrender.com";

// ==================== VARIABLES GLOBALES ====================

let map;
let clickMarker = null;
let reportMarkers = [];
let isSubmitting = false;

// ==================== ELEMENTS DU DOM ====================

const reportForm =
  document.getElementById("reportForm") || document.querySelector("form");
const typeInput = document.getElementById("type");
const datetimeInput = document.getElementById("datetime");
const addressInput = document.getElementById("address");
const postalCodeInput = document.getElementById("postalCode");
const cityInput = document.getElementById("city");
const descriptionInput = document.getElementById("description");
const fileInput = document.getElementById("fileInput");
const formError = document.getElementById("formError");
const removePointBtn = document.getElementById("removePointBtn");

const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const periodSelect = document.getElementById("periodSelect");

const typeFilters = document.querySelectorAll(".filter-type");

// ==================== HELPERS UI ====================

function showMessage(msg, type = "info") {
  console.log("[UI message]", type, msg);
  if (!formError) return;
  formError.textContent = msg;
  formError.className = `form-error form-error--${type}`;
}

function clearMessage() {
  if (!formError) return;
  formError.textContent = "";
  formError.className = "form-error";
}

function setSubmitting(on) {
  isSubmitting = on;
  if (!reportForm) return;
  const submitBtn = reportForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = on;
}

// ==================== INIT CARTE ====================

function initMap() {
  console.log("Init map…");
  map = L.map("map").setView([48.8566, 2.3522], 13); // Paris

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  map.on("click", onMapClick);

  loadReports();
}

// ==================== CLIC SUR LA CARTE ====================

async function onMapClick(e) {
  console.log("Map click", e.latlng);
  const { lat, lng } = e.latlng;

  if (clickMarker) {
    clickMarker.setLatLng(e.latlng);
  } else {
    clickMarker = L.marker(e.latlng, { draggable: true }).addTo(map);
    clickMarker.on("dragend", onMarkerDragEnd);
  }

  if (removePointBtn) removePointBtn.disabled = false;

  await reverseGeocode(lat, lng);
}

async function onMarkerDragEnd() {
  if (!clickMarker) return;
  const { lat, lng } = clickMarker.getLatLng();
  await reverseGeocode(lat, lng);
}

// ==================== REVERSE GEOCODING ====================

async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lng)}&addressdetails=1`;

    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "MappingCrimeFrance/1.0 (https://thunderous-hamster-452ee6.netlify.app)",
      },
    });

    if (!resp.ok) {
      console.warn("Reverse geocode error:", resp.status);
      return;
    }

    const data = await resp.json();
    const addr = data.address || {};

    if (addressInput) {
      addressInput.value =
        data.display_name?.split(",").slice(0, 3).join(", ") ||
        data.display_name ||
        "";
    }
    if (postalCodeInput) postalCodeInput.value = addr.postcode || "";
    if (cityInput)
      cityInput.value =
        addr.city || addr.town || addr.village || addr.municipality || "";
  } catch (err) {
    console.error("Erreur reverse geocode:", err);
  }
}

// ==================== RECHERCHE ADRESSE ====================

async function handleSearchSubmit(e) {
  e.preventDefault();
  const query = (searchInput?.value || "").trim();
  if (!query) return;

  console.log("Recherche adresse:", query);

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query
    )}&limit=1`;

    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "MappingCrimeFrance/1.0 (https://thunderous-hamster-452ee6.netlify.app)",
      },
    });

    if (!resp.ok) {
      console.warn("Search error:", resp.status);
      return;
    }

    const results = await resp.json();
    if (results.length > 0) {
      const { lat, lon } = results[0];
      map.setView([parseFloat(lat), parseFloat(lon)], 14);
    } else {
      showMessage("Adresse introuvable.", "error");
    }
  } catch (err) {
    console.error("Erreur recherche adresse:", err);
    showMessage("Erreur lors de la recherche d'adresse.", "error");
  }
}

// ==================== CHARGER LES DECLARATIONS ====================

async function loadReports() {
  if (!map) return;
  console.log("Chargement des déclarations…");

  try {
    const days = periodSelect ? periodSelect.value : "7";
    const url = `${API_BASE_URL}/api/reports?days=${encodeURIComponent(days)}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn("Erreur /api/reports:", resp.status);
      return;
    }

    const reports = await resp.json();

    // Remove old markers
    reportMarkers.forEach((m) => map.removeLayer(m.marker));
    reportMarkers = [];

    for (const report of reports) {
      const lat = report.latitude ?? report.lat;
      const lng = report.longitude ?? report.lon;
      if (typeof lat !== "number" || typeof lng !== "number") continue;

      const marker = L.marker([lat, lng]).addTo(map);

      const popupContent = `
        <strong>${escapeHtml(report.type || "Fait")}</strong><br/>
        ${report.address ? escapeHtml(report.address) + "<br/>" : ""}
        ${
          report.description
            ? `<em>${escapeHtml(report.description)}</em><br/>`
            : ""
        }
        ${
          report.datetime
            ? `<small>${escapeHtml(report.datetime)}</small>`
            : ""
        }
      `;

      marker.bindPopup(popupContent);

      reportMarkers.push({
        marker,
        type: report.type || "autre",
      });
    }

    applyTypeFilters();
  } catch (err) {
    console.error("Erreur loadReports:", err);
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ==================== FILTRES ====================

function applyTypeFilters() {
  if (!typeFilters || typeFilters.length === 0) return;

  const activeTypes = new Set(
    Array.from(typeFilters)
      .filter((cb) => cb.checked)
      .map((cb) => cb.dataset.type)
  );

  reportMarkers.forEach(({ marker, type }) => {
    if (activeTypes.has(type)) {
      if (!map.hasLayer(marker)) marker.addTo(map);
    } else {
      if (map.hasLayer(marker)) map.removeLayer(marker);
    }
  });
}

// ==================== SOUMISSION DU FORMULAIRE ====================

async function handleSubmit(e) {
  e.preventDefault();
  clearMessage();
  console.log("Submit formulaire…");
  if (isSubmitting) return;

  if (!clickMarker) {
    showMessage(
      "Cliquez sur la carte pour placer le point de l'incident.",
      "error"
    );
    return;
  }

  const type = typeInput?.value || "";
  const datetime = datetimeInput?.value || "";
  const address = (addressInput?.value || "").trim();
  const postal_code = (postalCodeInput?.value || "").trim();
  const city = (cityInput?.value || "").trim();
  const description = (descriptionInput?.value || "").trim();

  const { lat, lng } = clickMarker.getLatLng();

  if (!type || !datetime) {
    showMessage(
      "Merci de renseigner au minimum le type de fait et la date.",
      "error"
    );
    return;
  }

  const payload = {
    type,
    datetime,
    description,
    latitude: lat,
    longitude: lng,
    address,
    postcode: postal_code, // <-- IMPORTANT
    city,
  };

  console.log("Payload envoyé à l'API:", payload);
  showMessage("Envoi de votre déclaration…", "info");
  setSubmitting(true);

  try {
    const resp = await fetch(`${API_BASE_URL}/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* pas du JSON, on laisse data à null */
    }

    if (!resp.ok) {
      console.error("Réponse API erreur:", resp.status, text);
      if (data && Array.isArray(data.detail) && data.detail.length > 0) {
        const first = data.detail[0];
        const field = Array.isArray(first.loc) ? first.loc.join(" > ") : "";
        const msg = first.msg || "Erreur de validation.";
        showMessage(`Erreur sur le champ "${field}" : ${msg}`, "error");
      } else {
        showMessage(
          `Erreur côté serveur (code ${resp.status}).`,
          "error"
        );
      }
      return;
    }

    console.log("Déclaration OK:", data || text);
    showMessage(
      "Déclaration envoyée ! Merci pour votre contribution 🙏",
      "success"
    );

    if (reportForm) reportForm.reset();

    if (clickMarker && map) {
      map.removeLayer(clickMarker);
      clickMarker = null;
    }
    if (removePointBtn) removePointBtn.disabled = true;

    await loadReports();
  } catch (err) {
    console.error("Erreur fetch /api/reports:", err);
    showMessage(
      "Impossible de contacter le serveur. Réessayez un peu plus tard.",
      "error"
    );
  } finally {
    setSubmitting(false);
  }
}

// ==================== BOUTON SUPPRIMER LE POINT ====================

function handleRemovePoint() {
  console.log("Suppression du point");
  if (clickMarker && map) {
    map.removeLayer(clickMarker);
  }
  clickMarker = null;
  if (removePointBtn) removePointBtn.disabled = true;
}

// ==================== LISTENERS ====================

function attachEventListeners() {
  console.log("Attache des écouteurs…");
  if (reportForm) {
    reportForm.addEventListener("submit", handleSubmit);
  } else {
    console.warn("Aucun formulaire trouvé pour la déclaration.");
  }

  if (removePointBtn) {
    removePointBtn.addEventListener("click", handleRemovePoint);
  }

  if (searchForm) {
    searchForm.addEventListener("submit", handleSearchSubmit);
  }

  if (periodSelect) {
    periodSelect.addEventListener("change", loadReports);
  }

  if (typeFilters && typeFilters.length > 0) {
    typeFilters.forEach((cb) =>
      cb.addEventListener("change", applyTypeFilters)
    );
  }
}

// ==================== MAIN ====================

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM entièrement chargé, report.js démarre…");

  if (typeof L === "undefined") {
    console.error(
      "Leaflet (L) n'est pas chargé. Vérifie la balise <script> leaflet dans index.html."
    );
    showMessage(
      "Erreur de carte : Leaflet n'est pas chargé. Vérifie la configuration.",
      "error"
    );
    return;
  }

  attachEventListeners();
  initMap();
});

// frontend/js/report.js

// URL de ton API Render
const API_BASE_URL = "https://mappingcrime-api.onrender.com";

// ------------- Variables globales -------------
let map;
let clickMarker = null;
let reportMarkers = [];
let isSubmitting = false;

// ------------- Sélecteurs DOM -------------
const reportForm = document.getElementById("reportForm");
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

// ------------- Helpers UI -------------

function showMessage(msg, type = "info") {
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
  if (reportForm) {
    const submitBtn = reportForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = on;
  }
}

// ------------- Initialisation de la carte -------------

function initMap() {
  map = L.map("map").setView([48.8566, 2.3522], 13); // Paris

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  map.on("click", onMapClick);

  // Charger les déclarations existantes
  loadReports();
}

// ------------- Clic sur la carte -------------

async function onMapClick(e) {
  const { lat, lng } = e.latlng;

  if (clickMarker) {
    clickMarker.setLatLng(e.latlng);
  } else {
    clickMarker = L.marker(e.latlng, { draggable: true }).addTo(map);
    clickMarker.on("dragend", onMarkerDragEnd);
  }

  if (removePointBtn) {
    removePointBtn.disabled = false;
  }

  // Remplir les champs adresse / CP / ville
  await reverseGeocode(lat, lng);
}

async function onMarkerDragEnd() {
  if (!clickMarker) return;
  const { lat, lng } = clickMarker.getLatLng();
  await reverseGeocode(lat, lng);
}

// ------------- Géocodage inverse (adresse depuis lat/lon) -------------

async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lng)}&addressdetails=1`;

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "MappingCrimeFrance/1.0 (https://thunderous-hamster-452ee6.netlify.app)",
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

// ------------- Recherche d’adresse (barre du haut) -------------

async function handleSearchSubmit(e) {
  e.preventDefault();
  const query = (searchInput?.value || "").trim();
  if (!query) return;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query
    )}&limit=1`;

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "MappingCrimeFrance/1.0 (https://thunderous-hamster-452ee6.netlify.app)",
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

// ------------- Chargement des déclarations depuis l’API -------------

async function loadReports() {
  if (!map) return;

  try {
    const days = periodSelect ? periodSelect.value : "7";
    const url = `${API_BASE_URL}/api/reports?days=${encodeURIComponent(days)}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn("Erreur /api/reports:", resp.status);
      return;
    }

    const reports = await resp.json();

    // Supprimer les anciens marqueurs
    reportMarkers.forEach((m) => map.removeLayer(m.marker));
    reportMarkers = [];

    // Ajouter les nouveaux
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

// ------------- Filtres par type -------------

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

// ------------- Soumission du formulaire -------------

async function handleSubmit(e) {
  e.preventDefault();
  clearMessage();
  if (isSubmitting) return;

  // Vérifier qu'un point est posé sur la carte
  if (!clickMarker) {
    showMessage("Cliquez sur la carte pour placer le point de l'incident.", "error");
    return;
  }

  const type = typeInput.value;
  const datetime = datetimeInput.value;
  const address = addressInput.value.trim();
  const postal_code = postalCodeInput.value.trim();
  const city = cityInput.value.trim();
  const description = descriptionInput.value.trim();

  const { lat, lng } = clickMarker.getLatLng();

  if (!type || !datetime) {
    showMessage("Merci de renseigner au minimum le type de fait et la date.", "error");
    return;
  }

  const payload = {
    type,
    datetime,
    description,
    latitude: lat,
    longitude: lng,
    address,
    // IMPORTANT : le backend attend "postcode"
    postcode: postal_code,
    city,
  };

  try {
    setSubmitting(true);

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
      // ce n'est pas du JSON, on laisse data à null
    }

    if (!resp.ok) {
      console.error("Réponse d'erreur API:", resp.status, text);

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

    // Succès
    showMessage(
      "Déclaration envoyée ! Merci pour votre contribution 🙏",
      "success"
    );

    // Réinitialiser le formulaire
    reportForm.reset();

    // Supprimer le marqueur de clic
    if (clickMarker) {
      map.removeLayer(clickMarker);
      clickMarker = null;
    }
    if (removePointBtn) removePointBtn.disabled = true;

    // Recharger les déclarations depuis l'API
    await loadReports();
  } catch (err) {
    console.error("Erreur lors de l'envoi de la déclaration:", err);
    showMessage(
      "Impossible de contacter le serveur. Réessayez un peu plus tard.",
      "error"
    );
  } finally {
    setSubmitting(false);
  }
}

// ------------- Bouton "Supprimer le point" -------------

function handleRemovePoint() {
  if (clickMarker && map) {
    map.removeLayer(clickMarker);
  }
  clickMarker = null;
  if (removePointBtn) removePointBtn.disabled = true;
}

// ------------- Écouteurs d’événements -------------

function attachEventListeners() {
  if (reportForm) {
    reportForm.addEventListener("submit", handleSubmit);
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

// ------------- Lancement -------------

document.addEventListener("DOMContentLoaded", () => {
  if (typeof L === "undefined") {
    console.error("Leaflet (L) n'est pas chargé. Vérifie la balise <script> leaflet dans index.html.");
    showMessage(
      "Erreur de carte : Leaflet n'est pas chargé. Vérifie la configuration.",
      "error"
    );
    return;
  }

  attachEventListeners();
  initMap();
});

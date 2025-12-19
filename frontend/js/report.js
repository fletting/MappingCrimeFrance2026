// frontend/js/report.js

// URL de ton API FastAPI sur Render (à adapter si besoin)
const API_BASE = "https://mappingcrime-api.onrender.com"; // change si ton URL est différente

// Références DOM
const mapContainer = document.getElementById("map");
const reportForm = document.getElementById("reportForm");
const formError = document.getElementById("formError");
const removePointBtn = document.getElementById("removePointBtn");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const periodSelect = document.getElementById("periodSelect");
const typeFilters = document.querySelectorAll(".filter-type");

const addressInput = document.getElementById("address");
const postalCodeInput = document.getElementById("postalCode");
const cityInput = document.getElementById("city");

// Variables pour la carte / les marqueurs
let map;
let clickMarker = null;         // marqueur du point que l'utilisateur place
let selectedLat = null;
let selectedLng = null;

let reportsLayer = null;        // layerGroup pour les rapports venant de l'API
let reportMarkers = [];         // pour filtrer par type

// ----------------------- INITIALISATION CARTE -----------------------

function initMap() {
  if (!mapContainer) return;

  map = L.map("map").setView([46.5, 2.5], 6); // centre France

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  reportsLayer = L.layerGroup().addTo(map);

  // clic sur la carte pour placer le point
  map.on("click", (e) => {
    placeOrMoveClickMarker(e.latlng);
  });
}

function placeOrMoveClickMarker(latlng) {
  selectedLat = latlng.lat;
  selectedLng = latlng.lng;

  if (!clickMarker) {
    clickMarker = L.marker(latlng, { draggable: true }).addTo(map);
    clickMarker.on("dragend", () => {
      const ll = clickMarker.getLatLng();
      selectedLat = ll.lat;
      selectedLng = ll.lng;
      reverseGeocodeAndFill(ll.lat, ll.lng);
    });
  } else {
    clickMarker.setLatLng(latlng);
  }

  removePointBtn.disabled = false;
  reverseGeocodeAndFill(latlng.lat, latlng.lng);
}

// Reverse geocoding simple avec Nominatim pour préremplir adresse / CP / ville
function reverseGeocodeAndFill(lat, lng) {
  fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
  )
    .then((res) => res.json())
    .then((data) => {
      if (!data || !data.address) return;
      const addr = data.address;

      const voie =
        addr.road ||
        addr.pedestrian ||
        addr.footway ||
        addr.cycleway ||
        addr.residential ||
        "";

      const houseNumber = addr.house_number ? addr.house_number + " " : "";
      const displayAddress = `${houseNumber}${voie}`.trim();

      if (displayAddress) addressInput.value = displayAddress;
      if (addr.postcode) postalCodeInput.value = addr.postcode;
      if (addr.city || addr.town || addr.village || addr.hamlet) {
        cityInput.value = addr.city || addr.town || addr.village || addr.hamlet;
      }
    })
    .catch(() => {
      // silencieux, pas de popup
    });
}

// ----------------------- FORMULAIRE DÉCLARATION -----------------------

function handleReportSubmit(event) {
  event.preventDefault();
  formError.textContent = "";

  const formData = new FormData(reportForm);

  const type = formData.get("type");
  const datetime = formData.get("datetime");
  const description = formData.get("description") || "";

  if (!type || !datetime) {
    formError.textContent = "Veuillez renseigner le type de fait et la date/heure.";
    return;
  }

  if (selectedLat === null || selectedLng === null) {
    formError.textContent = "Veuillez cliquer sur la carte pour placer le point.";
    return;
  }

  const payload = {
    type,
    datetime, // format ISO venant du input datetime-local
    address: formData.get("address") || "",
    postal_code: formData.get("postalCode") || "",
    city: formData.get("city") || "",
    description,
    latitude: selectedLat,
    longitude: selectedLng,
  };

  fetch(`${API_BASE}/api/reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Erreur lors de l’enregistrement.");
      }
      return res.json();
    })
    .then(() => {
      // Reset du formulaire + point
      reportForm.reset();
      formError.textContent = "";
      selectedLat = null;
      selectedLng = null;
      if (clickMarker) {
        map.removeLayer(clickMarker);
        clickMarker = null;
      }
      removePointBtn.disabled = true;

      // Recharger les rapports depuis l'API
      loadReports();
    })
    .catch((err) => {
      console.error(err);
      formError.textContent = "Erreur lors de l’enregistrement de la déclaration.";
    });
}

function handleRemovePoint() {
  if (clickMarker && map) {
    map.removeLayer(clickMarker);
    clickMarker = null;
  }
  selectedLat = null;
  selectedLng = null;
  removePointBtn.disabled = true;
}

// ----------------------- CHARGEMENT DES RAPPORTS -----------------------

function getSelectedTypes() {
  const types = [];
  typeFilters.forEach((cb) => {
    if (cb.checked) types.push(cb.dataset.type);
  });
  return types;
}

function loadReports() {
  if (!API_BASE) return;

  const period = periodSelect ? periodSelect.value : "7";

  fetch(`${API_BASE}/api/reports?period=${encodeURIComponent(period)}`)
    .then(async (res) => {
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    })
    .then((data) => {
      displayReportsOnMap(data || []);
    })
    .catch((err) => {
      console.error("Erreur lors du chargement des rapports :", err);
      // pas de popup, juste dans la console
    });
}

function displayReportsOnMap(reports) {
  if (!reportsLayer) return;

  reportsLayer.clearLayers();
  reportMarkers = [];

  const selectedTypes = new Set(getSelectedTypes());

  reports.forEach((r) => {
    if (!("latitude" in r) || !("longitude" in r)) return;
    if (selectedTypes.size && !selectedTypes.has(r.type)) return;

    const icon = buildIconForType(r.type);

    const marker = L.marker([r.latitude, r.longitude], { icon }).addTo(reportsLayer);

    const dateText = r.datetime || r.created_at || "";
    const addressParts = [r.address, r.postal_code, r.city].filter(Boolean).join(" ");

    marker.bindPopup(
      `
      <strong>${escapeHtml(labelForType(r.type))}</strong><br/>
      <em>${escapeHtml(dateText)}</em><br/>
      ${escapeHtml(addressParts)}<br/><br/>
      ${escapeHtml(r.description || "")}
      `
    );

    reportMarkers.push({ marker, type: r.type });
  });
}

function buildIconForType(type) {
  const iconMap = {
    vol: "vol",
    cambriolage: "cambriolage",
    agression: "agression",
    agression_sexuelle: "Agression_sexuelle",
    viol: "viol",
    meurtre: "meurtre",
    carjacking: "carjacking",
    trafic_stupefiants: "trafic_stupefiants",
    degradations: "degradations",
    autre: "autre",
  };

  const key = iconMap[type] || "autre";
  return L.icon({
    iconUrl: `img/${key}.png`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

function labelForType(type) {
  switch (type) {
    case "vol":
      return "Vol";
    case "cambriolage":
      return "Cambriolage";
    case "agression":
      return "Agression";
    case "agression_sexuelle":
      return "Agression sexuelle";
    case "viol":
      return "Viol";
    case "meurtre":
      return "Meurtre";
    case "carjacking":
      return "Carjacking";
    case "trafic_stupefiants":
      return "Trafic de stupéfiants";
    case "degradations":
      return "Dégradations";
    default:
      return "Autre";
  }
}

// Pour filtrer quand on coche/décoche les types
function updateMarkerVisibility() {
  const selectedTypes = new Set(getSelectedTypes());

  reportMarkers.forEach(({ marker, type }) => {
    if (selectedTypes.size === 0 || selectedTypes.has(type)) {
      if (!map.hasLayer(marker)) marker.addTo(reportsLayer);
    } else {
      if (map.hasLayer(marker)) reportsLayer.removeLayer(marker);
    }
  });
}

// ----------------------- RECHERCHE ADRESSE -----------------------

function handleSearch(event) {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;

  fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query
    )}&countrycodes=fr&limit=1`
  )
    .then((res) => res.json())
    .then((data) => {
      if (!data || !data.length) return;
      const r = data[0];
      const lat = parseFloat(r.lat);
      const lon = parseFloat(r.lon);
      map.setView([lat, lon], 15);
    })
    .catch((err) => {
      console.error("Erreur de recherche :", err);
    });
}

// ----------------------- UTILS -----------------------

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ----------------------- INIT GLOBALE -----------------------

document.addEventListener("DOMContentLoaded", () => {
  initMap();

  if (reportForm) {
    reportForm.addEventListener("submit", handleReportSubmit);
  }

  if (removePointBtn) {
    removePointBtn.addEventListener("click", handleRemovePoint);
  }

  if (searchForm) {
    searchForm.addEventListener("submit", handleSearch);
  }

  typeFilters.forEach((cb) => {
    cb.addEventListener("change", () => {
      updateMarkerVisibility();
    });
  });

  if (periodSelect) {
    periodSelect.addEventListener("change", () => {
      loadReports();
    });
  }

  // Chargement initial des rapports
  loadReports();
});

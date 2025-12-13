// ================================
// CONFIG
// ================================

// URL de ton backend Render
const API_BASE_URL = "https://mappingcrime-api.onrender.com"; // adapte si besoin

// URLs Nominatim pour géocodage
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";

// ================================
// INIT CARTE
// ================================

const map = L.map("map").setView([46.5, 2], 6);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// ================================
// ICONES
// ================================

const iconBase = {
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -28]
};

const crimeIcons = {
  vol: L.icon({ ...iconBase, iconUrl: "img/vol.png" }),
  cambriolage: L.icon({ ...iconBase, iconUrl: "img/cambriolage.png" }),
  agression: L.icon({ ...iconBase, iconUrl: "img/agression.png" }),
  agression_sexuelle: L.icon({
    ...iconBase,
    iconUrl: "img/Agression_sexuelle.png"
  }),
  viol: L.icon({ ...iconBase, iconUrl: "img/viol.png" }),
  meurtre: L.icon({ ...iconBase, iconUrl: "img/meurtre.png" }),
  carjacking: L.icon({ ...iconBase, iconUrl: "img/carjacking.png" }),
  trafic_stupefiants: L.icon({
    ...iconBase,
    iconUrl: "img/trafic_stupefiants.png"
  }),
  degradations: L.icon({ ...iconBase, iconUrl: "img/degradations.png" }),
  autre: L.icon({ ...iconBase, iconUrl: "img/autre.png" })
};

function iconFor(type) {
  return crimeIcons[type] || crimeIcons.autre;
}

// ================================
// ETAT
// ================================

let currentMarker = null;
let currentLatLng = null;
const reportsLayer = L.layerGroup().addTo(map);

// FORM / DOM
const reportForm = document.getElementById("reportForm");
const removePointBtn = document.getElementById("removePointBtn");
const formError = document.getElementById("formError");

const typeField = document.getElementById("type");
const datetimeField = document.getElementById("datetime");
const addressField = document.getElementById("address");
const postalCodeField = document.getElementById("postalCode");
const cityField = document.getElementById("city");
const descriptionField = document.getElementById("description");
const fileInput = document.getElementById("fileInput");
const periodSelect = document.getElementById("periodSelect");

// ================================
// CLIC SUR LA CARTE
// ================================

map.on("click", async (e) => {
  setCurrentMarker(e.latlng);

  try {
    const addr = await reverseGeocode(e.latlng.lat, e.latlng.lng);
    if (addr) {
      addressField.value = addr.addressLine || "";
      postalCodeField.value = addr.postcode || "";
      cityField.value = addr.city || "";
    }
  } catch (err) {
    console.error("Erreur reverse geocode:", err);
  }
});

function setCurrentMarker(latlng) {
  currentLatLng = latlng;

  if (!currentMarker) {
    currentMarker = L.marker(latlng, { draggable: true }).addTo(map);

    currentMarker.on("dragend", async (e) => {
      const pos = e.target.getLatLng();
      currentLatLng = pos;
      try {
        const addr = await reverseGeocode(pos.lat, pos.lng);
        if (addr) {
          addressField.value = addr.addressLine || "";
          postalCodeField.value = addr.postcode || "";
          cityField.value = addr.city || "";
        }
      } catch (err) {
        console.error("Erreur reverse geocode drag:", err);
      }
    });
  } else {
    currentMarker.setLatLng(latlng);
  }

  removePointBtn.disabled = false;
}

removePointBtn.addEventListener("click", () => {
  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
    currentLatLng = null;
  }
  removePointBtn.disabled = true;
});

// ================================
// RECHERCHE ADRESSE
// ================================

const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");

searchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (!q) return;

  try {
    const url = `${NOMINATIM_SEARCH_URL}?format=json&q=${encodeURIComponent(
      q
    )}&limit=1&addressdetails=1`;
    const res = await fetch(url, { headers: { "Accept-Language": "fr" } });
    const data = await res.json();
    if (data && data.length > 0) {
      const { lat, lon } = data[0];
      map.setView([parseFloat(lat), parseFloat(lon)], 15);
    } else {
      alert("Aucun résultat pour cette recherche.");
    }
  } catch (err) {
    console.error(err);
    alert("Erreur lors de la recherche.");
  }
});

// ================================
// REVERSE GEOCODE
// ================================

async function reverseGeocode(lat, lng) {
  const url = `${NOMINATIM_REVERSE_URL}?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
  const res = await fetch(url, { headers: { "Accept-Language": "fr" } });
  if (!res.ok) return null;
  const data = await res.json();
  const address = data.address || {};
  const city = address.city || address.town || address.village || "";
  const line =
    (address.road || "") +
    (address.house_number ? " " + address.house_number : "") +
    (address.suburb ? ", " + address.suburb : "") +
    (city ? ", " + city : "");
  return {
    addressLine: line,
    postcode: address.postcode || "",
    city
  };
}

// ================================
// ENVOI FORMULAIRE
// ================================

reportForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.textContent = "";

   if (!typeField.value) {
    formError.textContent = "Merci de sélectionner un type de fait.";
    return;
  }

  if (!datetimeField.value) {
    formError.textContent =
      "Merci d’indiquer une date et une heure approximatives.";
    return;
  }

  if (!descriptionField.value.trim()) {
    formError.textContent =
      "Merci de renseigner une description (sans données personnelles).";
    return;
  }

  const fd = new FormData();
  fd.append("type", typeField.value);
  fd.append("datetime", datetimeField.value);
  fd.append("latitude", currentLatLng.lat);
  fd.append("longitude", currentLatLng.lng);
  fd.append("address", addressField.value || "");
  fd.append("postal_code", postalCodeField.value || "");
  fd.append("city", cityField.value || "");
  fd.append("description", descriptionField.value.trim());

  if (fileInput.files && fileInput.files.length > 0) {
    for (let i = 0; i < fileInput.files.length; i++) {
      fd.append("files", fileInput.files[i]);
    }
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/reports`, {
      method: "POST",
      body: fd
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Erreur API:", txt);
      throw new Error("Erreur API");
    }

    const created = await res.json();
    addReportMarker(created);

    reportForm.reset();
    if (currentMarker) {
      map.removeLayer(currentMarker);
      currentMarker = null;
      currentLatLng = null;
    }
    removePointBtn.disabled = true;
    formError.textContent = "";

    alert("Déclaration enregistrée. Merci pour votre contribution.");
  } catch (err) {
    console.error(err);
    formError.textContent =
      "Erreur lors de l’enregistrement. Merci de réessayer plus tard.";
  }
});

// ================================
// CHARGEMENT RAPPORTS EXISTANTS
// ================================

async function loadReports() {
  reportsLayer.clearLayers();

  let url = `${API_BASE_URL}/api/reports`;
  const period = periodSelect.value;
  if (period && period !== "all") {
    url += `?days=${encodeURIComponent(period)}`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Erreur de chargement des rapports.");
    const data = await res.json();
    data.forEach((r) => addReportMarker(r));
  } catch (err) {
    console.error("Erreur chargement rapports:", err);
  }
}

periodSelect.addEventListener("change", loadReports);

function addReportMarker(report) {
  const lat = parseFloat(report.latitude);
  const lng = parseFloat(report.longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return;

  const marker = L.marker([lat, lng], {
    icon: iconFor(report.type)
  });

  const popup =
    `<strong>${escapeHtml(labelForType(report.type))}</strong><br>` +
    (report.datetime ? `Date/heure : ${escapeHtml(report.datetime)}<br>` : "") +
    (report.address ? `${escapeHtml(report.address)}<br>` : "") +
    (report.city ? `${escapeHtml(report.city)}<br>` : "") +
    (report.description
      ? `<div class="popup-description">${escapeHtml(
          report.description
        )}</div>`
      : "");

  marker.bindPopup(popup);
  marker.options.reportType = report.type;
  reportsLayer.addLayer(marker);

  applyTypeFilters();
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

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ================================
// FILTRE PAR TYPE
// ================================

const typeCheckboxes = document.querySelectorAll(".filter-type");

typeCheckboxes.forEach((cb) => cb.addEventListener("change", applyTypeFilters));

function applyTypeFilters() {
  const enabled = new Set();
  typeCheckboxes.forEach((cb) => {
    if (cb.checked) enabled.add(cb.dataset.type);
  });

  reportsLayer.eachLayer((layer) => {
    const t = layer.options.reportType;
    if (!t || enabled.has(t)) {
      layer.addTo(map);
    } else {
      map.removeLayer(layer);
    }
  });
}

// ================================
// BOUTONS DU HAUT
// ================================

document.getElementById("registerBtn").addEventListener("click", () => {
  alert("La fonctionnalité d’inscription sera disponible prochainement.");
});

document.getElementById("alertsBtn").addEventListener("click", () => {
  alert("Les alertes de proximité seront bientôt disponibles.");
});

// ================================
// LANCEMENT
// ================================

loadReports();


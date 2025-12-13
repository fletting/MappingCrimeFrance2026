// URL de ton API Render
const API_BASE_URL = "https://mappingcrime-api.onrender.com";

// Variables globales (UNE SEULE FOIS)
let map;
let selectedLatLng = null;      // <-- point choisi sur la carte
let currentMarker = null;       // <-- marqueur du point sélectionné

// Initialisation quand la page est chargée
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initForm();
  loadExistingReports();
});

// ------------------------
// 1. Carte
// ------------------------
function initMap() {
  // Centre sur Paris par défaut
  map = L.map("map").setView([48.8566, 2.3522], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Clic sur la carte
  map.on("click", (e) => {
    console.log("Clic sur la carte :", e.latlng);
    // On met à jour LA variable globale (sans la redéclarer)
    selectedLatLng = e.latlng;

    // On met à jour le marqueur
    if (currentMarker) {
      map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([selectedLatLng.lat, selectedLatLng.lng]).addTo(map);
  });
}

// ------------------------
// 2. Formulaire
// ------------------------
function initForm() {
  const form = document.getElementById("declaration-form");
  const submitBtn = document.getElementById("submit-report");

  // Si tu as enveloppé les champs dans un <form id="declaration-form">
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      handleSubmit();
    });
  }

  // Si tu utilises juste un bouton <button id="submit-report">
  if (submitBtn) {
    submitBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleSubmit();
    });
  }
}

async function handleSubmit() {
  console.log("Soumission, selectedLatLng =", selectedLatLng);

  // 1) Vérifier que l'utilisateur a bien cliqué sur la carte
  if (!selectedLatLng) {
    alert("Cliquez d'abord sur la carte pour placer le point.");
    return;
  }

  // 2) Récupérer les valeurs du formulaire
  const type = document.getElementById("type-fait")?.value || "";
  const dateHeure = document.getElementById("date-heure")?.value || "";
  const adresse = document.getElementById("adresse")?.value || "";
  const codePostal = document.getElementById("code-postal")?.value || "";
  const ville = document.getElementById("ville")?.value || "";
  const description = document.getElementById("description")?.value || "";

  if (!type || !dateHeure || !adresse || !ville || !description) {
    alert("Merci de remplir tous les champs obligatoires.");
    return;
  }

  const payload = {
    type,
    date_heure: dateHeure,
    adresse,
    code_postal: codePostal,
    ville,
    description,
    latitude: selectedLatLng.lat,
    longitude: selectedLatLng.lng
  };

  try {
    const resp = await fetch(`${API_BASE_URL}/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      console.error("Erreur API:", resp.status, await resp.text());
      alert("Erreur lors de l'enregistrement. Réessayez plus tard.");
      return;
    }

    alert("Déclaration enregistrée, merci !");

    // On ajoute le point sur la carte (en propre)
    addReportMarker(payload);

    // On réinitialise le formulaire + le point
    resetFormAndMarker();
  } catch (err) {
    console.error(err);
    alert("Impossible de contacter le serveur. Réessayez plus tard.");
  }
}

// ------------------------
// 3. Chargement des déclarations existantes
// ------------------------
async function loadExistingReports() {
  try {
    const resp = await fetch(`${API_BASE_URL}/api/reports`);
    if (!resp.ok) return;

    const data = await resp.json();
    if (!Array.isArray(data)) return;

    data.forEach(addReportMarker);
  } catch (err) {
    console.error("Erreur chargement rapports :", err);
  }
}

function addReportMarker(report) {
  if (!map || !report.latitude || !report.longitude) return;

  const marker = L.marker([report.latitude, report.longitude]).addTo(map);

  const popupContent = `
    <strong>${escapeHtml(report.type || "")}</strong><br>
    ${escapeHtml(report.date_heure || "")}<br>
    ${escapeHtml(report.adresse || "")} ${escapeHtml(report.code_postal || "")} ${escapeHtml(report.ville || "")}<br>
    <em>${escapeHtml(report.description || "")}</em>
  `;
  marker.bindPopup(popupContent);
}

function resetFormAndMarker() {
  const form = document.getElementById("declaration-form");
  if (form) form.reset();

  selectedLatLng = null;

  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
}

// ------------------------
// 4. Petit helper sécurité pour les popups
// ------------------------
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

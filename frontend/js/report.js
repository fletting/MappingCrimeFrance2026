// -----------------------------
// CONFIGURATION GÉNÉRALE
// -----------------------------

// URL de base de l'API FastAPI sur Render
const API_BASE_URL = "https://mappingcrime-api.onrender.com";

// Centre et zoom de départ (France)
const INITIAL_CENTER = [46.8, 2.5];
const INITIAL_ZOOM = 6;

// -----------------------------
// ÉTAT GLOBAL
// -----------------------------

let map;                       // Instance Leaflet
let currentMarker = null;      // Marqueur de la déclaration en cours
let reportsLayer = null;       // LayerGroup pour tous les autres rapports
let iconsByCrimeType = {};     // Dictionnaire "type de fait" -> icône Leaflet

// -----------------------------
// UTILITAIRES
// -----------------------------

/**
 * Affiche un message d'information / erreur pour l'utilisateur.
 * Si un élément #status-message existe, on l'utilise, sinon on fait un alert().
 */
function showMessage(text, type = "info") {
  const box = document.getElementById("status-message");
  if (!box) {
    alert(text);
    return;
  }
  box.textContent = text;
  box.className = ""; // reset classes
  box.classList.add(type === "error" ? "status-error" : "status-info");
}

/**
 * Convertit un texte "jj/mm/aaaa hh:mm" en ISO (UTC) pour l'API.
 * Si pas d'heure fournie, on met 12:00.
 */
function parseFrenchDateTimeToISO(value) {
  if (!value || !value.trim()) {
    return null;
  }

  const parts = value.trim().split(" ");
  const datePart = parts[0];
  const timePart = parts[1] || "12:00";

  const [day, month, year] = datePart.split("/").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  if (!day || !month || !year) {
    return null;
  }

  const dt = new Date(Date.UTC(year, month - 1, day, hour || 0, minute || 0));
  return dt.toISOString();
}

/**
 * Renvoie l'icône Leaflet correspondant à un type de fait.
 * Si inconnu, utilise l'icône "autre".
 */
function getIconForCrimeType(crimeType) {
  return iconsByCrimeType[crimeType] || iconsByCrimeType["Autre"] || null;
}

/**
 * Formatte une date ISO en format "dd/mm/yyyy HH:MM".
 */
function formatISOToFrench(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

// -----------------------------
// INITIALISATION DE LA CARTE
// -----------------------------

function initMap() {
  map = L.map("map").setView(INITIAL_CENTER, INITIAL_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
  }).addTo(map);

  // Layer pour les rapports
  reportsLayer = L.layerGroup().addTo(map);

  // Clic sur la carte -> création / déplacement du marqueur de déclaration
  map.on("click", onMapClick);

  // Ajout de la légende (pictogrammes)
  addLegendControl();
}

// -----------------------------
// ICÔNES PAR TYPE DE FAIT
// -----------------------------

function initCrimeIcons() {
  const baseIconOptions = {
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  };

  function makeIcon(fileName) {
    return L.icon({
      ...baseIconOptions,
      iconUrl: `img/${fileName}`
    });
  }

  // Adapter les clés EXACTEMENT aux valeurs du <select> "Type de fait"
  iconsByCrimeType = {
    "Vol": makeIcon("vol.png"),
    "Cambriolage": makeIcon("cambriolage.png"),
    "Agression": makeIcon("agression.png"),
    "Agression sexuelle": makeIcon("Agression_sexuelle.png"),
    "Viol": makeIcon("viol.png"),
    "Meurtre": makeIcon("meurtre.png"),
    "Carjacking": makeIcon("carjacking.png"),
    "Trafic de stupéfiants": makeIcon("trafic_stupefiants.png"),
    "Dégradations": makeIcon("degradations.png"),
    "Autre": makeIcon("autre.png")
  };
}

// -----------------------------
// LÉGENDE LEAFLET
// -----------------------------

function addLegendControl() {
  const legend = L.control({ position: "bottomright" });

  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "crime-legend");
    div.innerHTML = "<strong>Types de faits</strong><br>";

    for (const [label, icon] of Object.entries(iconsByCrimeType)) {
      const url = icon && icon.options.iconUrl ? icon.options.iconUrl : "";
      if (!url) continue;
      div.innerHTML += `
        <div class="legend-item">
          <img src="${url}" alt="${label}" width="20" height="20" />
          <span>${label}</span>
        </div>
      `;
    }

    return div;
  };

  legend.addTo(map);
}

// -----------------------------
// GESTION DU CLIC SUR LA CARTE
// -----------------------------

function onMapClick(e) {
  const { lat, lng } = e.latlng;

  // Si un marqueur existe déjà, on le déplace
  if (currentMarker) {
    currentMarker.setLatLng([lat, lng]);
  } else {
    currentMarker = L.marker([lat, lng]).addTo(map);
  }

  // Mise à jour de l'adresse via reverse geocoding
  reverseGeocode(lat, lng);
}

/**
 * Reverse geocoding avec Nominatim pour préremplir adresse / CP / ville.
 */
function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=fr`;

  fetch(url)
    .then((r) => r.json())
    .then((data) => {
      const addressInput = document.getElementById("address");
      const postalInput = document.getElementById("postal_code");
      const cityInput = document.getElementById("city");

      if (addressInput && data.display_name) {
        addressInput.value = data.display_name;
      }

      if (data.address) {
        if (postalInput && data.address.postcode) {
          postalInput.value = data.address.postcode;
        }
        if (cityInput && (data.address.city || data.address.town || data.address.village)) {
          cityInput.value = data.address.city || data.address.town || data.address.village;
        }
      }
    })
    .catch((err) => {
      console.error("Erreur reverse geocoding:", err);
    });
}

// -----------------------------
// ENVOI D'UNE DÉCLARATION
// -----------------------------

function onReportFormSubmit(event) {
  event.preventDefault();

  const selectCrimeType = document.getElementById("crime_type");
  const inputDatetime = document.getElementById("datetime");
  const inputAddress = document.getElementById("address");
  const inputPostalCode = document.getElementById("postal_code");
  const inputCity = document.getElementById("city");
  const inputDescription = document.getElementById("description");
  const inputMedia = document.getElementById("media");

  if (!selectCrimeType || !inputDatetime || !inputAddress || !inputPostalCode || !inputCity || !inputDescription) {
    showMessage("Erreur interne : certains champs du formulaire sont introuvables.", "error");
    return;
  }

  if (!currentMarker) {
    showMessage("Veuillez d'abord cliquer sur la carte pour positionner le point.", "error");
    return;
  }

  const crimeType = selectCrimeType.value;
  const datetimeISO = parseFrenchDateTimeToISO(inputDatetime.value);
  const address = inputAddress.value.trim();
  const postalCode = inputPostalCode.value.trim();
  const city = inputCity.value.trim();
  const description = inputDescription.value.trim();

  if (!crimeType || !address || !postalCode || !city || !datetimeISO) {
    showMessage("Merci de renseigner le type de fait, la date, l'adresse, le code postal et la ville.", "error");
    return;
  }

  const { lat, lng } = currentMarker.getLatLng();

  const payload = {
    crime_type: crimeType,
    datetime: datetimeISO,
    address: address,
    postal_code: postalCode,
    city: city,
    description: description,
    latitude: lat,
    longitude: lng
  };

  showMessage("Envoi de votre déclaration en cours...", "info");

  fetch(`${API_BASE_URL}/api/reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })
    .then(async (response) => {
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Erreur API (${response.status})`);
      }
      return response.json();
    })
    .then(async (createdReport) => {
      showMessage("Déclaration enregistrée avec succès !", "info");

      // Upload éventuel des fichiers (optionnel)
      if (inputMedia && inputMedia.files && inputMedia.files.length > 0 && createdReport && createdReport.id) {
        const formData = new FormData();
        for (const file of inputMedia.files) {
          formData.append("files", file);
        }

        try {
          const uploadResponse = await fetch(
            `${API_BASE_URL}/api/reports/${createdReport.id}/files`,
            {
              method: "POST",
              body: formData
            }
          );

          if (!uploadResponse.ok) {
            console.warn("Erreur lors de l'upload des fichiers:", await uploadResponse.text());
          }
        } catch (uploadErr) {
          console.warn("Exception upload fichiers:", uploadErr);
        }
      }

      // Réinitialisation du formulaire et rechargement des rapports
      resetReportForm();
      loadReports();
    })
    .catch((err) => {
      console.error("Erreur lors de l'envoi du rapport:", err);
      showMessage("Erreur lors de l'enregistrement. Réessayez plus tard.", "error");
    });
}

/**
 * Réinitialise le formulaire + marqueur de déclaration.
 */
function resetReportForm() {
  const form = document.getElementById("report-form");
  if (form) {
    form.reset();
  }

  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
}

// -----------------------------
// SUPPRESSION DU POINT COURANT
// -----------------------------

function onDeletePointClick() {
  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
    showMessage("Point supprimé. Cliquez à nouveau sur la carte pour en définir un.", "info");
  }
}

// -----------------------------
// CHARGEMENT DES RAPPORTS EXISTANTS
// -----------------------------

function loadReports() {
  if (!reportsLayer) return;

  reportsLayer.clearLayers();

  fetch(`${API_BASE_URL}/api/reports`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Erreur de chargement des rapports (${response.status})`);
      }
      return response.json();
    })
    .then((reports) => {
      if (!Array.isArray(reports)) return;

      reports.forEach((r) => {
        if (typeof r.latitude !== "number" || typeof r.longitude !== "number") return;

        const icon = getIconForCrimeType(r.crime_type);

        const marker = L.marker([r.latitude, r.longitude], {
          icon: icon || undefined
        });

        const popupHtml = `
          <strong>${r.crime_type || "Fait signalé"}</strong><br/>
          ${r.address || ""}<br/>
          ${r.postal_code || ""} ${r.city || ""}<br/>
          <em>${formatISOToFrench(r.datetime)}</em><br/><br/>
          ${r.description ? r.description.replace(/\n/g, "<br/>") : ""}
        `;

        marker.bindPopup(popupHtml);
        marker.addTo(reportsLayer);
      });
    })
    .catch((err) => {
      console.error("Erreur loadReports:", err);
    });
}

// -----------------------------
// BARRE DE RECHERCHE (Nominatim)
// -----------------------------

function initSearchBar() {
  const input = document.getElementById("search-input");
  const button = document.getElementById("search-button");

  if (!input || !button) return;

  function doSearch() {
    const query = input.value.trim();
    if (!query) return;

    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
      query
    )}&accept-language=fr`;

    fetch(url)
      .then((r) => r.json())
      .then((results) => {
        if (!Array.isArray(results) || results.length === 0) {
          showMessage("Aucun résultat trouvé pour cette recherche.", "info");
          return;
        }

        const best = results[0];
        const lat = parseFloat(best.lat);
        const lon = parseFloat(best.lon);

        if (isNaN(lat) || isNaN(lon)) return;

        map.setView([lat, lon], 16);
      })
      .catch((err) => {
        console.error("Erreur recherche adresse:", err);
      });
  }

  button.addEventListener("click", (e) => {
    e.preventDefault();
    doSearch();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doSearch();
    }
  });
}

// -----------------------------
// INITIALISATION GLOBALE
// -----------------------------

document.addEventListener("DOMContentLoaded", () => {
  try {
    initCrimeIcons();
    initMap();
    initSearchBar();
    loadReports();

    const form = document.getElementById("report-form");
    if (form) {
      form.addEventListener("submit", onReportFormSubmit);
    }

    const deleteBtn = document.getElementById("delete-point-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", onDeletePointClick);
    }

    showMessage("Cliquez sur la carte pour placer le point, remplissez le formulaire puis envoyez votre déclaration.");
  } catch (err) {
    console.error("Erreur d'initialisation report.js:", err);
    showMessage("Erreur d'initialisation de la carte. Réessayez plus tard.", "error");
  }
});

// ==============================
//  CONFIG GÉNÉRALE
// ==============================

const API_BASE = "https://mappingcrime-api.onrender.com";


// Dernier point VALIDÉ (2e clic) => utilisé pour la déclaration + alertes
let lastClickedLat = null;
let lastClickedLng = null;

// Couche Leaflet pour afficher tous les crimes
let reportMarkersLayer = null;

// Marqueur temporaire pour la sélection en cours
let currentClickMarker = null;

// Étape de clic : 0 = aucun, 1 = premier clic posé
let clickStage = 0;

// ==============================
//  TABLE DES TYPES + FICHIERS PNG
// ==============================

const LEGEND_ITEMS = [
  { type: "Vol", file: "vol.png" },
  { type: "Cambriolage", file: "cambriolage.png" },
  { type: "Agression", file: "agression.png" },
  { type: "Agression sexuelle", file: "agression_sexuelle.png" },
  { type: "Viol", file: "viol.png" },
  { type: "Meurtre", file: "meurtre.png" },
  { type: "Carjacking", file: "carjacking.png" },
  { type: "Trafic de stupéfiants", file: "trafic_stupefiants.png" },
  { type: "Dégradations", file: "degradations.png" },
  { type: "Autre", file: "autre.png" },
];

// ==============================
//  ICÔNES PNG PAR TYPE DE CRIME
// ==============================

function getCrimeIcon(crimeType) {
  const item = LEGEND_ITEMS.find((i) => i.type === crimeType);
  const fileName = item ? item.file : "default.png";

  return L.icon({
    iconUrl: "img/" + fileName,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

// ==============================
//  PANNEAU "DÉCLARATION CITOYENNE"
// ==============================

const reportPanel = document.getElementById("report-panel");
const btnOpenReport = document.getElementById("btn-open-report");
const btnCloseReport = document.getElementById("btn-close-report");

if (reportPanel) {
  reportPanel.style.display = "flex";
}

if (btnOpenReport) {
  btnOpenReport.addEventListener("click", function () {
    reportPanel.style.display = "flex";
  });
}

if (btnCloseReport) {
  btnCloseReport.addEventListener("click", function () {
    reportPanel.style.display = "none";
  });
}

// ==============================
//  CARTE LEAFLET
// ==============================

const map = L.map("map").setView([46.8, 2.5], 6);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

reportMarkersLayer = L.layerGroup().addTo(map);

// ==============================
//  RECHERCHE VILLE / ADRESSE
// ==============================

const searchInput = document.querySelector(".search-bar input");
const searchButton = document.querySelector(".search-bar button");

// petit marqueur pour les résultats de recherche
let searchMarker = null;

async function searchLocation() {
  if (!searchInput) return;

  const query = searchInput.value.trim();
  if (!query) {
    alert("Merci de saisir une ville ou une adresse.");
    return;
  }

  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=fr&q=" +
    encodeURIComponent(query);

  try {
    const res = await fetch(url, {
      headers: { "Accept-Language": "fr" },
    });
    if (!res.ok) throw new Error("Erreur Nominatim");

    const data = await res.json();
    if (!data || data.length === 0) {
      alert("Aucun résultat trouvé pour cette recherche.");
      return;
    }

    const place = data[0];
    const lat = parseFloat(place.lat);
    const lon = parseFloat(place.lon);

    // centre la carte sur le résultat
    map.setView([lat, lon], 13);

    // on ajoute / déplace un petit marqueur de recherche
    if (searchMarker) {
      searchMarker.setLatLng([lat, lon]);
    } else {
      searchMarker = L.marker([lat, lon]).addTo(map);
    }
  } catch (err) {
    console.error("Erreur recherche adresse :", err);
    alert("Erreur lors de la recherche. Réessayez plus tard.");
  }
}

// clic sur le bouton ALLER
if (searchButton) {
  searchButton.addEventListener("click", function () {
    searchLocation();
  });
}

// appui sur Entrée dans le champ texte
if (searchInput) {
  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      searchLocation();
    }
  });
}


// Limiter la carte à la France métropolitaine
const franceBounds = L.latLngBounds(
  [41.0, -5.5],  // sud-ouest (approx. Pyrénées / Espagne)
  [51.7, 9.8]    // nord-est (approx. Nord / Allemagne)
);

// on centre/zoom sur ces limites
map.fitBounds(franceBounds);

// on empêche de sortir de ces limites
map.setMaxBounds(franceBounds);

// petite sécurité si on essaie de “tirer” trop loin
map.on("drag", function () {
  map.panInsideBounds(franceBounds, { animate: false });
});


// Clics en 2 temps pour valider l'emplacement
map.on("click", async function (e) {
  const lat = e.latlng.lat;
  const lng = e.latlng.lng;

  // 1er clic : pose un point provisoire, mais ne valide rien
  if (clickStage === 0) {
    if (currentClickMarker) {
      currentClickMarker.setLatLng(e.latlng);
    } else {
      currentClickMarker = L.marker(e.latlng).addTo(map);
    }

    // on efface les valeurs validées existantes
    lastClickedLat = null;
    lastClickedLng = null;

    const latInput = document.getElementById("lat");
    const lngInput = document.getElementById("lng");
    if (latInput) latInput.value = "";
    if (lngInput) lngInput.value = "";

    const addressInput = document.getElementById("address");
    const postcodeInput = document.getElementById("postcode");
    const cityInput = document.getElementById("city");
    if (addressInput) addressInput.value = "";
    if (postcodeInput) postcodeInput.value = "";
    if (cityInput) cityInput.value = "";

    clickStage = 1;
    alert("Cliquez une deuxième fois pour valider l'emplacement.");
    return;
  }

  // 2e clic : on valide le point, on remplit lat/lng et on fait le reverse geocoding
  if (currentClickMarker) {
    currentClickMarker.setLatLng(e.latlng);
  } else {
    currentClickMarker = L.marker(e.latlng).addTo(map);
  }

  lastClickedLat = lat;
  lastClickedLng = lng;

  const latInput = document.getElementById("lat");
  const lngInput = document.getElementById("lng");
  if (latInput) latInput.value = lat;
  if (lngInput) lngInput.value = lng;

  clickStage = 0; // retour à l'état initial

  // reverse geocoding après validation
  const url =
    "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" +
    lat +
    "&lon=" +
    lng +
    "&addressdetails=1";

  try {
    const res = await fetch(url, {
      headers: { "Accept-Language": "fr" },
    });
    if (!res.ok) throw new Error("Réponse invalide de Nominatim");

    const data = await res.json();
    const addr = data.address || {};

    const road = addr.road || "";
    const houseNumber = addr.house_number || "";
    const postcode = addr.postcode || "";
    const city =
      addr.city || addr.town || addr.village || addr.hamlet || "";

    const fullAddress = (houseNumber + " " + road).trim();

    const addressInput = document.getElementById("address");
    const postcodeInput = document.getElementById("postcode");
    const cityInput = document.getElementById("city");

    if (addressInput) addressInput.value = fullAddress;
    if (postcodeInput) postcodeInput.value = postcode;
    if (cityInput) cityInput.value = city;
  } catch (err) {
    console.error("Erreur reverse geocoding :", err);
  }
});

// ==============================
//  BOUTON "SUPPRIMER LE POINT"
// ==============================

const clearPointBtn = document.getElementById("clear-point-btn");

if (clearPointBtn) {
  clearPointBtn.addEventListener("click", function () {
    if (currentClickMarker) {
      map.removeLayer(currentClickMarker);
      currentClickMarker = null;
    }

    lastClickedLat = null;
    lastClickedLng = null;
    clickStage = 0;

    const latInput = document.getElementById("lat");
    const lngInput = document.getElementById("lng");
    const addressInput = document.getElementById("address");
    const postcodeInput = document.getElementById("postcode");
    const cityInput = document.getElementById("city");

    if (latInput) latInput.value = "";
    if (lngInput) lngInput.value = "";
    if (addressInput) addressInput.value = "";
    if (postcodeInput) postcodeInput.value = "";
    if (cityInput) cityInput.value = "";
  });
}

// ==============================
//  LÉGENDE LEAFLET (PNG)
// ==============================

const legendControl = L.control({ position: "bottomright" });

legendControl.onAdd = function () {
  const div = L.DomUtil.create("div", "legend");

  const title = document.createElement("div");
  title.className = "legend-title";
  title.textContent = "Types de faits";
  div.appendChild(title);

  LEGEND_ITEMS.forEach((item) => {
    const row = document.createElement("div");
    row.className = "legend-item";
    row.innerHTML =
      '<img src="img/' +
      item.file +
      '" class="legend-icon" alt="' +
      item.type +
      '"/> <span>' +
      item.type +
      "</span>";
    div.appendChild(row);
  });

  L.DomEvent.disableClickPropagation(div);
  return div;
};

legendControl.addTo(map);

// ==============================
//  CHARGER LES CRIMES EXISTANTS
// ==============================

async function loadReports() {
  try {
    const res = await fetch(API_BASE + "/api/reports");
    if (!res.ok) throw new Error("Erreur lors du chargement des reports");

    const reports = await res.json();

    reportMarkersLayer.clearLayers();

    reports.forEach(function (r) {
      if (
        typeof r.latitude !== "number" ||
        typeof r.longitude !== "number"
      ) {
        return;
      }

      const icon = getCrimeIcon(r.crime_type);
      const m = L.marker([r.latitude, r.longitude], { icon: icon });

      let dateText = "";
      try {
        const d = new Date(r.date_time);
        if (!isNaN(d.getTime())) {
          dateText = d.toLocaleString("fr-FR", {
            dateStyle: "short",
            timeStyle: "short",
          });
        }
      } catch (e) {}

      let popupHtml =
        "<strong>" +
        (r.crime_type || "Fait déclaré") +
        "</strong><br/>" +
        (r.address || "") +
        "<br/>" +
        (r.postcode || "") +
        " " +
        (r.city || "");

      if (dateText) {
        popupHtml += "<br/><small>" + dateText + "</small>";
      }

      if (r.description) {
        popupHtml +=
          "<br/><small>" +
          r.description.replace(/</g, "&lt;").replace(/>/g, "&gt;") +
          "</small>";
      }

      m.bindPopup(popupHtml);
      m.addTo(reportMarkersLayer);
    });
  } catch (err) {
    console.error("Erreur loadReports :", err);
  }
}

loadReports();

// ==============================
//  FORMULAIRE DE DÉCLARATION
// ==============================

const form = document.getElementById("crime-form");
const resultDiv = document.getElementById("result");

if (form) {
  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const crimeType = document.getElementById("crime_type")?.value || "";
    const dateTime = document.getElementById("date_time")?.value || "";
    const address = document.getElementById("address")?.value || "";
    const postcode = document.getElementById("postcode")?.value || "";
    const city = document.getElementById("city")?.value || "";
    const description =
      document.getElementById("description")?.value || "";

    const latVal = document.getElementById("lat")?.value || "";
    const lngVal = document.getElementById("lng")?.value || "";
    const lat = parseFloat(latVal);
    const lng = parseFloat(lngVal);

    if (!crimeType || !dateTime || !address || !postcode || !city) {
      alert("Merci de remplir tous les champs obligatoires.");
      return;
    }

    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      alert(
        "Merci de valider un point sur la carte (2 clics) avant d'envoyer la déclaration."
      );
      return;
    }

    const mediaInput = document.getElementById("media");

    const fd = new FormData();
    fd.append("crime_type", crimeType);
    fd.append("description", description);
    fd.append("date_time", dateTime);
    fd.append("address", address);
    fd.append("postcode", postcode);
    fd.append("city", city);
    fd.append("latitude", String(lat));
    fd.append("longitude", String(lng));

    if (mediaInput && mediaInput.files) {
      for (let i = 0; i < mediaInput.files.length; i++) {
        fd.append("files", mediaInput.files[i]);
      }
    }

    try {
      const res = await fetch(API_BASE + "/api/reports-with-media", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) throw new Error("Erreur lors de l'envoi");

      await res.json();

      if (resultDiv) {
        resultDiv.innerHTML =
          "<p class='success'>Déclaration enregistrée, merci pour votre contribution.</p>";
      }

      form.reset();

      if (currentClickMarker) {
        map.removeLayer(currentClickMarker);
        currentClickMarker = null;
      }
      lastClickedLat = null;
      lastClickedLng = null;
      clickStage = 0;

      loadReports();
    } catch (err) {
      console.error(err);
      if (resultDiv) {
        resultDiv.innerHTML =
          "<p class='error'>Erreur lors de l'enregistrement. Réessayez plus tard.</p>";
      }
    }
  });
}

// ==============================
//  MODALE "RECEVOIR DES ALERTES"
// ==============================

const alertModal = document.getElementById("alert-modal");
const btnAlerts = document.querySelector(".btn-alerts");
const alertForm = document.getElementById("alert-form");
const alertCancel = document.getElementById("alert-cancel");
const alertResult = document.getElementById("alert-result");

if (btnAlerts && alertModal) {
  btnAlerts.addEventListener("click", function () {
    if (lastClickedLat === null || lastClickedLng === null) {
      alert(
        "Validez d'abord un point sur la carte (2 clics) pour définir votre zone d'alerte."
      );
      return;
    }
    if (alertResult) alertResult.innerHTML = "";
    alertModal.style.display = "flex";
  });
}

if (alertCancel && alertModal) {
  alertCancel.addEventListener("click", function () {
    alertModal.style.display = "none";
  });
}

if (alertForm) {
  alertForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    if (lastClickedLat === null || lastClickedLng === null) {
      alert(
        "Validez d'abord un point sur la carte (2 clics) pour définir votre zone d'alerte."
      );
      return;
    }

    const email = document.getElementById("alert-email")?.value || "";
    const radiusStr =
      document.getElementById("alert-radius")?.value || "5";
    const radius = parseFloat(radiusStr);

    const crimeTypeCheckboxes = document.querySelectorAll(
      ".alert-crime-types input[type='checkbox']:checked"
    );
    const crimeTypes = Array.from(crimeTypeCheckboxes).map(function (cb) {
      return cb.value;
    });

    if (!email) {
      alert("Merci de renseigner votre email.");
      return;
    }
    if (!radius || isNaN(radius)) {
      alert("Merci de renseigner un rayon valide.");
      return;
    }
    if (crimeTypes.length === 0) {
      alert("Sélectionnez au moins un type de fait.");
      return;
    }

    const payload = {
      email: email,
      center_lat: lastClickedLat,
      center_lng: lastClickedLng,
      radius_km: radius,
      crime_types: crimeTypes,
    };

    try {
      const res = await fetch(API_BASE + "/api/alerts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Erreur lors de l'abonnement");

      await res.json();

      if (alertResult) {
        alertResult.innerHTML =
          "<span class='success'>Abonnement enregistré. Vous recevrez des alertes pour cette zone.</span>";
      }

      const circle = L.circle([lastClickedLat, lastClickedLng], {
        radius: radius * 1000,
        color: "#ff4136",
        weight: 1,
        fillColor: "#ff4136",
        fillOpacity: 0.15,
      });
      circle.addTo(map);

      alertForm.reset();
    } catch (err) {
      console.error(err);
      if (alertResult) {
        alertResult.innerHTML =
          "<span class='error'>Erreur lors de l'abonnement. Réessayez plus tard.</span>";
      }
    }
  });
}

// ==============================
//  MODALE INSCRIPTION
// ==============================

const registerModal = document.getElementById("register-modal");
const btnRegister = document.querySelector(".btn-register");
const registerForm = document.getElementById("register-form");
const registerCancel = document.getElementById("register-cancel");
const registerResult = document.getElementById("register-result");

if (btnRegister && registerModal) {
  btnRegister.addEventListener("click", function () {
    if (registerResult) registerResult.innerHTML = "";
    registerModal.style.display = "flex";
  });
}

if (registerCancel && registerModal) {
  registerCancel.addEventListener("click", function () {
    registerModal.style.display = "none";
  });
}

if (registerForm) {
  registerForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const firstName = document.getElementById("reg-first-name")?.value || "";
    const lastName = document.getElementById("reg-last-name")?.value || "";
    const ageStr = document.getElementById("reg-age")?.value || "";
    const email = document.getElementById("reg-email")?.value || "";
    const password =
      document.getElementById("reg-password")?.value || "";
    const address =
      document.getElementById("reg-address")?.value || "";
    const postcode =
      document.getElementById("reg-postcode")?.value || "";
    const city = document.getElementById("reg-city")?.value || "";

    const age = ageStr ? parseInt(ageStr, 10) : null;

    if (!firstName || !lastName || !email || !password) {
      alert("Merci de remplir au minimum prénom, nom, email et mot de passe.");
      return;
    }

    const payload = {
      first_name: firstName,
      last_name: lastName,
      age: age,
      email: email,
      password: password,
      address: address,
      postcode: postcode,
      city: city,
    };

    try {
      const res = await fetch(API_BASE + "/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch (_) {}

      if (!res.ok) {
        const msg =
          (data && data.detail) ||
          "Erreur lors de l'inscription. Réessayez plus tard.";
        if (registerResult) {
          registerResult.innerHTML =
            "<span class='error'>" + msg + "</span>";
        }
        return;
      }

      if (registerResult) {
        registerResult.innerHTML =
          "<span class='success'>Compte créé avec succès.</span>";
      }

      registerForm.reset();
    } catch (err) {
      console.error(err);
      if (registerResult) {
        registerResult.innerHTML =
          "<span class='error'>Erreur lors de l'inscription. Réessayez plus tard.</span>";
      }
    }
  });
}

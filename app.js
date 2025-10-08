pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist/build/pdf.worker.min.js';
pdfjsLib.disableWorker = true;

// Leaflet-Karte
const map = L.map('map').setView([51.1657, 10.4515], 6);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19,
  attribution: '&copy; Esri, Earthstar Geographics'
}).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  opacity: 0.5,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let markers = [];
let selectedFile = null;

// Datei auswählen
document.getElementById('pdfInput').addEventListener('change', (e) => {
  selectedFile = e.target.files[0];
});

// OK-Button klick → PDF verarbeiten
document.getElementById('uploadBtn').addEventListener('click', async () => {
  if (!selectedFile) {
    alert("Bitte zuerst eine PDF auswählen!");
    return;
  }

  // alte Marker löschen
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  try {
    const arrayBuffer = await selectedFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(i => i.str).join(' ') + ' ';
    }

    if (text.trim().length < 20) {
      alert("PDF enthält zu wenig Text. Ist es ein digitaler Auftrag?");
      return;
    }

    const addressMatch = text.match(/Lieferadresse[:\s]*([A-Za-zÄÖÜäöüß0-9\s,.-]+)/);
    const zrdMatch = text.match(/ZRD\d+/i);

    if (!addressMatch) {
      alert("Keine Lieferadresse gefunden.");
      return;
    }

    const address = addressMatch[1].trim();
    const zrd = zrdMatch ? zrdMatch[0] : "Keine ZRD gefunden";

    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Deutschland')}`);
    const data = await response.json();

    if (!data.length) {
      alert("Adresse konnte nicht gefunden werden.");
      return;
    }

    const { lat, lon, display_name } = data[0];

    const markerIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34]
    });

    const marker = L.marker([lat, lon], { icon: markerIcon }).addTo(map);
    markers.push(marker);

    const popupDiv = document.createElement('div');
    popupDiv.innerHTML = `
      <b>Lieferadresse:</b><br>${display_name}<br><br>
      <b>${zrd}</b><br><br>
      <label>Auftragsnummer:</label><br>
      <input id="auftrag-${lat}" type="text" placeholder="z. B. A12345"><br><br>
      <label>Ticketnummer:</label><br>
      <input id="ticket-${lat}" type="text" placeholder="z. B. T98765"><br><br>
      <label>Grund der Meldung:</label><br>
      <textarea id="grund-${lat}" placeholder="z. B. Wartung, Reparatur..."></textarea><br><br>
      <label>Priorität:</label><br>
      <select id="prio-${lat}">
        <option value="green">Grün – nicht dringend</option>
        <option value="orange">Orange – wichtig</option>
        <option value="red">Rot – sehr dringend</option>
      </select><br><br>
    `;

    const okBtnMarker = document.createElement('button');
    okBtnMarker.textContent = "OK";
    okBtnMarker.onclick = () => {
      const prio = document.getElementById(`prio-${lat}`).value;
      const auftrag = document.getElementById(`auftrag-${lat}`).value;
      const ticket = document.getElementById(`ticket-${lat}`).value;
      const grund = document.getElementById(`grund-${lat}`).value;

      const newIcon = L.icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${prio}.png`,
        shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34]
      });
      marker.setIcon(newIcon);

      alert(`Auftrag gespeichert!\nZRD: ${zrd}\nAuftragsnummer: ${auftrag}\nTicketnummer: ${ticket}\nGrund: ${grund}\nPriorität: ${prio}`);
      marker.closePopup();
    };

    popupDiv.appendChild(okBtnMarker);
    marker.bindPopup(popupDiv).openPopup();
    map.setView([lat, lon], 12);

  } catch (err) {
    console.error("PDF-Verarbeitungsfehler:", err);
    alert("Fehler beim Verarbeiten der PDF. Safari blockiert möglicherweise PDF.js oder Datei ungültig.");
  }
});

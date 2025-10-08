// Prüfen, ob PDF.js vorhanden ist
if (typeof pdfjsLib === 'undefined') {
  alert("PDF.js konnte nicht geladen werden. Bitte Internetverbindung prüfen.");
}

// Safari iPad Fix – Worker deaktivieren
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist/build/pdf.worker.min.js';
pdfjsLib.disableWorker = true;

// Leaflet-Karte (Deutschland)
const map = L.map('map').setView([51.1657, 10.4515], 6);

// Satellitenkarte mit Beschriftung
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19,
  attribution: '&copy; Esri, Earthstar Geographics'
}).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  opacity: 0.5,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Marker-Speicher
let markers = [];

// Datei-Upload
document.getElementById('pdfInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) {
    alert("Bitte eine PDF auswählen!");
    return;
  }

  // alte Marker löschen
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(i => i.str).join(' ') + ' ';
    }

    if (text.trim().length < 20) {
      alert("PDF konnte gelesen werden, enthält aber kaum Text. Ist es sicher ein digitaler Auftrag?");
      return;
    }

    // Lieferadresse + ZRD extrahieren
    const addressMatch = text.match(/Lieferadresse[:\s]*([A-Za-zÄÖÜäöüß0-9\s,.-]+)/);
    const zrdMatch = text.match(/ZRD\s*\d+/i);

    if (!addressMatch) {
      alert("Keine Lieferadresse gefunden.");
      console.log("Textauszug:", text.slice(0, 500));
      return;
    }

    const address = addressMatch[1].trim();
    const zrd = zrdMatch ? zrdMatch[0] : "Keine ZRD gefunden";

    // Adresse in Koordinaten umwandeln
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Deutschland')}`);
    const data = await response.json();

    if (!data.length) {
      alert("Adresse konnte nicht gefunden werden.");
      return;
    }

    const { lat, lon, display_name } = data[0];

    // Marker erstellen (Standard grün)
    const markerIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34]
    });

    const marker = L.marker([lat, lon], { icon: markerIcon }).addTo(map);
    markers.push(marker);

    // Popup mit Eingabefeldern
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

    const okButton = document.createElement('button');
    okButton.textContent = "OK";
    okButton.onclick = () => {
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

      alert(`Auftrag gespeichert!\n\nZRD: ${zrd}\nAdresse: ${address}\nAuftragsnummer: ${auftrag}\nTicketnummer: ${ticket}\nGrund: ${grund}\nPriorität: ${prio}`);
      marker.closePopup();
    };

    popupDiv.appendChild(okButton);
    marker.bindPopup(popupDiv).openPopup();
    map.setView([lat, lon], 12);
  } catch (err) {
    console.error("PDF-Verarbeitungsfehler:", err);
    alert("Fehler beim Verarbeiten der PDF. Safari blockiert möglicherweise PDF.js. Bitte Chrome oder PC probieren.");
  }
});

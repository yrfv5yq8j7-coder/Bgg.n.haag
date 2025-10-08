// PDF.js Worker definieren
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist/build/pdf.worker.min.js';

// Karte initialisieren (Deutschland-Zentriert)
const map = L.map('map').setView([51.1657, 10.4515], 6);

// Satelliten-Karte (Esri)
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, Earthstar Geographics'
}).addTo(map);

// Beschriftung (Städte, Länder, Straßen) halbtransparent drüberlegen
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  opacity: 0.5,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Array für Marker speichern
let markers = [];

// Event: PDF hochladen
document.getElementById('pdfInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) {
    alert("Bitte eine PDF-Datei auswählen!");
    return;
  }

  // Alte Marker löschen
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  map.setView([51.1657, 10.4515], 6);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(i => i.str).join(' ') + ' ';
    }

    // Lieferadresse extrahieren
    const addressMatch = text.match(/Lieferadresse[:\s]*([A-Za-zÄÖÜäöüß0-9\s,.-]+)/);
    const zrdMatch = text.match(/ZRD\s*\d+/i);

    if (!addressMatch) {
      alert("Keine Lieferadresse in der PDF gefunden!");
      return;
    }

    const address = addressMatch[1].trim();
    const zrd = zrdMatch ? zrdMatch[0] : "Keine ZRD gefunden";

    // Adresse in Koordinaten umwandeln (Geokodierung)
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Deutschland')}`);
    const data = await response.json();

    if (!data.length) {
      alert("Adresse konnte nicht gefunden werden!");
      return;
    }

    const { lat, lon, display_name } = data[0];

    // Standardfarbe (grün = niedrigste Priorität)
    let markerColor = "green";
    const markerIcon = L.icon({
      iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${markerColor}.png`,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png'
    });

    const marker = L.marker([lat, lon], { icon: markerIcon }).addTo(map);
    markers.push(marker);

    // Popup-Inhalt erstellen
    const popupDiv = document.createElement('div');
    popupDiv.innerHTML = `
      <b>Lieferadresse:</b><br>${display_name}<br><br>
      <b>ZRD:</b> ${zrd}<br><br>
      <label>Auftragsnummer:</label><br>
      <input type="text" id="auftrag-${lat}" placeholder="z. B. A12345"><br><br>
      <label>Ticketnummer:</label><br>
      <input type="text" id="ticket-${lat}" placeholder="z. B. T98765"><br><br>
      <label>Grund der Meldung:</label><br>
      <textarea id="grund-${lat}" placeholder="z. B. Wartung, Reparatur..."></textarea><br><br>
      <label>Priorität:</label><br>
      <select id="prio-${lat}">
        <option value="green">Grün – noch nicht dringend</option>
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

      // Markerfarbe anpassen
      const newIcon = L.icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${prio}.png`,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png'
      });
      marker.setIcon(newIcon);

      alert(`Auftrag gespeichert!\nZRD: ${zrd}\nAuftragsnummer: ${auftrag}\nTicketnummer: ${ticket}\nPriorität: ${prio}\nGrund: ${grund}`);
      marker.closePopup();
    };

    popupDiv.appendChild(okButton);
    marker.bindPopup(popupDiv).openPopup();

    map.setView([lat, lon], 12);
  } catch (error) {
    console.error(error);
    alert("Fehler beim Verarbeiten der PDF.");
  }
});

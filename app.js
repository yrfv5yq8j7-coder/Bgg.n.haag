document.addEventListener("DOMContentLoaded", () => {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist/build/pdf.worker.min.js';
  pdfjsLib.disableWorker = true;

  const map = L.map('map').setView([51.1657, 10.4515], 6);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: '&copy; Esri, Earthstar Geographics'
  }).addTo(map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    opacity: 0.6,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  let selectedFile = null;

  document.getElementById('pdfInput').addEventListener('change', (e) => {
    selectedFile = e.target.files[0];
  });

  document.getElementById('uploadBtn').addEventListener('click', async () => {
    if (!selectedFile) {
      alert("Bitte zuerst eine PDF auswählen!");
      return;
    }

    try {
      const buffer = await selectedFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      let text = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(i => i.str).join(' ') + ' ';
      }

      const addressMatch = text.match(/Lieferadresse[:\s]*([A-Za-zÄÖÜäöüß0-9\s,.-]+)/);
      const zrdMatch = text.match(/ZRD\d+/i);

      if (!addressMatch) {
        alert("Keine Lieferadresse gefunden!");
        return;
      }

      const address = addressMatch[1].trim();
      const zrd = zrdMatch ? zrdMatch[0] : "Keine ZRD gefunden";

      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Deutschland')}`);
      const geoData = await geoRes.json();

      if (!geoData.length) {
        alert("Adresse konnte nicht gefunden werden!");
        return;
      }

      const { lat, lon, display_name } = geoData[0];

      const icon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34]
      });

      const marker = L.marker([lat, lon], { icon }).addTo(map);

      const popupHTML = `
        <b>${zrd}</b><br>
        <b>Adresse:</b><br>${display_name}<br><br>
        <label>Auftragsnummer:</label><br>
        <input id="auftrag-${lat}" type="text"><br><br>
        <label>Ticketnummer:</label><br>
        <input id="ticket-${lat}" type="text"><br><br>
        <label>Grund:</label><br>
        <textarea id="grund-${lat}" rows="2"></textarea><br><br>
        <label>Priorität:</label><br>
        <select id="prio-${lat}">
          <option value="green">Grün</option>
          <option value="orange">Orange</option>
          <option value="red">Rot</option>
        </select><br><br>
        <button id="ok-${lat}">OK</button>
      `;

      marker.bindPopup(popupHTML).openPopup();

      setTimeout(() => {
        const okBtn = document.getElementById(`ok-${lat}`);
        okBtn?.addEventListener('click', () => {
          const prio = document.getElementById(`prio-${lat}`).value;
          const newIcon = L.icon({
            iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${prio}.png`,
            shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34]
          });
          marker.setIcon(newIcon);
          marker.closePopup();
          alert("Auftrag gespeichert!");
        });
      }, 300);

      map.setView([lat, lon], 13);
    } catch (err) {
      console.error(err);
      alert("Fehler beim Verarbeiten der PDF.");
    }
  });
});

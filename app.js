/* app.js
 - Lädt pdf.js Worker
 - Initialisiert Leaflet Map (Esri World Imagery = Satellit)
 - Liest PDFs, extrahiert Lieferadresse, ZRD, Gerätenummer, Grund
 - Geokodiert Adresse via Nominatim
 - Legt Marker an (mehrere)
 - Popup erlaubt Eintragen von Ticketnummer, Auftragsnummer, Priorität
 - Speichert alle Punkte in localStorage (persistiert auf dem Gerät)
*/

/* === PDF.js Worker einstellen === */
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist/build/pdf.worker.min.js';
} else {
  alert('pdfjsLib nicht gefunden — Seite benötigt Internet, um Bibliotheken zu laden.');
}

/* === Karte initialisieren (Esri World Imagery für Satellitenansicht) === */
const map = L.map('map').setView([51.1657, 10.4515], 6);

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles: Esri World Imagery, OpenStreetMap contributors',
  maxZoom: 19
}).addTo(map);

/* Marker-Icons für Priorität */
function createColoredIcon(color) {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background:${color};width:18px;height:18px;border-radius:50%;border:2px solid white;box-shadow:0 0 2px rgba(0,0,0,0.5)"></div>`,
    iconSize: [18,18],
    iconAnchor: [9,9]
  });
}
const icons = {
  green: createColoredIcon('#28a745'),
  orange: createColoredIcon('#ff8c00'),
  red: createColoredIcon('#dc3545')
};

/* Speicher-Key */
const STORAGE_KEY = 'lieferkarte_points_v1';

/* Laufende Marker-Referenzen */
let markers = {}; // id -> {marker, data}

/* Hilfsfunktionen: speichern / laden */
function loadPoints() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Fehler beim Laden aus localStorage', e);
    return [];
  }
}
function savePoints(arr) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

/* Marker aus gespeicherten Punkten wiederherstellen */
function renderSavedPoints() {
  const pts = loadPoints();
  pts.forEach(p => addMarkerFromData(p, false));
}
renderSavedPoints();

/* Funktionen zur Feld-Extraktion aus Text.
   Wir suchen:
   - "Lieferadresse:" gefolgt von Text (bis Zeilenumbruch oder bis nächste Kennung)
   - "ZRD" gefolgt von Zahlen (z.B. ZRD263816)
   - "Gerätenummer" / "Seriennummer" / "SN"
   - "Grund" / "Grund der Meldung" / "Meldung"
*/
function extractFieldByLabel(text, labelRegex) {
  // sucht "Label: <value>" und gibt value zurück (bis Zeilenumbruch)
  const re = new RegExp(labelRegex + '[:\\s]*([^\\n\\r]+)', 'i');
  const m = re.exec(text);
  return m ? m[1].trim() : null;
}

function extractAddress(text) {
  // 1) Versuch: explizit "Lieferadresse:" gefolgt von Zeile(n)
  const addr = extractFieldByLabel(text, 'Lieferadresse');
  if (addr) return addr;

  // 2) Fallback: Suche PLZ + Stadt (z. B. "10115 Berlin" oder "10115 Berlin, Musterstraße 1")
  const plzCity = text.match(/([A-Za-zÄÖÜäöüß\.\-ß0-9 \t\,]*\d{1,4}[A-Za-z]?\s*,?\s*\d{5}\s+[A-Za-zÄÖÜäöüß\- ]{2,60})/);
  if (plzCity) return plzCity[0].trim();

  // 3) andere Fallback / erste Zeile mit 5-stelliger PLZ
  const plz = text.match(/(\d{5}\s+[A-Za-zÄÖÜäöüß\-\s]{2,60})/);
  if (plz) return plz[0].trim();

  return null;
}

function extractZRD(text) {
  const m = text.match(/ZRD\s*[:\-]?\s*(\d{3,})/i);
  return m ? m[1] : null;
}

function extractGeraet(text) {
  const m = text.match(/(?:Gerätenummer|Gerät|Seriennummer|SN)[:\s]*([\w\-\/]+)/i);
  return m ? m[1] : null;
}

function extractGrund(text) {
  // versuche mehrere Varianten
  let m = text.match(/(?:Grund der Meldung|Grund der Arbeit|Grund|Meldung)[:\s]*([^\n\r]+)/i);
  return m ? m[1].trim() : null;
}

/* Geocoding via Nominatim (OpenStreetMap).
   Hinweis: keine großen Mengen in kurzer Zeit, Nominatim hat Rate Limits.
*/
async function geocode(address) {
  const q = encodeURIComponent(address + ', Deutschland');
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`;
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error('Geocode HTTP error ' + res.status);
    const json = await res.json();
    if (json && json.length) {
      return { lat: parseFloat(json[0].lat), lon: parseFloat(json[0].lon), display_name: json[0].display_name };
    }
  } catch (e) {
    console.error('Geocode error', e);
  }
  return null;
}

/* ID-Generator */
function genId() { return 'p_' + Date.now() + '_' + Math.floor(Math.random()*9999); }

/* Marker hinzufügen aus Datenobjekt (data) 
   data = { id, lat, lon, address, zrd, geraet, grund, ticket, auftrag, priority }
   addToStorage: ob der Punkt in localStorage gespeichert werden soll
*/
function addMarkerFromData(data, addToStorage = true) {
  if (!data || !data.lat || !data.lon) return;

  const id = data.id || genId();
  data.id = id;
  data.priority = data.priority || 'green';

  // Icon nach Priorität
  const icon = icons[data.priority] || icons.green;

  // Falls existierender Marker: entfernen
  if (markers[id]) {
    map.removeLayer(markers[id].marker);
    delete markers[id];
  }

  const marker = L.marker([data.lat, data.lon], { icon }).addTo(map);

  // Popup-Inhalt: man kann Ticket, Auftrag, Priorität setzen
  const popupEl = document.createElement('div');

  // readonly fields
  const infoHtml = `
    <div style="font-weight:700">${data.address || data.display_name || 'Unbekannte Adresse'}</div>
    <div style="margin-top:6px">ZRD: <b>${data.zrd || '–'}</b> &nbsp; Gerätenummer: <b>${data.geraet || '–'}</b></div>
    <div style="margin-top:6px"><small>${data.grund ? 'Grund: ' + data.grund : ''}</small></div>
    <hr style="margin:8px 0"/>
  `;
  popupEl.innerHTML = infoHtml;

  // Ticket input
  const ticketRow = document.createElement('div'); ticketRow.className='popup-row';
  ticketRow.innerHTML = '<div class="popup-field"><label>Ticketnummer</label><input type="text" id="ticketInput" placeholder="Ticketnummer"></div>';
  popupEl.appendChild(ticketRow);

  // Auftrag input
  const auftragRow = document.createElement('div'); auftragRow.className='popup-row';
  auftragRow.innerHTML = '<div class="popup-field"><label>Auftragsnummer</label><input type="text" id="auftragInput" placeholder="Auftragsnummer"></div>';
  popupEl.appendChild(auftragRow);

  // Grund editierbar (optional)
  const grundRow = document.createElement('div'); grundRow.className='popup-row';
  grundRow.innerHTML = `<div class="popup-field"><label>Grund (kurz)</label><input type="text" id="grundInput" placeholder="z. B. Wartung, Reparatur" value="${data.grund ? data.grund.replace(/"/g,'') : ''}"></div>`;
  popupEl.appendChild(grundRow);

  // Priorität select
  const prioRow = document.createElement('div'); prioRow.className='popup-row';
  prioRow.innerHTML = `<div class="popup-field"><label>Priorität</label>
    <select id="prioSelect">
      <option value="green">Grün — noch nicht eilig</option>
      <option value="orange">Orange — lieber wichtig</option>
      <option value="red">Rot — eilig</option>
    </select>
  </div>`;
  popupEl.appendChild(prioRow);

  // Save/OK Button
  const btnRow = document.createElement('div'); btnRow.style.marginTop = '6px';
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'OK — Eintragen';
  saveBtn.style.padding = '6px 8px';
  saveBtn.style.fontWeight = '700';
  btnRow.appendChild(saveBtn);
  popupEl.appendChild(btnRow);

  // Wenn gespeicherte Werte vorhanden sind, fülle die Inputs
  function fillInputs() {
    const t = popupEl.querySelector('#ticketInput');
    const a = popupEl.querySelector('#auftragInput');
    const g = popupEl.querySelector('#grundInput');
    const p = popupEl.querySelector('#prioSelect');
    if (t) t.value = data.ticket || '';
    if (a) a.value = data.auftrag || '';
    if (g) g.value = data.grund || '';
    if (p) p.value = data.priority || 'green';
  }
  fillInputs();

  // Save Handler
  saveBtn.addEventListener('click', () => {
    const t = popupEl.querySelector('#ticketInput').value.trim();
    const a = popupEl.querySelector('#auftragInput').value.trim();
    const g = popupEl.querySelector('#grundInput').value.trim();
    const p = popupEl.querySelector('#prioSelect').value;

    data.ticket = t || null;
    data.auftrag = a || null;
    data.grund = g || data.grund || null;
    data.priority = p || 'green';

    // Update icon
    const newIcon = icons[data.priority] || icons.green;
    marker.setIcon(newIcon);

    // Save to storage
    const all = loadPoints();
    // replace or push
    const idx = all.findIndex(x => x.id === data.id);
    if (idx >= 0) all[idx] = data;
    else all.push(data);
    savePoints(all);

    marker.closePopup();
    alert('Eintrag gespeichert ✅');
  });

  // Bind popup (use element)
  marker.bindPopup(popupEl);

  // Store marker ref
  markers[id] = { marker, data };

  // Optional: open popup immediately when added
  // marker.openPopup();
}

/* === PDF Upload Handling === */
document.getElementById('pdfInput').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  if (!file) return alert('Keine Datei gewählt.');

  // lese PDF und extrahiere Text
  try {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(it => it.str).join(' ') + '\n';
    }

    // Extraktion
    const address = extractAddress(fullText);
    const zrd = extractZRD(fullText);
    const geraet = extractGeraet(fullText);
    const grund = extractGrund(fullText);

    if (!address) {
      alert('Keine Lieferadresse gefunden. Stelle sicher, dass in der PDF "Lieferadresse:" oder eine PLZ + Stadt vorhanden ist.');
      return;
    }

    // Geocode address
    const geo = await geocode(address);
    if (!geo) {
      alert('Adresse konnte nicht geokodet werden (Nominatim). Versuche eine klarere Adresse in der PDF.');
      return;
    }

    // Erstelle Datenobjekt
    const data = {
      id: genId(),
      lat: geo.lat,
      lon: geo.lon,
      address: address,
      display_name: geo.display_name,
      zrd: zrd || null,
      geraet: geraet || null,
      grund: grund || null,
      ticket: null,
      auftrag: null,
      priority: 'green',
      createdAt: new Date().toISOString()
    };

    // add marker und speichern
    addMarkerFromData(data, true);
    const all = loadPoints(); all.push(data); savePoints(all);

    // zentrieren und popup sofort öffnen
    map.setView([data.lat, data.lon], 12);
    // Öffnen des Popups der gerade hinzugefügten Markers
    const ref = markers[data.id];
    if (ref) ref.marker.openPopup();

  } catch (e) {
    console.error(e);
    alert('Fehler beim Verarbeiten der PDF. Schau in die Konsole für Details.');
  }
});

/* === Buttons: Info & Clear === */
document.getElementById('infoBtn').addEventListener('click', () => {
  alert('Anleitung:\\n1) Datei auswählen (PDF)\\n2) Die Seite liest automatisch Lieferadresse, ZRD, Gerätenummer und Grund aus der PDF.\\n3) Marker werden gesetzt.\\n4) Auf Marker klicken, Ticket, Auftrag und Priorität eintragen und OK drücken.\\nHinweis: Große Mengen an Geocoding-Anfragen können von Nominatim blockiert werden (Rate Limits).');
});

document.getElementById('clearBtn').addEventListener('click', () => {
  if (!confirm('Alle gespeicherten Punkte wirklich löschen?')) return;
  // Entferne Marker von Karte
  Object.values(markers).forEach(m => map.removeLayer(m.marker));
  markers = {};
  // leere Storage
  savePoints([]);
  alert('Alle Punkte gelöscht.');
});

/* === Beim Laden: lege eine Legende als Overlay an === */
const legend = L.control({position: 'topright'});
legend.onAdd = function() {
  const div = L.DomUtil.create('div', 'legend');
  div.innerHTML = `<div><b>Priorität</b></div>
    <div style="margin-top:6px"><span class="dot g"></span> Grün</div>
    <div><span class="dot o"></span> Orange</div>
    <div><span class="dot r"></span> Rot</div>`;
  return div;
};
legend.addTo(map);

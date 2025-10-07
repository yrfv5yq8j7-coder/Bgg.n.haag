// PDF.js Worker setzen
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist/build/pdf.worker.min.js';

document.getElementById('pdfInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) { 
    console.log("Keine Datei gewählt"); 
    return; 
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(i => i.str).join(' ') + ' ';
    }
    console.log("PDF Text:", text); // Ausgabe in Konsole
    alert("PDF wurde ausgelesen! Siehe Konsole für Text.");
  } catch (e) {
    alert("Fehler beim Lesen der PDF: " + e.message);
    console.error(e);
  }
});

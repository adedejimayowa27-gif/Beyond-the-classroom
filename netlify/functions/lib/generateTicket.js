const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const INK = rgb(0.106, 0.164, 0.290);   // deep civic navy
const GOLD = rgb(0.784, 0.608, 0.235);  // brass gold accent
const PAPER = rgb(0.965, 0.949, 0.902); // parchment
const MUTED = rgb(0.55, 0.55, 0.58);

async function generateTicketPdf({ edition, registration }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([620, 300]);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Main stub
  page.drawRectangle({ x: 0, y: 0, width: 460, height: 300, color: INK });
  // Perforated divider
  for (let y = 8; y < 300; y += 14) {
    page.drawCircle({ x: 460, y, size: 3, color: rgb(1, 1, 1) });
  }
  // Torn-off counterfoil
  page.drawRectangle({ x: 460, y: 0, width: 160, height: 300, color: PAPER });

  page.drawText('BEYOND THE CLASSROOM', { x: 32, y: 244, size: 20, font: bold, color: rgb(1, 1, 1) });
  page.drawText('with MayorCity', { x: 32, y: 222, size: 13, font: regular, color: GOLD });
  page.drawText(edition.name || 'Monthly Edition', { x: 32, y: 200, size: 10, font: regular, color: rgb(0.8, 0.82, 0.88) });

  let photoDrawn = false;
  if (registration.photo_url) {
    try {
      const res = await fetch(registration.photo_url);
      const imgBytes = await res.arrayBuffer();
      let img;
      try {
        img = await pdfDoc.embedJpg(imgBytes);
      } catch {
        img = await pdfDoc.embedPng(imgBytes);
      }
      page.drawRectangle({ x: 355, y: 90, width: 84, height: 84, color: rgb(1, 1, 1) });
      page.drawImage(img, { x: 357, y: 92, width: 80, height: 80 });
      photoDrawn = true;
    } catch (e) {
      // If the photo can't be fetched/embedded, the ticket still renders fine without it.
    }
  }

  const infoX = 32;
  page.drawText('NAME', { x: infoX, y: 160, size: 8, font: bold, color: GOLD });
  page.drawText(registration.full_name, { x: infoX, y: 146, size: 13, font: bold, color: rgb(1, 1, 1) });

  page.drawText('EMAIL', { x: infoX, y: 120, size: 8, font: bold, color: GOLD });
  page.drawText(registration.email, { x: infoX, y: 106, size: 11, font: regular, color: rgb(1, 1, 1) });

  page.drawText('PHONE', { x: infoX, y: 82, size: 8, font: bold, color: GOLD });
  page.drawText(registration.phone, { x: infoX, y: 68, size: 11, font: regular, color: rgb(1, 1, 1) });

  page.drawText(`BATCH ${registration.batch_number}`, { x: infoX, y: 34, size: 11, font: bold, color: rgb(1, 1, 1) });
  page.drawText(`Registered ${new Date(registration.created_at).toLocaleDateString()}`, {
    x: infoX + 90, y: 34, size: 9, font: regular, color: MUTED
  });

  // Counterfoil (right side)
  page.drawText('ADMIT ONE', { x: 484, y: 250, size: 11, font: bold, color: INK });
  page.drawText('TICKET CODE', { x: 484, y: 150, size: 8, font: bold, color: rgb(0.4, 0.4, 0.42) });
  page.drawText(registration.ticket_code, { x: 484, y: 132, size: 14, font: bold, color: INK });
  page.drawText(`Batch ${registration.batch_number} of ${edition.max_batches}`, {
    x: 484, y: 100, size: 9, font: regular, color: rgb(0.35, 0.35, 0.38)
  });
  page.drawText('Present this ticket (digital', { x: 484, y: 50, size: 7, font: regular, color: MUTED });
  page.drawText('or printed) at the entrance.', { x: 484, y: 40, size: 7, font: regular, color: MUTED });

  return pdfDoc.save();
}

module.exports = { generateTicketPdf };

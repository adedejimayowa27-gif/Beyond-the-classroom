const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');

const INK = rgb(0.106, 0.164, 0.290);   // deep civic navy
const GOLD = rgb(0.784, 0.608, 0.235);  // brass gold accent
const PAPER = rgb(0.965, 0.949, 0.902); // parchment
const MUTED = rgb(0.55, 0.55, 0.58);

function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

async function generateTicketPdf({ edition, registration }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([640, 320]);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const STUB_W = 470;

  // Main stub
  page.drawRectangle({ x: 0, y: 0, width: STUB_W, height: 320, color: INK });
  // Perforated divider
  for (let y = 8; y < 320; y += 14) {
    page.drawCircle({ x: STUB_W, y, size: 3, color: rgb(1, 1, 1) });
  }
  // Torn-off counterfoil
  page.drawRectangle({ x: STUB_W, y: 0, width: 170, height: 320, color: PAPER });

  // ---- Header ----
  page.drawText('BEYOND THE CLASSROOM', { x: 32, y: 290, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText('with MayorCity', { x: 32, y: 270, size: 12, font: regular, color: GOLD });
  page.drawText(truncate(edition.name || 'Monthly Edition', 42), { x: 32, y: 252, size: 9, font: regular, color: rgb(0.8, 0.82, 0.88) });

  // ---- Big applicant photo, top-right of the stub ----
  const PHOTO_X = 306, PHOTO_Y = 130, PHOTO_SIZE = 144;
  page.drawRectangle({ x: PHOTO_X, y: PHOTO_Y, width: PHOTO_SIZE, height: PHOTO_SIZE, color: rgb(1, 1, 1) });

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
      const inset = 4;
      page.drawImage(img, {
        x: PHOTO_X + inset,
        y: PHOTO_Y + inset,
        width: PHOTO_SIZE - inset * 2,
        height: PHOTO_SIZE - inset * 2
      });
      photoDrawn = true;
    } catch (e) {
      // If the photo can't be fetched/embedded, the ticket still renders fine without it.
    }
  }
  if (!photoDrawn) {
    page.drawRectangle({
      x: PHOTO_X + 4, y: PHOTO_Y + 4, width: PHOTO_SIZE - 8, height: PHOTO_SIZE - 8,
      borderColor: rgb(0.8, 0.8, 0.82), borderWidth: 1, color: rgb(0.93, 0.93, 0.94)
    });
    page.drawText('NO PHOTO', { x: PHOTO_X + PHOTO_SIZE / 2 - 26, y: PHOTO_Y + PHOTO_SIZE / 2 - 4, size: 9, font: bold, color: rgb(0.6, 0.6, 0.62) });
  }

  // ---- Applicant details (left column, independent of photo) ----
  const infoX = 32;
  page.drawText('NAME', { x: infoX, y: 222, size: 8, font: bold, color: GOLD });
  page.drawText(truncate(registration.full_name, 34), { x: infoX, y: 208, size: 13, font: bold, color: rgb(1, 1, 1) });

  page.drawText('DEPARTMENT', { x: infoX, y: 182, size: 8, font: bold, color: GOLD });
  page.drawText(truncate(registration.department || '—', 34), { x: infoX, y: 168, size: 12, font: bold, color: rgb(1, 1, 1) });

  page.drawText('EMAIL', { x: infoX, y: 142, size: 8, font: bold, color: GOLD });
  page.drawText(truncate(registration.email, 40), { x: infoX, y: 128, size: 10, font: regular, color: rgb(1, 1, 1) });

  page.drawText('PHONE', { x: infoX, y: 100, size: 8, font: bold, color: GOLD });
  page.drawText(registration.phone, { x: infoX, y: 86, size: 10, font: regular, color: rgb(1, 1, 1) });

  page.drawText(`BATCH ${registration.batch_number}`, { x: infoX, y: 34, size: 10, font: bold, color: rgb(1, 1, 1) });
  page.drawText(`Registered ${new Date(registration.created_at).toLocaleDateString()}`, {
    x: infoX + 90, y: 34, size: 8, font: regular, color: MUTED
  });

  // ---- Counterfoil (right side) ----
  page.drawText('ADMIT ONE', { x: 494, y: 284, size: 11, font: bold, color: INK });

  // QR code — scanned at the door to check the guest in instantly.
  try {
    const qrDataUrl = await QRCode.toDataURL(registration.ticket_code, {
      margin: 0,
      color: { dark: '#1b2a4a', light: '#00000000' }
    });
    const qrBytes = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    const qrImg = await pdfDoc.embedPng(qrBytes);
    page.drawImage(qrImg, { x: 495, y: 160, width: 110, height: 110 });
  } catch (e) {
    // If the QR can't be generated, the ticket code below still works at the door.
  }

  page.drawText('TICKET CODE', { x: 494, y: 140, size: 8, font: bold, color: rgb(0.4, 0.4, 0.42) });
  page.drawText(registration.ticket_code, { x: 494, y: 122, size: 13, font: bold, color: INK });
  page.drawText(`Batch ${registration.batch_number} of ${edition.max_batches}`, {
    x: 494, y: 100, size: 9, font: regular, color: rgb(0.35, 0.35, 0.38)
  });
  page.drawText('Scan the QR code or show this', { x: 494, y: 50, size: 7, font: regular, color: MUTED });
  page.drawText('code at the entrance.', { x: 494, y: 40, size: 7, font: regular, color: MUTED });

  return pdfDoc.save();
}

module.exports = { generateTicketPdf };

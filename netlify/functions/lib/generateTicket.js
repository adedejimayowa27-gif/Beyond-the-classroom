const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');

const INK = rgb(0.106, 0.164, 0.290);      // deep civic navy
const INK_SOFT = rgb(0.55, 0.60, 0.68);    // muted ink-blue for secondary text on navy
const GOLD = rgb(0.784, 0.608, 0.235);     // brass gold accent
const GOLD_DIM = rgb(0.784, 0.608, 0.235); // used with opacity for hairlines
const PAPER = rgb(0.965, 0.949, 0.902);    // parchment
const PAPER_LINE = rgb(0.83, 0.80, 0.73);  // hairline on parchment
const MUTED = rgb(0.55, 0.55, 0.58);
const WHITE = rgb(1, 1, 1);

function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

// Manually kerns short all-caps labels ("NAME" -> "N A M E") for a more
// deliberate, premium label style. Standard fonts have no letter-spacing
// option in pdf-lib, so this is the plain-text trick for it. Only used on
// short label strings where the extra width is safe.
function spaced(text) {
  return text.split('').join(' ');
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const chars = parts.slice(0, 2).map(p => p[0].toUpperCase());
  return chars.join('') || '?';
}

// Centers `text` on the vertical line x = centerX, at baseline y.
function drawCentered(page, text, { centerX, y, size, font, color }) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: centerX - width / 2, y, size, font, color });
}

function hairline(page, { x1, x2, y, color, opacity = 1, thickness = 0.75 }) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color, opacity });
}

async function generateTicketPdf({ edition, registration }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([640, 320]);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const PAGE_W = 640, PAGE_H = 320;
  const STUB_W = 470;
  const MARGIN = 28;

  // ---- Base panels ----
  page.drawRectangle({ x: 0, y: 0, width: STUB_W, height: PAGE_H, color: INK });
  page.drawRectangle({ x: STUB_W, y: 0, width: PAGE_W - STUB_W, height: PAGE_H, color: PAPER });

  // A thin outer frame around the whole ticket ties both panels together
  // as one object rather than two separate boxes.
  page.drawRectangle({
    x: 1.5, y: 1.5, width: PAGE_W - 3, height: PAGE_H - 3,
    borderColor: GOLD, borderWidth: 1, borderOpacity: 0.9
  });

  // Gold band across the very top, spanning both panels — the one visual
  // element that reads "this is a single designed object" at a glance.
  page.drawRectangle({ x: 1.5, y: PAGE_H - 7, width: PAGE_W - 3, height: 5.5, color: GOLD });

  // ---- Perforation between stub and counterfoil ----
  for (let y = 14; y < PAGE_H - 14; y += 11) {
    page.drawCircle({ x: STUB_W, y, size: 2.6, color: PAPER });
    page.drawCircle({ x: STUB_W, y, size: 2.6, color: INK, opacity: 0 }); // keep crisp edge on navy side
  }

  // ============================================================
  // LEFT STUB (navy) — the part the guest keeps
  // ============================================================

  // ---- Seal + header ----
  const sealCX = MARGIN + 18, sealCY = PAGE_H - 40;
  page.drawCircle({ x: sealCX, y: sealCY, size: 17.5, borderColor: GOLD, borderWidth: 1.4 });
  page.drawCircle({ x: sealCX, y: sealCY, size: 13.5, borderColor: GOLD, borderWidth: 0.6, opacity: 0.6 });
  drawCentered(page, 'B', { centerX: sealCX, y: sealCY - 6, size: 15, font: bold, color: GOLD });

  const headerX = sealCX + 30;
  page.drawText('BEYOND THE CLASSROOM', { x: headerX, y: PAGE_H - 34, size: 15, font: bold, color: WHITE });
  page.drawText('with MayorCity', { x: headerX, y: PAGE_H - 49, size: 9.5, font: regular, color: GOLD });

  hairline(page, { x1: MARGIN, x2: STUB_W - 24, y: PAGE_H - 68, color: GOLD, opacity: 0.45 });
  page.drawText(spaced(truncate((edition.name || 'MONTHLY EDITION').toUpperCase(), 38)), {
    x: MARGIN, y: PAGE_H - 80, size: 7.5, font: regular, color: INK_SOFT
  });

  // ---- Applicant photo, top-right of the stub ----
  const PHOTO_SIZE = 116;
  const PHOTO_X = STUB_W - 24 - PHOTO_SIZE;
  const PHOTO_Y = PAGE_H - 90 - PHOTO_SIZE;

  // Outer gold frame + white "mat" behind the photo, like a printed ID card
  page.drawRectangle({
    x: PHOTO_X - 4, y: PHOTO_Y - 4, width: PHOTO_SIZE + 8, height: PHOTO_SIZE + 8,
    borderColor: GOLD, borderWidth: 1.2, color: WHITE
  });

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
      page.drawImage(img, { x: PHOTO_X, y: PHOTO_Y, width: PHOTO_SIZE, height: PHOTO_SIZE });
      photoDrawn = true;
    } catch (e) {
      // If the photo can't be fetched/embedded, fall through to the
      // initials placeholder below so the ticket still renders cleanly.
    }
  }
  if (!photoDrawn) {
    page.drawRectangle({
      x: PHOTO_X, y: PHOTO_Y, width: PHOTO_SIZE, height: PHOTO_SIZE, color: rgb(0.93, 0.93, 0.94)
    });
    drawCentered(page, initials(registration.full_name), {
      centerX: PHOTO_X + PHOTO_SIZE / 2, y: PHOTO_Y + PHOTO_SIZE / 2 - 14,
      size: 34, font: bold, color: GOLD
    });
  }

  // ---- Applicant details, left column ----
  const infoX = MARGIN;
  const infoColW = PHOTO_X - 16 - infoX;

  page.drawText(spaced('NAME'), { x: infoX, y: PAGE_H - 100, size: 7.5, font: bold, color: GOLD });
  page.drawText(truncate(registration.full_name, 30), { x: infoX, y: PAGE_H - 116, size: 15, font: bold, color: WHITE });

  hairline(page, { x1: infoX, x2: PHOTO_X - 4, y: PAGE_H - 128, color: WHITE, opacity: 0.14, thickness: 0.5 });

  const col2X = infoX + infoColW / 2 + 6;
  page.drawText(spaced('DEPT.'), { x: infoX, y: PAGE_H - 144, size: 7, font: bold, color: GOLD });
  page.drawText(truncate(registration.department || '—', 20), { x: infoX, y: PAGE_H - 158, size: 11, font: bold, color: WHITE });

  page.drawText(spaced('PHONE'), { x: col2X, y: PAGE_H - 144, size: 7, font: bold, color: GOLD });
  page.drawText(registration.phone, { x: col2X, y: PAGE_H - 158, size: 11, font: regular, color: WHITE });

  hairline(page, { x1: infoX, x2: PHOTO_X - 4, y: PAGE_H - 170, color: WHITE, opacity: 0.14, thickness: 0.5 });

  page.drawText(spaced('EMAIL'), { x: infoX, y: PAGE_H - 186, size: 7, font: bold, color: GOLD });
  page.drawText(truncate(registration.email, 42), { x: infoX, y: PAGE_H - 200, size: 10, font: regular, color: rgb(0.85, 0.87, 0.92) });

  // ---- Footer strip of the stub ----
  hairline(page, { x1: MARGIN, x2: STUB_W - 24, y: 44, color: GOLD, opacity: 0.35 });
  page.drawText(`BATCH ${registration.batch_number}`, { x: MARGIN, y: 26, size: 10.5, font: bold, color: WHITE });
  page.drawText(`Registered ${new Date(registration.created_at).toLocaleDateString()}`, {
    x: MARGIN + 78, y: 27, size: 8, font: regular, color: INK_SOFT
  });
  page.drawText(`NO. ${registration.ticket_code.slice(-4)}`, { x: STUB_W - 24 - 46, y: 27, size: 8, font: regular, color: INK_SOFT });

  // ============================================================
  // RIGHT COUNTERFOIL (parchment) — the part scanned at the door
  // ============================================================
  const cfX1 = STUB_W + 24, cfX2 = PAGE_W - 24;
  const cfCenter = STUB_W + (PAGE_W - STUB_W) / 2;

  drawCentered(page, spaced('ADMIT ONE'), { centerX: cfCenter, y: PAGE_H - 34, size: 11, font: bold, color: INK });
  hairline(page, { x1: cfX1, x2: cfX2, y: PAGE_H - 46, color: INK, opacity: 0.35 });

  // QR code, boxed
  const QR_BOX = 108;
  const qrBoxX = cfCenter - QR_BOX / 2;
  const qrBoxY = PAGE_H - 58 - QR_BOX;
  page.drawRectangle({ x: qrBoxX, y: qrBoxY, width: QR_BOX, height: QR_BOX, borderColor: INK, borderWidth: 1, borderOpacity: 0.5, color: WHITE });

  try {
    const qrDataUrl = await QRCode.toDataURL(registration.ticket_code, {
      margin: 0,
      color: { dark: '#1b2a4a', light: '#00000000' }
    });
    const qrBytes = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    const qrImg = await pdfDoc.embedPng(qrBytes);
    const inset = 8;
    page.drawImage(qrImg, {
      x: qrBoxX + inset, y: qrBoxY + inset, width: QR_BOX - inset * 2, height: QR_BOX - inset * 2
    });
  } catch (e) {
    // If the QR can't be generated, the ticket code below still works at the door.
  }

  const belowQrY = qrBoxY - 18;
  hairline(page, { x1: cfX1, x2: cfX2, y: belowQrY + 6, color: INK, opacity: 0.2 });

  drawCentered(page, spaced('TICKET CODE'), { centerX: cfCenter, y: belowQrY - 8, size: 7, font: bold, color: MUTED });
  drawCentered(page, registration.ticket_code, { centerX: cfCenter, y: belowQrY - 24, size: 13.5, font: bold, color: INK });
  drawCentered(page, `Batch ${registration.batch_number} of ${edition.max_batches}`, {
    centerX: cfCenter, y: belowQrY - 40, size: 8.5, font: regular, color: MUTED
  });

  hairline(page, { x1: cfX1, x2: cfX2, y: belowQrY - 50, color: PAPER_LINE });
  drawCentered(page, 'Scan the QR code or show', { centerX: cfCenter, y: belowQrY - 64, size: 7, font: regular, color: MUTED });
  drawCentered(page, 'this code at the entrance.', { centerX: cfCenter, y: belowQrY - 74, size: 7, font: regular, color: MUTED });

  drawCentered(page, spaced('BEYOND THE CLASSROOM'), { centerX: cfCenter, y: 16, size: 6, font: regular, color: PAPER_LINE });

  return pdfDoc.save();
}

module.exports = { generateTicketPdf };

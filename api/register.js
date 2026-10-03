const { createClient } = require('@supabase/supabase-js');
const { generateTicketPdf } = require('../lib/generateTicket');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); }
    catch { return res.status(400).json({ error: 'Invalid request body' }); }
  }
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { edition_id, full_name, email, phone, department, photo_url, website } = payload;

  // Honeypot: real applicants never see or fill this hidden field, so if
  // it's non-empty this is almost certainly a bot. Pretend it worked so
  // the bot doesn't keep retrying, but never touch the database.
  if (website) {
    return res.status(200).json({ warning: 'Registered.', ticket_code: 'BTC-00000000' });
  }

  if (!edition_id || !full_name || !email || !phone || !department) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }

  const { data: registration, error } = await supabase
    .rpc('register_applicant', {
      p_edition_id: edition_id,
      p_full_name: full_name,
      p_email: email,
      p_phone: phone,
      p_photo_url: photo_url || null,
      p_department: department
    })
    .single();

  if (error) {
    let message = 'Registration could not be completed. Please try again.';
    if (error.message.includes('BATCH_CLOSED')) {
      message = 'This batch just filled up. Please check back when the next batch opens.';
    } else if (error.message.includes('EDITION_COMPLETED')) {
      message = 'Registration for this edition is complete — all spots have been filled.';
    } else if (error.message.includes('EDITION_NOT_FOUND')) {
      message = 'This program is not open for registration right now.';
    } else if (error.message.includes('DUPLICATE_EMAIL')) {
      message = 'That email address is already registered for this edition. Check /lookup.html to re-download your ticket.';
    }
    return res.status(400).json({ error: message });
  }

  const { data: edition } = await supabase
    .from('editions')
    .select('*')
    .eq('id', edition_id)
    .single();

  try {
    const pdfBytes = await generateTicketPdf({ edition, registration });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ticket-${registration.ticket_code}.pdf"`);
    res.setHeader('X-Ticket-Code', registration.ticket_code);
    return res.status(200).send(Buffer.from(pdfBytes));
  } catch (pdfErr) {
    // Registration succeeded even if PDF rendering hiccups — let them re-download by code.
    return res.status(200).json({
      warning: 'Registered, but the ticket could not be rendered immediately. Use your ticket code to download it.',
      ticket_code: registration.ticket_code
    });
  }
};

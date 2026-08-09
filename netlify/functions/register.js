const { createClient } = require('@supabase/supabase-js');
const { generateTicketPdf } = require('./lib/generateTicket');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { edition_id, full_name, email, phone, photo_url } = payload;

  if (!edition_id || !full_name || !email || !phone) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Please fill in all required fields.' }) };
  }

  const { data: registration, error } = await supabase
    .rpc('register_applicant', {
      p_edition_id: edition_id,
      p_full_name: full_name,
      p_email: email,
      p_phone: phone,
      p_photo_url: photo_url || null
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
    }
    return { statusCode: 400, body: JSON.stringify({ error: message }) };
  }

  const { data: edition } = await supabase
    .from('editions')
    .select('*')
    .eq('id', edition_id)
    .single();

  try {
    const pdfBytes = await generateTicketPdf({ edition, registration });
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ticket-${registration.ticket_code}.pdf"`
      },
      body: Buffer.from(pdfBytes).toString('base64'),
      isBase64Encoded: true
    };
  } catch (pdfErr) {
    // Registration succeeded even if PDF rendering hiccups — let them re-download by code.
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        warning: 'Registered, but the ticket could not be rendered immediately. Use your ticket code to download it.',
        ticket_code: registration.ticket_code
      })
    };
  }
};

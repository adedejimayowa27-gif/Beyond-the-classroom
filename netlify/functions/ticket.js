const { createClient } = require('@supabase/supabase-js');
const { generateTicketPdf } = require('./lib/generateTicket');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  const code = event.queryStringParameters && event.queryStringParameters.code;
  if (!code) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing ticket code' }) };
  }

  const { data: registration, error } = await supabase
    .from('registrations')
    .select('*')
    .eq('ticket_code', code.toUpperCase())
    .single();

  if (error || !registration) {
    return { statusCode: 404, body: JSON.stringify({ error: 'No ticket found for that code.' }) };
  }

  const { data: edition } = await supabase
    .from('editions')
    .select('*')
    .eq('id', registration.edition_id)
    .single();

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
};

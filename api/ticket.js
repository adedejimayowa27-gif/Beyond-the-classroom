const { createClient } = require('@supabase/supabase-js');
const { generateTicketPdf } = require('../lib/generateTicket');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  const code = req.query && req.query.code;
  if (!code) {
    return res.status(400).json({ error: 'Missing ticket code' });
  }

  const { data: registration, error } = await supabase
    .from('registrations')
    .select('*')
    .eq('ticket_code', String(code).toUpperCase())
    .single();

  if (error || !registration) {
    return res.status(404).json({ error: 'No ticket found for that code.' });
  }

  const { data: edition } = await supabase
    .from('editions')
    .select('*')
    .eq('id', registration.edition_id)
    .single();

  const pdfBytes = await generateTicketPdf({ edition, registration });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="ticket-${registration.ticket_code}.pdf"`);
  return res.status(200).send(Buffer.from(pdfBytes));
};

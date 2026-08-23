const supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const loginCard = document.getElementById('loginCard');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const scanArea = document.getElementById('scanArea');
const cameraHint = document.getElementById('cameraHint');
const manualForm = document.getElementById('manualForm');
const manualCode = document.getElementById('manualCode');
const resultCard = document.getElementById('resultCard');
const resultBody = document.getElementById('resultBody');

let scanner = null;
let busy = false;
let lastCode = null;
let lastCodeAt = 0;

function showLoginMsg(text, type) {
  loginMessage.innerHTML = `<div class="message ${type}">${text}</div>`;
}

async function checkSession() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      loginCard.style.display = 'none';
      scanArea.style.display = 'block';
      startScanner();
    } else {
      loginCard.style.display = 'block';
      scanArea.style.display = 'none';
    }
  } catch (err) {
    showLoginMsg('Could not reach Supabase — check that /js/config.js is deployed and your keys are correct.', 'error');
    console.error('checkSession failed:', err);
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    showLoginMsg(error.message, 'error');
  } else {
    checkSession();
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  if (scanner) { try { await scanner.stop(); } catch (e) {} }
  checkSession();
});

function startScanner() {
  if (scanner || !window.Html5Qrcode) return;
  scanner = new Html5Qrcode('qrReader');
  Html5Qrcode.getCameras().then(cameras => {
    if (!cameras || !cameras.length) {
      cameraHint.textContent = 'No camera found — use the manual code entry below.';
      return;
    }
    const cameraId = (cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[0]).id;
    scanner.start(
      cameraId,
      { fps: 10, qrbox: 240 },
      (decodedText) => onCodeScanned(decodedText),
      () => {}
    ).then(() => {
      cameraHint.textContent = 'Point the camera at a ticket\'s QR code.';
    }).catch(() => {
      cameraHint.textContent = 'Could not start the camera — use the manual code entry below.';
    });
  }).catch(() => {
    cameraHint.textContent = 'Camera access unavailable — use the manual code entry below.';
  });
}

function onCodeScanned(text) {
  const code = text.trim().toUpperCase();
  const now = Date.now();
  // Avoid re-processing the same QR code repeatedly while it's still in frame.
  if (code === lastCode && now - lastCodeAt < 4000) return;
  lastCode = code;
  lastCodeAt = now;
  processCode(code);
}

manualForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const code = manualCode.value.trim().toUpperCase();
  if (!code) return;
  processCode(code);
  manualCode.value = '';
});

function renderResult(state, html) {
  resultCard.style.display = 'block';
  resultCard.className = 'card result-' + state;
  resultBody.innerHTML = html;
}

async function processCode(code) {
  if (busy) return;
  busy = true;
  renderResult('pending', '<p>Checking…</p>');

  try {
    const { data: registration, error } = await supabaseClient
      .from('registrations')
      .select('*')
      .eq('ticket_code', code)
      .single();

    if (error || !registration) {
      renderResult('bad', `<h2>Not found</h2><p>No ticket matches <strong>${code}</strong>.</p>`);
      return;
    }

    if (registration.checked_in) {
      const when = registration.checked_in_at ? new Date(registration.checked_in_at).toLocaleTimeString() : 'earlier';
      renderResult('warn', `
        <h2>Already checked in</h2>
        <p><strong>${registration.full_name}</strong> (Batch ${registration.batch_number}) was already checked in at ${when}.</p>
      `);
      return;
    }

    const { error: updateErr } = await supabaseClient
      .from('registrations')
      .update({ checked_in: true, checked_in_at: new Date().toISOString() })
      .eq('id', registration.id);

    if (updateErr) {
      renderResult('bad', `<h2>Error</h2><p>${updateErr.message}</p>`);
      return;
    }

    renderResult('good', `
      <h2>Welcome, ${registration.full_name.split(' ')[0]}!</h2>
      <p><strong>${registration.full_name}</strong> · ${registration.department || 'No dept.'} · Batch ${registration.batch_number} · ${registration.email}</p>
      <p class="hint">Checked in just now.</p>
    `);
  } finally {
    busy = false;
  }
}

checkSession();

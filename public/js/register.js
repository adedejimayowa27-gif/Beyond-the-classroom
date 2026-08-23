const supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const els = {
  banner: document.getElementById('banner'),
  editionName: document.getElementById('editionName'),
  statusPill: document.getElementById('statusPill'),
  tally: document.getElementById('tally'),
  tallyLabel: document.getElementById('tallyLabel'),
  regCard: document.getElementById('regCard'),
  form: document.getElementById('regForm'),
  submitBtn: document.getElementById('submitBtn'),
  message: document.getElementById('message'),
  photo: document.getElementById('photo'),
  photoPreview: document.getElementById('photoPreview'),
  department: document.getElementById('department'),
  website: document.getElementById('website'),
  waitlistCard: document.getElementById('waitlistCard'),
  waitlistForm: document.getElementById('waitlistForm'),
  waitlistBtn: document.getElementById('waitlistBtn'),
  waitlistMessage: document.getElementById('waitlistMessage')
};

let currentEdition = null;

function showMessage(text, type) {
  els.message.innerHTML = `<div class="message ${type}">${text}</div>`;
}

function showWaitlistMessage(text, type) {
  els.waitlistMessage.innerHTML = `<div class="message ${type}">${text}</div>`;
}

function renderTally(filledInBatch, batchSize) {
  els.tally.innerHTML = '';
  for (let i = 0; i < batchSize; i++) {
    const mark = document.createElement('div');
    mark.className = 'mark' + (i < filledInBatch ? ' filled' : '');
    els.tally.appendChild(mark);
  }
}

function copyCodeHandler(e) {
  const code = e.currentTarget.dataset.code;
  navigator.clipboard.writeText(code).then(() => {
    e.currentTarget.textContent = 'Copied!';
    setTimeout(() => { e.currentTarget.textContent = 'Copy code'; }, 1500);
  });
}

function attachCopyButtons() {
  els.message.querySelectorAll('.copy-code-btn').forEach(btn => {
    btn.addEventListener('click', copyCodeHandler);
  });
}

// Live preview of the photo the applicant selected, shown big on the page
// itself (not just baked into the PDF later).
els.photo.addEventListener('change', () => {
  const file = els.photo.files[0];
  if (!file) {
    els.photoPreview.style.display = 'none';
    els.photoPreview.src = '';
    return;
  }
  const url = URL.createObjectURL(file);
  els.photoPreview.src = url;
  els.photoPreview.style.display = 'block';
});

// Best-effort: point the social-preview image at the current edition's
// banner so a shared link reflects whatever the admin uploaded. Note this
// only affects the tag in the live DOM — most chat apps read the raw HTML
// before any JavaScript runs, so for a guaranteed preview image, see the
// README note about public/og-banner.png.
function updateOgImage(url) {
  if (!url) return;
  const tag = document.querySelector('meta[property="og:image"]');
  if (tag) tag.setAttribute('content', url);
}

async function loadEdition() {
  try {
    const { data: edition, error } = await supabaseClient
      .from('editions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !edition) {
      els.editionName.textContent = 'No edition available yet';
      els.statusPill.textContent = 'Check back soon';
      els.submitBtn.disabled = true;
      els.waitlistCard.style.display = 'none';
      return;
    }

    currentEdition = edition;
    els.editionName.textContent = edition.name;

    if (edition.banner_url) {
      els.banner.src = edition.banner_url;
      els.banner.style.display = 'block';
      updateOgImage(edition.banner_url);
    }

    const { count } = await supabaseClient
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('edition_id', edition.id)
      .eq('batch_number', edition.current_batch);

    const filled = count || 0;
    renderTally(filled, edition.batch_size);

    if (edition.completed) {
      els.statusPill.textContent = 'Applications complete';
      els.statusPill.className = 'pill done';
      els.tallyLabel.textContent = `All ${edition.max_batches * edition.batch_size} spots filled for this edition.`;
      els.submitBtn.disabled = true;
      els.submitBtn.textContent = 'Registration complete';
      els.regCard.style.display = 'none';
      els.waitlistCard.style.display = 'none';
    } else if (!edition.is_open) {
      els.statusPill.textContent = `Batch ${edition.current_batch} closed`;
      els.statusPill.className = 'pill closed';
      els.tallyLabel.textContent = 'This batch is full. Please check back when the next batch opens.';
      els.submitBtn.disabled = true;
      els.submitBtn.textContent = 'Batch closed — check back soon';
      els.regCard.style.display = 'none';
      els.waitlistCard.style.display = 'block';
    } else {
      els.statusPill.textContent = `Batch ${edition.current_batch} of ${edition.max_batches} — open`;
      els.statusPill.className = 'pill open';
      els.tallyLabel.textContent = `${filled} of ${edition.batch_size} spots taken in this batch.`;
      els.submitBtn.disabled = false;
      els.submitBtn.textContent = 'Register & get my ticket';
      els.regCard.style.display = 'block';
      els.waitlistCard.style.display = 'none';
    }
  } catch (err) {
    // Network/config error (e.g. missing config.js, paused project) — show
    // something instead of leaving the page stuck on "Loading…" forever.
    els.editionName.textContent = 'Could not load — please refresh';
    els.statusPill.textContent = 'Error';
    els.submitBtn.disabled = true;
    console.error('loadEdition failed:', err);
  }
}

async function uploadPhoto(file) {
  const ext = file.name.split('.').pop();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseClient.storage.from('applicant-photos').upload(path, file, {
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw error;
  const { data } = supabaseClient.storage.from('applicant-photos').getPublicUrl(path);
  return data.publicUrl;
}

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentEdition) return;

  els.submitBtn.disabled = true;
  els.submitBtn.textContent = 'Submitting…';
  showMessage('Submitting your registration — please wait.', 'info');

  try {
    let photoUrl = null;
    const file = els.photo.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Photo must be under 5MB.');
      }
      photoUrl = await uploadPhoto(file);
    }

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        edition_id: currentEdition.id,
        full_name: document.getElementById('full_name').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        department: els.department.value.trim(),
        photo_url: photoUrl,
        website: els.website.value
      })
    });

    const contentType = res.headers.get('Content-Type') || '';

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || 'Registration failed. Please try again.');
    }

    if (contentType.includes('application/pdf')) {
      const ticketCode = res.headers.get('X-Ticket-Code') || '';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ticket.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      const codeLine = ticketCode
        ? `Your ticket code is <strong>${ticketCode}</strong> — save it in case you need to re-download later. <button type="button" class="copy-code-btn" data-code="${ticketCode}">Copy code</button>`
        : '';
      showMessage(`You're registered! Your ticket is downloading now. Keep it safe — you'll need it at the door.<br>${codeLine}`, 'success');
      attachCopyButtons();
      els.form.reset();
      els.photoPreview.style.display = 'none';
    } else {
      const body = await res.json();
      showMessage(`${body.warning} Your ticket code is <strong>${body.ticket_code}</strong> — save it. <button type="button" class="copy-code-btn" data-code="${body.ticket_code}">Copy code</button>`, 'success');
      attachCopyButtons();
      els.form.reset();
      els.photoPreview.style.display = 'none';
    }

    await loadEdition();
  } catch (err) {
    showMessage(err.message || 'Something went wrong. Please try again.', 'error');
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = 'Register & get my ticket';
  }
});

els.waitlistForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentEdition) return;

  els.waitlistBtn.disabled = true;
  els.waitlistBtn.textContent = 'Joining…';

  try {
    const { error } = await supabaseClient.from('waitlist').insert({
      edition_id: currentEdition.id,
      full_name: document.getElementById('wl_name').value.trim(),
      email: document.getElementById('wl_email').value.trim(),
      phone: document.getElementById('wl_phone').value.trim()
    });
    if (error) throw error;

    showWaitlistMessage('You\'re on the waitlist — we\'ll have your details ready when the next batch opens.', 'success');
    els.waitlistForm.reset();
  } catch (err) {
    showWaitlistMessage(err.message || 'Something went wrong. Please try again.', 'error');
  } finally {
    els.waitlistBtn.disabled = false;
    els.waitlistBtn.textContent = 'Join waitlist';
  }
});

loadEdition();

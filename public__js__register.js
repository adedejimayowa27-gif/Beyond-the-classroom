const supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const els = {
  banner: document.getElementById('banner'),
  editionName: document.getElementById('editionName'),
  statusPill: document.getElementById('statusPill'),
  tally: document.getElementById('tally'),
  tallyLabel: document.getElementById('tallyLabel'),
  form: document.getElementById('regForm'),
  submitBtn: document.getElementById('submitBtn'),
  message: document.getElementById('message'),
  photo: document.getElementById('photo')
};

let currentEdition = null;

function showMessage(text, type) {
  els.message.innerHTML = `<div class="message ${type}">${text}</div>`;
}

function renderTally(filledInBatch, batchSize) {
  els.tally.innerHTML = '';
  for (let i = 0; i < batchSize; i++) {
    const mark = document.createElement('div');
    mark.className = 'mark' + (i < filledInBatch ? ' filled' : '');
    els.tally.appendChild(mark);
  }
}

async function loadEdition() {
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
    return;
  }

  currentEdition = edition;
  els.editionName.textContent = edition.name;

  if (edition.banner_url) {
    els.banner.src = edition.banner_url;
    els.banner.style.display = 'block';
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
  } else if (!edition.is_open) {
    els.statusPill.textContent = `Batch ${edition.current_batch} closed`;
    els.statusPill.className = 'pill closed';
    els.tallyLabel.textContent = 'This batch is full. Please check back when the next batch opens.';
    els.submitBtn.disabled = true;
    els.submitBtn.textContent = 'Batch closed — check back soon';
  } else {
    els.statusPill.textContent = `Batch ${edition.current_batch} of ${edition.max_batches} — open`;
    els.statusPill.className = 'pill open';
    els.tallyLabel.textContent = `${filled} of ${edition.batch_size} spots taken in this batch.`;
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = 'Register & get my ticket';
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
        photo_url: photoUrl
      })
    });

    const contentType = res.headers.get('Content-Type') || '';

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || 'Registration failed. Please try again.');
    }

    if (contentType.includes('application/pdf')) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ticket.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      showMessage('You\'re registered! Your ticket is downloading now. Keep it safe — you\'ll need it at the door.', 'success');
      els.form.reset();
    } else {
      const body = await res.json();
      showMessage(`${body.warning} Your ticket code is <strong>${body.ticket_code}</strong> — save it.`, 'success');
      els.form.reset();
    }

    await loadEdition();
  } catch (err) {
    showMessage(err.message || 'Something went wrong. Please try again.', 'error');
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = 'Register & get my ticket';
  }
});

loadEdition();

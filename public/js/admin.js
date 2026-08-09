const supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const loginCard = document.getElementById('loginCard');
const adminArea = document.getElementById('adminArea');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const editionForm = document.getElementById('editionForm');
const editionMessage = document.getElementById('editionMessage');
const editionsList = document.getElementById('editionsList');

function showLoginMsg(text, type) {
  loginMessage.innerHTML = `<div class="message ${type}">${text}</div>`;
}
function showEditionMsg(text, type) {
  editionMessage.innerHTML = `<div class="message ${type}">${text}</div>`;
}

async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    loginCard.style.display = 'none';
    adminArea.style.display = 'block';
    loadEditions();
  } else {
    loginCard.style.display = 'block';
    adminArea.style.display = 'none';
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
  checkSession();
});

editionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('editionName').value.trim();
  const file = document.getElementById('editionBanner').files[0];
  if (!file) return;

  showEditionMsg('Creating edition…', 'info');

  try {
    const ext = file.name.split('.').pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: uploadErr } = await supabaseClient.storage.from('edition-banners').upload(path, file);
    if (uploadErr) throw uploadErr;
    const { data: urlData } = supabaseClient.storage.from('edition-banners').getPublicUrl(path);

    const { error: insertErr } = await supabaseClient.from('editions').insert({
      name,
      banner_url: urlData.publicUrl,
      is_open: true,
      current_batch: 1
    });
    if (insertErr) throw insertErr;

    showEditionMsg('Edition created and Batch 1 is now open.', 'success');
    editionForm.reset();
    loadEditions();
  } catch (err) {
    showEditionMsg(err.message, 'error');
  }
});

async function loadEditions() {
  const { data: editions, error } = await supabaseClient
    .from('editions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    editionsList.innerHTML = `<div class="message error">${error.message}</div>`;
    return;
  }
  if (!editions.length) {
    editionsList.innerHTML = '<p class="hint">No editions yet — create one above.</p>';
    return;
  }

  editionsList.innerHTML = '';
  for (const edition of editions) {
    const { data: regs } = await supabaseClient
      .from('registrations')
      .select('*')
      .eq('edition_id', edition.id)
      .order('created_at', { ascending: false });

    const inCurrentBatch = (regs || []).filter(r => r.batch_number === edition.current_batch).length;

    const div = document.createElement('div');
    div.className = 'edition-item';

    let statusLabel = edition.completed
      ? 'Complete'
      : edition.is_open
        ? `Batch ${edition.current_batch} open — ${inCurrentBatch}/${edition.batch_size}`
        : `Batch ${edition.current_batch} closed`;

    div.innerHTML = `
      <h3>${edition.name}</h3>
      <p class="hint">${statusLabel} · ${edition.total_registered}/${edition.max_batches * edition.batch_size} total registered</p>
      <div class="edition-actions"></div>
      <details style="margin-top:14px;">
        <summary style="cursor:pointer; font-size:13px; color:var(--muted);">View registrations (${regs ? regs.length : 0})</summary>
        <div class="reg-table" style="margin-top:10px;"></div>
      </details>
    `;

    const actions = div.querySelector('.edition-actions');

    if (!edition.completed) {
      if (edition.is_open) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn-danger';
        closeBtn.textContent = 'Close batch now';
        closeBtn.onclick = () => setOpen(edition.id, false);
        actions.appendChild(closeBtn);
      } else {
        const openBtn = document.createElement('button');
        openBtn.className = 'btn-primary';
        openBtn.style.marginTop = '0';
        openBtn.textContent = `Open Batch ${edition.current_batch + 1}`;
        openBtn.onclick = () => openNextBatch(edition);
        actions.appendChild(openBtn);
      }
    }

    const regTable = div.querySelector('.reg-table');
    if (regs && regs.length) {
      regs.forEach(r => {
        const row = document.createElement('div');
        row.className = 'reg-row';
        row.innerHTML = `
          <span>${r.full_name} · Batch ${r.batch_number}</span>
          <span class="code">${r.ticket_code}</span>
        `;
        regTable.appendChild(row);
      });
    } else {
      regTable.innerHTML = '<p class="hint">No registrations yet.</p>';
    }

    editionsList.appendChild(div);
  }
}

async function setOpen(editionId, isOpen) {
  await supabaseClient.from('editions').update({ is_open: isOpen }).eq('id', editionId);
  loadEditions();
}

async function openNextBatch(edition) {
  if (edition.current_batch >= edition.max_batches) {
    alert('This edition has already reached its final batch.');
    return;
  }
  await supabaseClient
    .from('editions')
    .update({ current_batch: edition.current_batch + 1, is_open: true })
    .eq('id', edition.id);
  loadEditions();
}

checkSession();

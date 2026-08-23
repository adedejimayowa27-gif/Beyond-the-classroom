const supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const loginCard = document.getElementById('loginCard');
const adminArea = document.getElementById('adminArea');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const editionForm = document.getElementById('editionForm');
const editionMessage = document.getElementById('editionMessage');
const editionsList = document.getElementById('editionsList');
const statsRow = document.getElementById('statsRow');

function showLoginMsg(text, type) {
  loginMessage.innerHTML = `<div class="message ${type}">${text}</div>`;
}
function showEditionMsg(text, type) {
  editionMessage.innerHTML = `<div class="message ${type}">${text}</div>`;
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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

async function loadStats() {
  const [{ count: totalRegs }, { count: totalCheckedIn }, { count: totalWaitlist }] = await Promise.all([
    supabaseClient.from('registrations').select('id', { count: 'exact', head: true }),
    supabaseClient.from('registrations').select('id', { count: 'exact', head: true }).eq('checked_in', true),
    supabaseClient.from('waitlist').select('id', { count: 'exact', head: true })
  ]);
  statsRow.innerHTML = `
    <strong>${totalRegs || 0}</strong> total registrations across all editions ·
    <strong>${totalCheckedIn || 0}</strong> checked in ·
    <strong>${totalWaitlist || 0}</strong> on waitlists
  `;
}

async function loadEditions() {
  loadStats();

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
    const [{ data: regs }, { data: waitlisters }] = await Promise.all([
      supabaseClient.from('registrations').select('*').eq('edition_id', edition.id).order('created_at', { ascending: false }),
      supabaseClient.from('waitlist').select('*').eq('edition_id', edition.id).order('created_at', { ascending: false })
    ]);

    const inCurrentBatch = (regs || []).filter(r => r.batch_number === edition.current_batch).length;
    const checkedInCount = (regs || []).filter(r => r.checked_in).length;

    const div = document.createElement('div');
    div.className = 'edition-item';

    let statusLabel = edition.completed
      ? 'Complete'
      : edition.is_open
        ? `Batch ${edition.current_batch} open — ${inCurrentBatch}/${edition.batch_size}`
        : `Batch ${edition.current_batch} closed`;

    div.innerHTML = `
      <h3>${edition.name}</h3>
      <p class="hint">${statusLabel} · ${edition.total_registered}/${edition.max_batches * edition.batch_size} total registered · ${checkedInCount} checked in</p>
      <div class="edition-actions"></div>
      <details style="margin-top:14px;">
        <summary style="cursor:pointer; font-size:13px; color:var(--muted);">View registrations (${regs ? regs.length : 0})</summary>
        <div class="edition-actions" style="margin-top:10px;">
          <button type="button" class="btn-secondary export-regs-btn" style="width:auto; flex:none;">Export registrations (CSV)</button>
        </div>
        <div class="reg-table" style="margin-top:10px;"></div>
      </details>
      <details style="margin-top:10px;">
        <summary style="cursor:pointer; font-size:13px; color:var(--muted);">View waitlist (${waitlisters ? waitlisters.length : 0})</summary>
        <div class="edition-actions" style="margin-top:10px;">
          <button type="button" class="btn-secondary export-waitlist-btn" style="width:auto; flex:none;">Export waitlist (CSV)</button>
        </div>
        <div class="reg-table waitlist-table" style="margin-top:10px;"></div>
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

    const regTable = div.querySelector('.reg-table:not(.waitlist-table)');
    if (regs && regs.length) {
      regs.forEach(r => {
        const row = document.createElement('div');
        row.className = 'reg-row';
        const checkedBadge = r.checked_in ? '<span class="badge-checked">Checked in</span>' : '';
        row.innerHTML = `
          <span>${r.full_name} · Batch ${r.batch_number} ${checkedBadge}</span>
          <span class="code">${r.ticket_code}</span>
          <button type="button" class="btn-danger reg-delete-btn" style="width:auto; padding:4px 10px; font-size:12px;" title="Remove this registration">Remove</button>
        `;
        row.querySelector('.reg-delete-btn').onclick = () => deleteRegistration(r, div);
        regTable.appendChild(row);
      });
    } else {
      regTable.innerHTML = '<p class="hint">No registrations yet.</p>';
    }

    const waitlistTable = div.querySelector('.waitlist-table');
    if (waitlisters && waitlisters.length) {
      waitlisters.forEach(w => {
        const row = document.createElement('div');
        row.className = 'reg-row';
        row.innerHTML = `<span>${w.full_name} — ${w.email}</span><span class="code">${w.phone}</span>`;
        waitlistTable.appendChild(row);
      });
    } else {
      waitlistTable.innerHTML = '<p class="hint">Nobody on the waitlist yet.</p>';
    }

    div.querySelector('.export-regs-btn').onclick = () => {
      const rows = [['Full name', 'Email', 'Phone', 'Batch', 'Ticket code', 'Checked in', 'Checked in at', 'Registered at']];
      (regs || []).forEach(r => rows.push([r.full_name, r.email, r.phone, r.batch_number, r.ticket_code, r.checked_in ? 'yes' : 'no', r.checked_in_at || '', r.created_at]));
      downloadCsv(`${edition.name.replace(/[^a-z0-9]+/gi, '-')}-registrations.csv`, rows);
    };
    div.querySelector('.export-waitlist-btn').onclick = () => {
      const rows = [['Full name', 'Email', 'Phone', 'Joined at']];
      (waitlisters || []).forEach(w => rows.push([w.full_name, w.email, w.phone, w.created_at]));
      downloadCsv(`${edition.name.replace(/[^a-z0-9]+/gi, '-')}-waitlist.csv`, rows);
    };

    editionsList.appendChild(div);
  }
}

async function deleteRegistration(registration, editionDiv) {
  if (!confirm(`Remove ${registration.full_name}'s registration? Their ticket code will stop working. This can't be undone.`)) return;
  const { error } = await supabaseClient.from('registrations').delete().eq('id', registration.id);
  if (error) {
    alert(error.message);
    return;
  }
  loadEditions();
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

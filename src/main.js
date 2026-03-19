import './style.css';
import { openDB } from 'idb';
import { login, logout, getSession, isAdmin } from './auth.js';
import {
  getFolders, addFolder, updateFolder, deleteFolder,
  getSets, getSetsByFolder, getSet, addSet, updateSet, deleteSet,
  getCardsBySet, addCard, updateCard, deleteCard
} from './db.js';

// ============================================================
//  STATE
// ============================================================
const state = {
  view: 'dashboard',          // 'dashboard' | 'set' | 'study'
  currentSetId: null,
  currentCards: [],
  studyIndex: 0,
  isFlipped: false,
  // edit tracking
  editFolderId: null,
  editSetId: null,
  editCardId: null,
  // confirm callback
  confirmCallback: null
};

// ============================================================
//  BOOTSTRAP & MIGRATE
// ============================================================
async function init() {
  setupStaticListeners();
  applyAuthUI();
  await migrateFromIndexedDB();
  await renderDashboard();
}

async function migrateFromIndexedDB() {
  try {
    const folders = await getFolders();
    const sets = await getSets();

    // Only migrate if SQLite backend is completely empty
    if (folders.length > 0 || sets.length > 0) return;

    // Connect to the old local IndexedDB
    const db = await openDB('flashflow_db', 3);
    const oldFolders = await db.getAll('folders');
    const oldDecks = await db.getAll('decks');
    const oldCards = await db.getAll('cards');

    // Mappings to link old IDB IDs to new SQLite IDs
    const folderIdMap = {};
    const setIdMap = {};

    console.log("Migrating older local data to SQLite server...");

    for (const f of oldFolders) {
      const newId = await addFolder(f.name);
      folderIdMap[f.id] = newId;
    }

    for (const d of oldDecks) {
      const mappedFolderId = d.folderId ? folderIdMap[d.folderId] : null;
      const newId = await addSet(d.title, mappedFolderId);
      setIdMap[d.id] = newId;
    }

    for (const c of oldCards) {
      const mappedSetId = setIdMap[c.deckId || c.setId];
      if (mappedSetId) {
        await addCard(mappedSetId, c.front, c.back);
      }
    }

    console.log("Migration finished successfully!");
  } catch (error) {
    console.log("No older local data found to migrate.");
  }
}


// ============================================================
//  AUTH UI
// ============================================================
function applyAuthUI() {
  const admin = isAdmin();

  // Admin-only nav items (Desktop & Mobile)
  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !admin));
  document.getElementById('admin-badge').classList.toggle('hidden', !admin);
  document.getElementById('logout-btn').classList.toggle('hidden', !admin);
  document.getElementById('mobile-logout-btn')?.classList.toggle('hidden', !admin);
  document.getElementById('login-nav-btn').classList.toggle('hidden', admin);
  document.getElementById('mobile-login-btn')?.classList.toggle('hidden', admin);
}

// ============================================================
//  VIEW SWITCHER
// ============================================================
function showView(name) {
  state.view = name;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`${name}-view`).classList.remove('hidden');

  const titles = { dashboard: '', set: '', study: 'Study Mode' };
  document.getElementById('view-title').textContent = titles[name] || '';

  // Nav active state (Desktop & Mobile)
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === (name === 'study' ? 'dashboard' : name));
  });
}

// ============================================================
//  DASHBOARD
// ============================================================
async function renderDashboard() {
  showView('dashboard');
  const admin = isAdmin();

  // Render top actions
  const topActions = document.getElementById('top-actions');
  if (admin) {
    topActions.innerHTML = `
      <button class="btn-primary" id="top-new-set">+ New Set</button>
      <button class="glass-btn" id="top-new-folder">
        <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
        New Folder
      </button>
    `;
    document.getElementById('top-new-set').onclick = () => openSetModal();
    document.getElementById('top-new-folder').onclick = () => openFolderModal();
  } else {
    topActions.innerHTML = '';
  }

  const [folders, sets] = await Promise.all([getFolders(), getSets()]);

  // Attach card counts for display
  const allCardsArrays = await Promise.all(sets.map(s => getCardsBySet(s.id)));
  sets.forEach((s, idx) => s.cardCount = allCardsArrays[idx].length);

  // ---- Folders ----
  const foldersSection = document.getElementById('folders-section');
  foldersSection.innerHTML = '';

  for (const folder of folders) {
    const folderSets = sets.filter(s => s.folderId === folder.id);
    const block = document.createElement('div');
    block.className = 'folder-block';
    block.innerHTML = `
      <div class="folder-header">
        <div class="folder-title">
          <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <span>${escHtml(folder.name)}</span>
          <span style="font-size:0.8rem;font-weight:400;color:var(--text-secondary)">${folderSets.length} set${folderSets.length !== 1 ? 's' : ''}</span>
        </div>
        ${admin ? `
        <div class="folder-actions">
          <button class="icon-btn edit-folder" data-id="${folder.id}" title="Rename folder">${iconPencil()}</button>
          <button class="icon-btn danger delete-folder" data-id="${folder.id}" title="Delete folder">${iconTrash()}</button>
        </div>` : ''}
      </div>
      <div class="set-grid" id="folder-grid-${folder.id}">
        ${renderSetCards(folderSets, admin)}
        ${admin ? `<div class="set-card glass-card add-set-btn" data-folder-id="${folder.id}" style="align-items:center;justify-content:center;cursor:pointer;border-style:dashed;color:var(--text-secondary);min-height:120px;">${iconPlus()} <span style="margin-left:.5rem;font-size:.9rem;">Add Set</span></div>` : ''}
      </div>
    `;
    foldersSection.appendChild(block);

    if (admin) {
      block.querySelector('.edit-folder').onclick = () => openFolderModal(folder.id, folder.name);
      block.querySelector('.delete-folder').onclick = () => confirmDelete(`Delete folder "${folder.name}" and all its sets?`, () => deleteFolder(folder.id).then(renderDashboard));
      block.querySelector('.add-set-btn').onclick = () => openSetModal(null, folder.id);
    }
  }

  // Attach set events in folder grids
  foldersSection.querySelectorAll('.set-study-btn').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); startStudy(parseInt(btn.dataset.id)); };
  });
  foldersSection.querySelectorAll('.set-edit-btn').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); const s = sets.find(x => x.id === parseInt(btn.dataset.id)); openSetModal(s.id, s.folderId, s.title); };
  });
  foldersSection.querySelectorAll('.set-delete-btn').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); const s = sets.find(x => x.id === parseInt(btn.dataset.id)); confirmDelete(`Delete set "${s.title}"?`, () => deleteSet(s.id).then(renderDashboard)); };
  });
  foldersSection.querySelectorAll('.set-card[data-set-id]').forEach(card => {
    card.onclick = () => openSetView(parseInt(card.dataset.setId));
  });

  // ---- Unfoldered sets ----
  const unfolderedSection = document.getElementById('unfoldered-section');
  const unfolderedSets = sets.filter(s => s.folderId === null || s.folderId === undefined);

  // Hide heading if empty
  if (folders.length > 0 && unfolderedSets.length === 0) {
    unfolderedSection.classList.add('hidden');
  } else {
    unfolderedSection.classList.remove('hidden');
  }

  const setList = document.getElementById('set-list');
  if (unfolderedSets.length === 0 && !admin) {
    setList.innerHTML = `<div class="empty-state">${iconInbox()}<p>No sets available yet.</p></div>`;
  } else {
    setList.innerHTML = renderSetCards(unfolderedSets, admin);
    if (admin) {
      setList.innerHTML += `<div class="set-card glass-card add-set-btn" data-folder-id="" style="align-items:center;justify-content:center;cursor:pointer;border-style:dashed;color:var(--text-secondary);min-height:120px;">${iconPlus()} <span style="margin-left:.5rem;font-size:.9rem;">Add Set</span></div>`;
      setList.querySelector('.add-set-btn').onclick = () => openSetModal();
    }
    setList.querySelectorAll('.set-study-btn').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); startStudy(parseInt(btn.dataset.id)); };
    });
    setList.querySelectorAll('.set-edit-btn').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); const s = sets.find(x => x.id === parseInt(btn.dataset.id)); openSetModal(s.id, s.folderId, s.title); };
    });
    setList.querySelectorAll('.set-delete-btn').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); const s = sets.find(x => x.id === parseInt(btn.dataset.id)); confirmDelete(`Delete set "${s.title}"?`, () => deleteSet(s.id).then(renderDashboard)); };
    });
    setList.querySelectorAll('.set-card[data-set-id]').forEach(card => {
      card.onclick = () => openSetView(parseInt(card.dataset.setId));
    });
  }
}

function renderSetCards(sets, admin) {
  if (sets.length === 0 && !admin) return `<div class="empty-state" style="grid-column:1/-1">${iconInbox()}<p>No sets here yet.</p></div>`;
  return sets.map(setItem => `
    <div class="set-card glass-card" data-set-id="${setItem.id}" style="cursor:pointer;">
      <div class="set-info">
        <h3>${escHtml(setItem.title)}</h3>
        <div class="card-count" style="margin-top:0">${setItem.cardCount || 0} card${setItem.cardCount !== 1 ? 's' : ''}</div>
      </div>
      <div class="set-footer">
        ${admin ? `
        <div class="action-btns">
          <button class="icon-btn set-edit-btn" data-id="${setItem.id}" title="Edit">${iconPencil()}</button>
          <button class="icon-btn danger set-delete-btn" data-id="${setItem.id}" title="Delete">${iconTrash()}</button>
        </div>` : ''}
        <button class="btn-primary glass-btn set-study-btn" data-id="${setItem.id}" style="font-size:.8rem;padding:.45rem 1rem;">Study</button>
      </div>
    </div>
  `).join('');
}

// ============================================================
//  SET VIEW (Card list)
// ============================================================
async function openSetView(setId) {
  state.currentSetId = setId;
  const [setItem, cards] = await Promise.all([getSet(setId), getCardsBySet(setId)]);
  state.currentCards = cards;

  document.getElementById('set-view-title').textContent = setItem.title;
  document.getElementById('set-view-count').textContent = `${cards.length} card${cards.length !== 1 ? 's' : ''}`;

  // Top action area
  const topActions = document.getElementById('top-actions');
  if (isAdmin()) {
    topActions.innerHTML = `<button class="btn-primary" id="top-add-card">+ Add Card</button>`;
    document.getElementById('top-add-card').onclick = () => openCardModal();
  } else {
    topActions.innerHTML = '';
  }

  renderCardList(cards);
  showView('set');
}

function renderCardList(cards) {
  const list = document.getElementById('cards-list');
  const admin = isAdmin();

  if (cards.length === 0) {
    list.innerHTML = `<div class="empty-state" style="text-align:center;padding:3rem;color:var(--text-secondary)">${iconInbox()}<p>No cards yet.${admin ? ' Click "+ Add Card" to get started.' : ''}</p></div>`;
    return;
  }

  list.innerHTML = cards.map(card => `
    <div class="card-row" data-card-id="${card.id}">
      <div class="card-row-content">
        <div class="card-front">${escHtml(card.front)}</div>
        <div class="card-back">${escHtml(card.back)}</div>
      </div>
      ${admin ? `
      <div class="card-row-actions">
        <button class="icon-btn edit-card-btn" data-id="${card.id}" title="Edit">${iconPencil()}</button>
        <button class="icon-btn danger delete-card-btn" data-id="${card.id}" title="Delete">${iconTrash()}</button>
      </div>` : ''}
    </div>
  `).join('');

  const studyBtn = document.createElement('div');
  studyBtn.style.cssText = 'display:flex;justify-content:center;margin-top:1.5rem;';
  studyBtn.innerHTML = `<button class="btn-primary" id="start-study-from-set">Study This Set</button>`;
  list.appendChild(studyBtn);
  document.getElementById('start-study-from-set').onclick = () => startStudy(state.currentSetId);

  if (admin) {
    list.querySelectorAll('.edit-card-btn').forEach(btn => {
      btn.onclick = () => {
        const card = state.currentCards.find(c => c.id === parseInt(btn.dataset.id));
        openCardModal(card.id, card.front, card.back);
      };
    });
    list.querySelectorAll('.delete-card-btn').forEach(btn => {
      btn.onclick = () => confirmDelete('Delete this card?', async () => {
        await deleteCard(parseInt(btn.dataset.id));
        const updated = await getCardsBySet(state.currentSetId);
        state.currentCards = updated;
        document.getElementById('set-view-count').textContent = `${updated.length} card${updated.length !== 1 ? 's' : ''}`;
        renderCardList(updated);
      });
    });
  }
}

// ============================================================
//  STUDY SESSION
// ============================================================
async function startStudy(setId) {
  const [setItem, cards] = await Promise.all([getSet(setId), getCardsBySet(setId)]);
  if (!cards.length) { return showToast('This set has no cards yet!'); }

  state.currentSetId = setId;
  state.currentCards = [...cards].sort(() => Math.random() - 0.5);
  state.studyIndex = 0;
  state.isFlipped = false;

  document.getElementById('study-set-title').textContent = setItem.title;
  document.getElementById('top-actions').innerHTML = '';
  renderStudyCard();
  showView('study');
}

function renderStudyCard() {
  const card = state.currentCards[state.studyIndex];
  const total = state.currentCards.length;

  document.getElementById('card-front-text').textContent = card.front;
  document.getElementById('card-back-text').textContent = card.back;
  document.getElementById('study-progress-text').textContent = `${state.studyIndex + 1} / ${total}`;
  document.getElementById('study-progress-bar').style.width = `${((state.studyIndex + 1) / total) * 100}%`;

  const fc = document.getElementById('main-flashcard');
  fc.classList.remove('flipped');
  state.isFlipped = false;
}

// ============================================================
//  MODALS
// ============================================================

// --- Login Modal ---
function openLoginModal() {
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').classList.add('hidden');
  document.getElementById('login-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('login-email').focus(), 50);
}

function closeLoginModal() {
  document.getElementById('login-overlay').classList.add('hidden');
}

// --- Folder Modal ---
function openFolderModal(id = null, name = '') {
  state.editFolderId = id;
  document.getElementById('folder-modal-title').textContent = id ? 'Rename Folder' : 'New Folder';
  document.getElementById('folder-name-input').value = name;
  document.getElementById('folder-modal-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('folder-name-input').focus(), 50);
}

function closeFolderModal() {
  document.getElementById('folder-modal-overlay').classList.add('hidden');
  state.editFolderId = null;
}

async function saveFolderModal() {
  const name = document.getElementById('folder-name-input').value.trim();
  if (!name) return;
  if (state.editFolderId) {
    await updateFolder(state.editFolderId, name);
  } else {
    await addFolder(name);
  }
  closeFolderModal();
  renderDashboard();
}

// --- Set Modal ---
async function openSetModal(id = null, folderId = null, title = '') {
  state.editSetId = id;
  document.getElementById('set-modal-title').textContent = id ? 'Edit Set' : 'New Set';
  document.getElementById('set-title-input').value = title;

  // Populate folder select
  const folders = await getFolders();
  const sel = document.getElementById('set-folder-select');
  sel.innerHTML = `<option value="">— No Folder —</option>` +
    folders.map(f => `<option value="${f.id}" ${f.id === folderId ? 'selected' : ''}>${escHtml(f.name)}</option>`).join('');

  if (folderId) sel.value = folderId;

  document.getElementById('set-modal-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('set-title-input').focus(), 50);
}

function closeSetModal() {
  document.getElementById('set-modal-overlay').classList.add('hidden');
  state.editSetId = null;
}

async function saveSetModal() {
  const title = document.getElementById('set-title-input').value.trim();
  if (!title) return;
  const sel = document.getElementById('set-folder-select');
  const folderId = sel.value ? parseInt(sel.value) : null;

  if (state.editSetId) {
    await updateSet(state.editSetId, title, folderId);
  } else {
    await addSet(title, folderId);
  }
  closeSetModal();
  renderDashboard();
}

// --- Card Modal ---
function openCardModal(id = null, front = '', back = '') {
  state.editCardId = id;
  document.getElementById('card-modal-title').textContent = id ? 'Edit Card' : 'Add Card';
  document.getElementById('card-front-input').value = front;
  document.getElementById('card-back-input').value = back;
  document.getElementById('card-modal-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('card-front-input').focus(), 50);
}

function closeCardModal() {
  document.getElementById('card-modal-overlay').classList.add('hidden');
  state.editCardId = null;
}

async function saveCardModal() {
  const front = document.getElementById('card-front-input').value.trim();
  const back = document.getElementById('card-back-input').value.trim();

  if (!front || !back) {
    alert("Please enter both a Term and a Definition.");
    return;
  }

  if (state.editCardId) {
    await updateCard(state.editCardId, front, back);
    showToast('Card updated successfully!');
  } else {
    await addCard(state.currentSetId, front, back);
    showToast('Card added successfully!');
  }
  closeCardModal();

  const updated = await getCardsBySet(state.currentSetId);
  state.currentCards = updated;
  document.getElementById('set-view-count').textContent = `${updated.length} card${updated.length !== 1 ? 's' : ''}`;
  renderCardList(updated);
}

// --- Confirm Modal ---
function confirmDelete(msg, callback) {
  state.confirmCallback = callback;
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-overlay').classList.remove('hidden');
}

function closeConfirm() {
  document.getElementById('confirm-overlay').classList.add('hidden');
  state.confirmCallback = null;
}

// ============================================================
//  TOAST
// ============================================================
function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', bottom: '2rem', right: '2rem',
    background: 'rgba(124,109,255,0.9)', color: 'white',
    padding: '0.75rem 1.5rem', borderRadius: '10px',
    fontFamily: 'inherit', fontSize: '0.9rem',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    zIndex: '999', animation: 'fadeUp 0.3s ease'
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

// ============================================================
//  STATIC EVENT LISTENERS
// ============================================================
function setupStaticListeners() {
  // ---- Nav items (sidebar) ----
  document.getElementById('nav-dashboard').onclick = () => renderDashboard();
  document.getElementById('nav-new-set').onclick = () => openSetModal();
  document.getElementById('nav-new-folder').onclick = () => openFolderModal();
  document.getElementById('login-nav-btn').onclick = () => openLoginModal();

  document.getElementById('logout-btn').onclick = () => {
    logout();
    applyAuthUI();
    renderDashboard();
  };

  // ---- Mobile Navigation ----
  document.getElementById('mobile-new-set').onclick = () => openSetModal();
  document.getElementById('mobile-new-folder').onclick = () => openFolderModal();
  document.getElementById('mobile-login-btn').onclick = () => openLoginModal();
  document.getElementById('mobile-logout-btn').onclick = () => {
    logout();
    applyAuthUI();
    renderDashboard();
  };
  document.getElementById('back-to-dashboard').onclick = () => renderDashboard();
  document.getElementById('back-from-study').onclick = () => {
    if (state.view === 'study' && state.currentSetId) {
      openSetView(state.currentSetId);
    } else {
      renderDashboard();
    }
  };

  // ---- Login modal ----
  document.getElementById('login-btn').onclick = async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const result = login(email, password);
    if (result.success) {
      closeLoginModal();
      applyAuthUI();
      renderDashboard();
    } else {
      const err = document.getElementById('login-error');
      err.textContent = result.error;
      err.classList.remove('hidden');
    }
  };

  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-btn').click();
  });

  document.getElementById('login-cancel').onclick = closeLoginModal;
  document.getElementById('login-overlay').onclick = (e) => { if (e.target === e.currentTarget) closeLoginModal(); };

  // ---- Folder modal ----
  document.getElementById('folder-modal-save').onclick = saveFolderModal;
  document.getElementById('folder-modal-cancel').onclick = closeFolderModal;
  document.getElementById('folder-modal-overlay').onclick = (e) => { if (e.target === e.currentTarget) closeFolderModal(); };
  document.getElementById('folder-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') saveFolderModal(); });

  // ---- Set modal ----
  document.getElementById('set-modal-save').onclick = saveSetModal;
  document.getElementById('set-modal-cancel').onclick = closeSetModal;
  document.getElementById('set-modal-overlay').onclick = (e) => { if (e.target === e.currentTarget) closeSetModal(); };

  // ---- Card modal ----
  document.getElementById('card-modal-save').onclick = saveCardModal;
  document.getElementById('card-modal-cancel').onclick = closeCardModal;
  document.getElementById('card-modal-overlay').onclick = (e) => { if (e.target === e.currentTarget) closeCardModal(); };

  // ---- Confirm ----
  document.getElementById('confirm-yes').onclick = async () => {
    if (state.confirmCallback) await state.confirmCallback();
    closeConfirm();
  };
  document.getElementById('confirm-no').onclick = closeConfirm;
  document.getElementById('confirm-overlay').onclick = (e) => { if (e.target === e.currentTarget) closeConfirm(); };

  // ---- Flashcard ----
  document.getElementById('main-flashcard').onclick = () => {
    state.isFlipped = !state.isFlipped;
    document.getElementById('main-flashcard').classList.toggle('flipped', state.isFlipped);
  };

  document.getElementById('next-card').onclick = () => {
    if (state.studyIndex < state.currentCards.length - 1) {
      state.studyIndex++;
      renderStudyCard();
    } else {
      showToast('🎉 Session complete! Great work!');
      openSetView(state.currentSetId);
    }
  };

  document.getElementById('prev-card').onclick = () => {
    if (state.studyIndex > 0) {
      state.studyIndex--;
      renderStudyCard();
    }
  };
}

// ============================================================
//  ICON HELPERS (inline SVG snippets)
// ============================================================
const iconPencil = () => `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const iconTrash = () => `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const iconPlus = () => `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;
const iconInbox = () => `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:48px;height:48px;opacity:0.25;display:block;margin:0 auto 1rem"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`;

const escHtml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ============================================================
//  START
// ============================================================
init();

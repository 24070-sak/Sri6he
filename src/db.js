// Replaced IndexedDB with a standard backend REST API integration to stock data forever in an SQL database!

const API = '/api';

async function request(url, method = 'GET', body = null) {
    const options = { method, headers: {} };
    if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }
    const res = await fetch(API + url, options);
    if (!res.ok) throw new Error('API request failed');
    return res.json();
}

// --- Folder Operations ---
export async function getFolders() {
    return request('/folders');
}

export async function addFolder(name) {
    const r = await request('/folders', 'POST', { name, createdAt: Date.now() });
    return r.id;
}

export async function updateFolder(id, name) {
    return request(`/folders/${id}`, 'PUT', { name });
}

export async function deleteFolder(id) {
    return request(`/folders/${id}`, 'DELETE');
}

// --- Set Operations ---
export async function getSets() {
    return request('/sets');
}

export async function getSetsByFolder(folderId) {
    return request(`/sets/folder/${folderId}`);
}

export async function getSet(id) {
    return request(`/sets/${id}`);
}

export async function addSet(title, folderId) {
    const r = await request('/sets', 'POST', { title, folderId, createdAt: Date.now() });
    return r.id;
}

export async function updateSet(id, title, folderId) {
    return request(`/sets/${id}`, 'PUT', { title, folderId });
}

export async function deleteSet(id) {
    return request(`/sets/${id}`, 'DELETE');
}

// --- Card Operations ---
export async function getCardsBySet(setId) {
    return request(`/cards/set/${setId}`);
}

export async function addCard(setId, front, back) {
    const r = await request('/cards', 'POST', { setId, front, back, createdAt: Date.now() });
    return r.id;
}

export async function updateCard(id, front, back) {
    return request(`/cards/${id}`, 'PUT', { front, back });
}

export async function deleteCard(id) {
    return request(`/cards/${id}`, 'DELETE');
}

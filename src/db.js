import { openDB } from 'idb';

const DB_NAME = 'flashflow_db';
const DB_VERSION = 3; // Bump version to handle restoring the old schema securely

let dbPromise;

export function getDb() {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion, newVersion, transaction) {
                // Keep folders
                if (!db.objectStoreNames.contains('folders')) {
                    const folderStore = db.createObjectStore('folders', { keyPath: 'id', autoIncrement: true });
                    folderStore.createIndex('name', 'name');
                }

                // We revert internal usage to 'decks', to restore user data
                if (!db.objectStoreNames.contains('decks')) {
                    const deckStore = db.createObjectStore('decks', { keyPath: 'id', autoIncrement: true });
                    deckStore.createIndex('folderId', 'folderId');
                }

                // Cards store
                if (!db.objectStoreNames.contains('cards')) {
                    const cardStore = db.createObjectStore('cards', { keyPath: 'id', autoIncrement: true });
                    cardStore.createIndex('deckId', 'deckId');
                } else {
                    // Restore deckId index if it was removed in v2
                    const cardStore = transaction.objectStore('cards');
                    if (!cardStore.indexNames.contains('deckId')) {
                        cardStore.createIndex('deckId', 'deckId');
                    }
                }
            }
        });
    }
    return dbPromise;
}

// --- Folder Operations ---
export async function getFolders() {
    const db = await getDb();
    return db.getAll('folders');
}

export async function addFolder(name) {
    const db = await getDb();
    return db.add('folders', { name, createdAt: Date.now() });
}

export async function updateFolder(id, name) {
    const db = await getDb();
    const folder = await db.get('folders', id);
    if (!folder) return;
    folder.name = name;
    return db.put('folders', folder);
}

export async function deleteFolder(id) {
    const db = await getDb();
    // Cascade delete sets and their cards
    const sets = await getSetsByFolder(id);
    for (const setItem of sets) {
        await deleteSet(setItem.id);
    }
    return db.delete('folders', id);
}

// --- Set Operations (Internally uses 'decks' to retrieve old data) ---
export async function getSets() {
    const db = await getDb();
    return db.getAll('decks');
}

export async function getSetsByFolder(folderId) {
    const db = await getDb();
    return db.getAllFromIndex('decks', 'folderId', folderId);
}

export async function getSet(id) {
    const db = await getDb();
    return db.get('decks', id);
}

export async function addSet(title, folderId) {
    const db = await getDb();
    return db.add('decks', { title, folderId: folderId || null, createdAt: Date.now() });
}

export async function updateSet(id, title, folderId) {
    const db = await getDb();
    const setItem = await db.get('decks', id);
    if (!setItem) return;
    setItem.title = title;
    setItem.folderId = folderId !== undefined ? folderId : setItem.folderId;
    return db.put('decks', setItem);
}

export async function deleteSet(id) {
    const db = await getDb();
    // Cascade delete cards
    const cards = await getCardsBySet(id);
    for (const card of cards) {
        await db.delete('cards', card.id);
    }
    return db.delete('decks', id);
}

// --- Card Operations ---
export async function getCardsBySet(setId) {
    const db = await getDb();
    return db.getAllFromIndex('cards', 'deckId', setId);
}

export async function addCard(setId, front, back) {
    const db = await getDb();
    return db.add('cards', { deckId: setId, front, back, createdAt: Date.now() });
}

export async function updateCard(id, front, back) {
    const db = await getDb();
    const card = await db.get('cards', id);
    if (!card) return;
    card.front = front;
    card.back = back;
    return db.put('cards', card);
}

export async function deleteCard(id) {
    const db = await getDb();
    return db.delete('cards', id);
}

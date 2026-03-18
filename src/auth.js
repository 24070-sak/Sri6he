// Admin credentials (single hardcoded admin)
const ADMIN_EMAIL = '24070@supnum.mr';
const ADMIN_PASSWORD = 'admin sak';
const SESSION_KEY = 'flashflow_session';

export function login(email, password) {
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        const session = { isAdmin: true, email, loggedInAt: Date.now() };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return { success: true, session };
    }
    return { success: false, error: 'Invalid email or password.' };
}

export function logout() {
    localStorage.removeItem(SESSION_KEY);
}

export function getSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

export function isAdmin() {
    const session = getSession();
    return session?.isAdmin === true;
}

const pool = require('./db.js');

async function uporabnikObstaja(Uporabnisko_ime_upor) {
    try {
        if (!Uporabnisko_ime_upor) return false;
        const [rows] = await pool.execute(
            'SELECT Uporabnisko_ime FROM uporabniki WHERE Uporabnisko_ime = ?',
            [Uporabnisko_ime_upor]
        );
        return rows.length > 0;
    } catch (err) {
        console.error('Database error in uporabnikObstaja:', err);
        throw err;
    }
}

async function frizerObstaja(Uporabnisko_ime_friz) {
    try {
        if (!Uporabnisko_ime_friz) return false;
        const [rows] = await pool.execute(
            'SELECT Uporabnisko_ime FROM frizerji WHERE Uporabnisko_ime = ?',
            [Uporabnisko_ime_friz]
        );
        return rows.length > 0;
    } catch (err) {
        console.error('Database error in frizerObstaja:', err);
        throw err;
    }
}

/**
 * urlVira(reqOrPath, optionalPath)
 * - če je prvi argument objekt req, sestavi URL iz req
 * - če je prvi argument absolutni URL (http(s)://...), ga uporabi kot base url
 * - sicer uporabi process.env.BASE_URL ali privzeti localhost kot base url
 * Vedno vrne absolutni URL.
 */
function urlVira(reqOrPath, optionalPath) {
    // helper: normalize join of base + path
    const join = (base, path) => {
        const b = base.replace(/\/+$/, ''); // remove trailing slashes
        if (!path) return b;
        const p = path.startsWith('/') ? path : '/' + path;
        return b + p;
    };

    // če je req objekt
    if (reqOrPath && typeof reqOrPath.get === 'function' && reqOrPath.protocol) {
        const base = `${reqOrPath.protocol}://${reqOrPath.get('host')}`;
        return join(base, optionalPath ?? '');
    }

    // če je absolutni URL (base)
    const firstIsString = typeof reqOrPath === 'string';
    const firstIsAbsolute = firstIsString && /^https?:\/\//i.test(reqOrPath);

    if (firstIsAbsolute) {
        return join(reqOrPath, optionalPath ?? '');
    }

    // sicer uporabi BASE_URL iz .env ali privzeti localhost
    const base = process.env.BASE_URL || 'http://localhost:3000';
    const path = optionalPath ?? (firstIsString ? reqOrPath : '');
    return join(base, path);
}

module.exports = {
    uporabnikObstaja,
    frizerObstaja,
    urlVira
};
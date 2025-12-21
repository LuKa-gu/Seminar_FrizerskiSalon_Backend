const pool = require('./db.js');

async function uporabnikObstaja(Uporabnisko_ime_upor) {
    if (!Uporabnisko_ime_upor) return false;
    const [rows] = await pool.execute(
        'SELECT Uporabnisko_ime FROM uporabniki WHERE Uporabnisko_ime = ?',
        [Uporabnisko_ime_upor]
    );
    return rows.length > 0;
}

async function frizerObstaja(Uporabnisko_ime_friz) {
    if (!Uporabnisko_ime_friz) return false;
    const [rows] = await pool.execute(
        'SELECT Uporabnisko_ime FROM frizerji WHERE Uporabnisko_ime = ?',
        [Uporabnisko_ime_friz]
    );
    return rows.length > 0;
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

    // prvi argument je req objekt
    if (reqOrPath && typeof reqOrPath.get === 'function' && reqOrPath.protocol) {
        const base = `${reqOrPath.protocol}://${reqOrPath.get('host')}`;
        return join(base, optionalPath ?? '');
    }

    const firstIsString = typeof reqOrPath === 'string';
    const firstIsAbsolute = firstIsString && /^https?:\/\//i.test(reqOrPath);

    // prvi argument je absolutni URL (base)
    if (firstIsAbsolute) {
        return join(reqOrPath, optionalPath ?? '');
    }

    // sicer uporabi BASE_URL ali privzeti localhost
    const base = process.env.BASE_URL || 'http://localhost:3000';
    const path = optionalPath ?? (firstIsString ? reqOrPath : '');
    return join(base, path);
}

module.exports = {
    uporabnikObstaja,
    frizerObstaja,
    urlVira
};
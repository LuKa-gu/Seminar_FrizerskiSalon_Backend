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

function createSlug(naziv) {
    return naziv
        .toLowerCase()
        .normalize('NFD') // razdeli črke in diakritične znake
        .replace(/[\u0300-\u036f]/g, '') // odstrani diakritične znake
        .replace(/\s+/g, '-') // presledke zamenja z "-"
        .replace(/[^a-z0-9-]/g, ''); // odstrani ostale posebne znake
}

// Naziv je v URL-ju kot /:id-slug
// Slug je formatiran naziv za boljšo berljivost URL-ja
// Iz URL-ja vzamemo samo ID za poizvedbo v bazi
async function resolveStoritev(req, res, next) {
    try {
        const { naziv } = req.params;
    
        // dovolimo: ena ali več številk + "-" + ena ali več besed iz malih črk (in dodatni "-")
        const match = naziv.match(/^(\d+)-([a-z]+(?:-[a-z]+)*)$/i);
    
        if (!match) {
            return res.status(400).json({
            message: 'Neveljaven format naziva storitve. Pričakovan format je id-slug.'
            });
        }
    
        const ID = Number(match[1]); // vzame samo ID
    
        const [rows] = await pool.execute('SELECT * FROM storitve WHERE ID = ?', [ID]);
            
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Storitev ne obstaja.' });
        }
    
        req.storitev = rows[0];
        next();
    } catch (err) {
        next(err);
    }
}

function casVMinute(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

function minuteVCas(minutes) {
    const h = String(Math.floor(minutes / 60)).padStart(2, '0');
    const m = String(minutes % 60).padStart(2, '0');
    return `${h}:${m}`;
}

function izracunajProsteBloke(delovniCas, rezervacije) {
    let bloki = delovniCas.map(dc => ({
        start: casVMinute(dc.Zacetek),
        end: casVMinute(dc.Konec)
    }));

    for (const rez of rezervacije) {
        const rezStart = casVMinute(rez.zacetek);
        const rezEnd = casVMinute(rez.konec);

        bloki = bloki.flatMap(blok => {
            if (rezEnd <= blok.start || rezStart >= blok.end) {
                return [blok];
            }

            const novi = [];
            if (rezStart > blok.start) {
                novi.push({ start: blok.start, end: rezStart });
            }
            if (rezEnd < blok.end) {
                novi.push({ start: rezEnd, end: blok.end });
            }
            return novi;
        });
    }

    return bloki;
}

function razpolozljiviBloki(bloki, trajanje) {
    return bloki
        .filter(b => (b.end - b.start) >= trajanje)
        .map(b => ({
            od: minuteVCas(b.start),
            do: minuteVCas(b.end - trajanje)
        }));
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
    createSlug,
    resolveStoritev,
    izracunajProsteBloke,
    razpolozljiviBloki,
    urlVira
};
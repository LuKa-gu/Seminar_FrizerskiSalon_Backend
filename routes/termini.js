const express = require('express');
const router = express.Router();
const pool = require('../utils/db.js');
const utils = require('../utils/utils.js');
const auth = require('../utils/auth.js');

/**
 * @swagger
 * /termini/razpolozljivost:
 *   post:
 *     summary: Preverjanje razpoložljivosti termina
 *     description: |
 *       Vrne seznam možnih začetnih ur termina za izbranega frizerja, dan in kombinacijo storitev.
 *       Sistem upošteva delovni čas frizerja, trajanje izbranih storitev ter že obstoječe rezervacije.
 *       Endpoint ne ustvarja rezervacije, ampak služi izključno informativnemu preverjanju.
 *     tags:
 *       - Termini
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - frizer_ID
 *               - dan
 *               - storitve
 *             properties:
 *               frizer_ID:
 *                 type: integer
 *                 example: 3
 *                 description: Enolični ID izbranega frizerja
 *               dan:
 *                 type: string
 *                 format: date
 *                 example: 2025-06-10
 *                 description: Datum, za katerega se preverja razpoložljivost (YYYY-MM-DD)
 *               storitve:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: integer
 *                   example: 1
 *                 description: Seznam ID-jev izbranih storitev
 *     responses:
 *       200:
 *         description: Uspešno preverjena razpoložljivost
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 trajanje:
 *                   type: integer
 *                   example: 90
 *                   description: Skupno trajanje izbranih storitev (v minutah)
 *                 moznosti:
 *                   type: array
 *                   items:
 *                     type: string
 *                     example: "10:00"
 *                   description: Seznam možnih začetnih ur termina
 *                 razlog:
 *                   type: string
 *                   nullable: true
 *                   example: Frizer ne dela ta dan.
 *                   description: Razlog, zakaj ni razpoložljivih terminov (če jih ni)
 *       400:
 *         description: Neveljavni ali manjkajoči podatki
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Manjkajoči podatki.
 *       401:
 *         description: Neavtenticiran uporabnik
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ni tokena ali je neveljaven ali potekel.
 *       403:
 *         description: Uporabnik nima ustreznih pravic
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Dostop zavrnjen. Ni dovoljeno za vašo vlogo.
 *       404:
 *         description: Frizer ne obstaja
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Izbrani frizer ne obstaja.
 *       500:
 *         description: Napaka na strežniku
 */
router.post('/razpolozljivost', auth.avtentikacijaJWT, auth.dovoliRole('uporabnik'), async (req, res) => {
    try {
        const { frizer_ID, dan, storitve } = req.body;

        if (!frizer_ID || !dan || !Array.isArray(storitve) || storitve.length === 0) {
            return res.status(400).json({ message: 'Manjkajoči podatki.' });
        }

        // Preveri, ali frizer obstaja
        const [[frizer]] = await pool.query(`
            SELECT ID 
            FROM frizerji 
            WHERE ID = ?`,
            [frizer_ID]);

        if (!frizer) {
            return res.status(404).json({ message: 'Izbrani frizer ne obstaja.' });
        }

        // Preveri, ali frizer izvaja izbrane storitve
        const [frizer_storitve] = await pool.query(`
            SELECT s.ID 
            FROM storitve s
            JOIN specializacija sp ON s.Ime = sp.Naziv
            WHERE sp.Frizerji_id = ? AND s.ID IN (?)`,
            [frizer_ID, storitve]
        );

        if (frizer_storitve.length !== storitve.length) {
            return res.status(400).json({ message: 'Frizer ne izvaja vseh izbranih storitev.' });
        }

        // Izračunaj skupno trajanje storitev
        const [[{ trajanje }]] = await pool.query(`
            SELECT SUM(Trajanje) AS trajanje
            FROM storitve
            WHERE ID IN (?)`,
            [storitve]
        );

        if (!trajanje) {
            return res.status(400).json({ message: 'Neveljavne storitve.' });
        }

        // Pridobi delovni čas
        const [delovnik] = await pool.query(`
            SELECT Zacetek, Konec
            FROM delovnik
            WHERE Frizerji_id = ? AND Dan = ?`,
            [frizer_ID, dan]
        );

        if (delovnik.length === 0) {
            return res.json({ trajanje, moznosti: [], razlog: 'Frizer ne dela ta dan.' });
        }

        // Pridobi obstoječe rezervacije + njihovo trajanje
        const [rezervacije] = await pool.query(`
            SELECT 
                TIME(t.Cas_termina) AS zacetek,
                ADDTIME(
                    TIME(t.Cas_termina),
                    SEC_TO_TIME(SUM(s.Trajanje) * 60)
                ) AS konec
            FROM termini t
            JOIN termini_storitve ts ON t.ID = ts.Termini_id
            JOIN storitve s ON ts.Storitve_id = s.ID
            WHERE t.Frizerji_id = ?
              AND DATE(t.Cas_termina) = ?
              AND t.Status = 'Rezervirano'
            GROUP BY t.ID`,
            [frizer_ID, dan]
        );

        // Izračunaj proste bloke
        const prostiBloki = utils.izracunajProsteBloke(delovnik, rezervacije);

        // Izračunaj možne začetke
        const moznosti = utils.mozniZacetki(prostiBloki, trajanje);

        res.json({
            trajanje,
            moznosti
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Napaka pri preverjanju razpoložljivosti.' });
    }
});

/**
 * @swagger
 * /termini/predogled:
 *   post:
 *     summary: Predogled rezervacije termina
 *     description: |
 *       Omogoča uporabniku, da pred potrditvijo rezervacije še enkrat preveri izbrane podatke.
 *       Sistem vrne povzetek: frizer, izbrane storitve, skupno ceno in trajanje, morebitne opombe, ter datum in čas termina.
 *     tags:
 *       - Termini
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - frizer_ID
 *               - dan
 *               - ura
 *               - storitve
 *             properties:
 *               frizer_ID:
 *                 type: integer
 *                 example: 3
 *                 description: Enolični ID izbranega frizerja
 *               dan:
 *                 type: string
 *                 format: date
 *                 example: 2025-01-23
 *                 description: Datum termina (YYYY-MM-DD)
 *               ura:
 *                 type: string
 *                 example: "15:00"
 *                 description: Začetna ura termina (HH:mm)
 *               storitve:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: integer
 *                   example: 1
 *                 description: Seznam ID-jev izbranih storitev
 *               opombe:
 *                 type: string
 *                 nullable: true
 *                 example: Prosim krajše ob straneh
 *                 description: Dodatne opombe uporabnika (neobvezno)
 *     responses:
 *       200:
 *         description: Povzetek termina pripravljen
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 frizer:
 *                   type: string
 *                   example: Ana Novak
 *                 storitve:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       naziv:
 *                         type: string
 *                         example: Striženje
 *                       trajanje:
 *                         type: integer
 *                         example: 30
 *                       cena:
 *                         type: number
 *                         example: 15
 *                 zacetek_termina:
 *                   type: string
 *                   example: 2025-06-10 14:00:00
 *                 konec_termina:
 *                   type: string
 *                   example: 2025-06-10 15:15:00
 *                 skupno_trajanje:
 *                   type: integer
 *                   example: 75
 *                 skupna_cena:
 *                   type: number
 *                   example: 45
 *                 opombe:
 *                   type: string
 *                   nullable: true
 *                   example: Prosim krajše ob straneh
 *       400:
 *         description: Neveljavni ali manjkajoči podatki
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Manjkajoči podatki za rezervacijo.
 *       401:
 *         description: Neavtenticiran uporabnik
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ni tokena ali je neveljaven ali potekel.
 *       403:
 *         description: Uporabnik nima ustreznih pravic
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Dostop zavrnjen. Ni dovoljeno za vašo vlogo.
 *       404:
 *         description: Frizer ne obstaja
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Frizer ne obstaja.
 *       409:
 *         description: Frizer ali termin ni na voljo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Izbrani termin ni na voljo.
 *       500:
 *         description: Napaka na strežniku
 */
router.post('/predogled', auth.avtentikacijaJWT, auth.dovoliRole('uporabnik'), async (req, res) => {
    try {
        const { frizer_ID, dan, ura, storitve, opombe } = req.body;

        if (!frizer_ID || !dan || !ura || !Array.isArray(storitve) || storitve.length === 0) {
            return res.status(400).json({ message: 'Manjkajoči podatki za rezervacijo.' });
        }

        const cas_termina = `${dan} ${ura}:00`;

        // Frizer
        const [[frizer]] = await pool.query(`
            SELECT Ime, Priimek 
            FROM frizerji 
            WHERE ID = ?`,
            [frizer_ID]);

        if (!frizer) {
            return res.status(404).json({ message: 'Izbrani frizer ne obstaja.' });
        }

        // Storitve
        const [storitveRows] = await pool.query(`
            SELECT ID, Ime, Cena, Trajanje 
            FROM storitve 
            WHERE ID IN (?)`,
            [storitve]);

        if (storitveRows.length !== storitve.length) {
            return res.status(400).json({ message: 'Navedene storitve niso veljavne.' });
        }

        // Izračunaj skupno trajanje in ceno storitev
        const [[row]] = await pool.query(`
            SELECT 
             SUM(s.Cena) AS skupna_cena,
             SUM(s.Trajanje) AS skupno_trajanje
            FROM storitve s
            WHERE s.ID IN (?)`,
            [storitve]);

        const skupna_cena = Number(row.skupna_cena);
        const skupno_trajanje = Number(row.skupno_trajanje);

        if (!skupno_trajanje || !skupna_cena) {
            return res.status(400).json({ message: 'Navedene storitve niso veljavne.' });
        }

        // Preveri, ali frizer izvaja izbrane storitve
        const [frizer_storitve] = await pool.query(`
            SELECT s.ID 
            FROM storitve s
            JOIN specializacija sp ON s.Ime = sp.Naziv 
            WHERE sp.Frizerji_id = ? AND s.ID IN (?)`,
            [frizer_ID, storitve]);

        if (frizer_storitve.length !== storitve.length) {
            return res.status(400).json({ message: 'Frizer ne izvaja vseh izbranih storitev.' });
        }

        // Preveri, ali frizer dela v izbranem terminu
        const [delovnik] = await pool.query(`
            SELECT * FROM delovnik 
            WHERE Frizerji_id = ? 
            AND Dan = ? 
            AND ? BETWEEN Zacetek AND Konec`,
            [frizer_ID, dan, ura]);

        if (delovnik.length === 0) {
            return res.status(409).json({ message: 'Frizer v izbranem terminu ni na voljo.' });
        }

        // Preveri zasedenost termina
        const [zasedeni] = await pool.query(`
            SELECT ID FROM termini WHERE
            Frizerji_id = ? AND
            Status = 'Rezervirano' AND
            (Cas_termina < DATE_ADD(?, INTERVAL ? MINUTE) AND
            DATE_ADD(Cas_termina, INTERVAL ? MINUTE) > ?)`,
            [frizer_ID, cas_termina, skupno_trajanje, skupno_trajanje, cas_termina]);

        if (zasedeni.length) {
            return res.status(409).json({ message: 'Izbrani termin ni na voljo.' });
        }

        // Izračun konca termina
        const [[konec]] = await pool.query(`
            SELECT DATE_ADD(?, INTERVAL ? MINUTE) AS konec_termina`,
            [cas_termina, skupno_trajanje]);

        // Povzetek rezervacije
        res.json({
            frizer: `${frizer.Ime} ${frizer.Priimek}`,
            storitve: storitveRows.map(s => ({ 
                id: s.ID, 
                naziv: s.Ime,  
                trajanje: s.Trajanje,
                cena: s.Cena, })),
            zacetek_termina: cas_termina,
            konec_termina: konec.konec_termina,
            skupno_trajanje,
            skupna_cena,
            opombe: opombe || null
        });
    
    } catch (err) {
        console.error(err);

        res.status(500).json({ message: 'Napaka pri predogledu rezervacije.' });
    }
});

/**
 * @swagger
 * /termini/rezervacija:
 *   post:
 *     summary: Rezervacija termina
 *     description: |
 *       Omogoča prijavljenemu uporabniku rezervacijo termina pri izbranem frizerju.
 *       Uporabnik mora izbrati frizerja, datum, uro in vsaj eno storitev.
 *       Sistem preveri razpoložljivost frizerja in zasedenost termina.
 *       Če je vse veljavno, se termin shrani s statusom **Rezervirano**.
 *     tags:
 *       - Termini
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - frizer_ID
 *               - dan
 *               - ura
 *               - storitve
 *             properties:
 *               frizer_ID:
 *                 type: integer
 *                 example: 3
 *                 description: Enolični ID izbranega frizerja
 *               dan:
 *                 type: string
 *                 format: date
 *                 example: 2025-01-23
 *                 description: Datum termina (YYYY-MM-DD)
 *               ura:
 *                 type: string
 *                 example: "15:00"
 *                 description: Začetna ura termina (HH:mm)
 *               storitve:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: integer
 *                   example: 1
 *                 description: Seznam ID-jev izbranih storitev
 *               opombe:
 *                 type: string
 *                 nullable: true
 *                 example: Prosim krajše ob straneh
 *                 description: Dodatne opombe uporabnika (neobvezno)
 *     responses:
 *       201:
 *         description: Termin uspešno rezerviran
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Termin uspešno rezerviran.
 *                 termin_ID:
 *                   type: integer
 *                   example: 42
 *                 status:
 *                   type: string
 *                   example: Rezervirano
 *       400:
 *         description: Neveljavni ali manjkajoči podatki
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Manjkajoči podatki za rezervacijo.
 *       401:
 *         description: Neavtenticiran uporabnik
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ni tokena ali je neveljaven ali potekel.
 *       403:
 *         description: Uporabnik nima ustreznih pravic
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Dostop zavrnjen. Ni dovoljeno za vašo vlogo.
 *       404:
 *         description: Frizer ne obstaja
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Frizer ne obstaja.
 *       409:
 *         description: Frizer ali termin ni na voljo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Izbrani termin ni na voljo.
 *       500:
 *         description: Napaka na strežniku
 */
router.post('/rezervacija', auth.avtentikacijaJWT, auth.dovoliRole('uporabnik'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const uporabnik_ID = req.user.ID;
        const { frizer_ID, dan, ura, storitve, opombe } = req.body;

        //Nikoli ne zaupaj predogledu - vsi ključni pogoji se morajo preveriti znova

        if (!frizer_ID || !dan || !ura || !Array.isArray(storitve) || storitve.length === 0) {
            return res.status(400).json({ message: 'Manjkajoči podatki za rezervacijo.' });
        }

        const cas_termina = `${dan} ${ura}:00`;

        // Preveri, ali frizer obstaja
        const [[frizer]] = await pool.query(`
            SELECT ID 
            FROM frizerji 
            WHERE ID = ?`,
            [frizer_ID]);

        if (!frizer) {
            return res.status(404).json({ message: 'Izbrani frizer ne obstaja.' });
        }

        // Preveri, ali frizer izvaja izbrane storitve
        const [frizer_storitve] = await connection.query(`
            SELECT s.ID 
            FROM storitve s
            JOIN specializacija sp ON s.Ime = sp.Naziv 
            WHERE sp.Frizerji_id = ? AND s.ID IN (?)`,
            [frizer_ID, storitve]);

        if (frizer_storitve.length !== storitve.length) {
            return res.status(400).json({ message: 'Frizer ne izvaja vseh izbranih storitev.' });
        }

        // Preveri, ali frizer dela v izbranem terminu
        const [delovnik] = await connection.query(`
            SELECT * FROM delovnik WHERE 
            Frizerji_id = ? AND 
            Dan = ? AND 
            ? BETWEEN Zacetek AND Konec`,
            [frizer_ID, dan, ura]);

        if (delovnik.length === 0) {
            return res.status(409).json({ message: 'Frizer v izbranem terminu ni na voljo.' });
        }

        // Izračunaj skupno trajanje storitev
        const [trajanje_sum] = await connection.query(`
            SELECT SUM(Trajanje) AS trajanje 
            FROM storitve 
            WHERE ID IN (?)`,
            [storitve]);

        const trajanje = trajanje_sum[0].trajanje;

        if (!trajanje) {
            return res.status(400).json({ message: 'Navedene storitve niso veljavne.' });
        }

        // Preveri zasedenost termina
        const [zasedeni] = await connection.query(`
            SELECT * FROM termini WHERE
            Frizerji_id = ? AND
            Status = 'Rezervirano' AND
            (Cas_termina < DATE_ADD(?, INTERVAL ? MINUTE) AND
            DATE_ADD(Cas_termina, INTERVAL ? MINUTE) > ?)`,
            [frizer_ID, cas_termina, trajanje, trajanje, cas_termina]);

        if (zasedeni.length > 0) {
            return res.status(409).json({ message: 'Izbrani termin ni na voljo.' });
        }

        // TRANSAKCIJA
        await connection.beginTransaction();

        // Vstavi nov termin
        const [terminResult] = await connection.query(`
            INSERT INTO termini 
            (Uporabniki_id, Frizerji_id, Cas_termina, Opombe, Status) 
            VALUES (?, ?, ?, ?, 'Rezervirano')`,
            [uporabnik_ID, frizer_ID, cas_termina, opombe || null]);

        const termini_ID = terminResult.insertId;

        // Vstavi storitve za termin
        const storitveValues = storitve.map(ID => [termini_ID, ID]);

        await connection.query(`
            INSERT INTO termini_storitve (Termini_id, Storitve_id) 
            VALUES ?`,
            [storitveValues]);

        await connection.commit();

        res.status(201).json({  
            success: true,
            message: 'Termin uspešno rezerviran.', 
            termin_ID: termini_ID,
            status: 'Rezervirano'
        });
    
    } catch (err) {
        await connection.rollback();
        console.error(err);

        res.status(500).json({ message: 'Napaka pri rezervaciji termina.' });
    } finally {
        connection.release();
    }
});

/**
 * @swagger
 * /termini/pregled:
 *   get:
 *     summary: Pregled vseh rezervacij uporabnika
 *     description: |
 *       Prikazuje seznam vseh terminov, ki jih je uporabnik rezerviral.
 *       Za vsak termin se prikaže frizer, izbrane storitve, datum in čas začetka in konca termina, 
 *       skupno trajanje, skupna cena ter opombe in status termina. Prav tako je podan tudi URL za preklic termina.
 *     tags:
 *       - Termini
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Seznam uporabnikovih terminov
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   termin_ID:
 *                     type: integer
 *                     example: 12
 *                   frizer:
 *                     type: string
 *                     example: Ana Novak
 *                   storitve:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         naziv:
 *                           type: string
 *                           example: Striženje
 *                         trajanje:
 *                           type: integer
 *                           example: 30
 *                         cena:
 *                           type: number
 *                           example: 15
 *                   zacetek_termina:
 *                     type: string
 *                     format: date-time
 *                     example: 2025-06-10T14:00:00.000Z
 *                   konec_termina:
 *                     type: string
 *                     format: date-time
 *                     example: 2025-06-10T15:15:00.000Z
 *                   skupno_trajanje:
 *                     type: integer
 *                     example: 75
 *                   skupna_cena:
 *                     type: number
 *                     example: 45
 *                   opombe:
 *                     type: string
 *                     nullable: true
 *                     example: Prosim krajše ob straneh
 *                   status:
 *                     type: string
 *                     example: Rezervirano
 *                   preklic_url:
 *                     type: string
 *                     format: uri
 *                     example: http://localhost:3000/termini/preklic/12
 *                     description: URL do preklica termina
 *       401:
 *         description: Neavtenticiran uporabnik
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ni tokena ali je neveljaven ali potekel.
 *       403:
 *         description: Uporabnik nima ustreznih pravic
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Dostop zavrnjen. Ni dovoljeno za vašo vlogo.
 *       500:
 *         description: Napaka na strežniku
 */
router.get('/pregled', auth.avtentikacijaJWT, auth.dovoliRole('uporabnik'), async (req, res) => {
    try {
        const uporabnik_ID = req.user.ID;

        const [rows] = await pool.query(`
        SELECT
         t.ID AS termin_ID,
         t.Cas_termina,
         t.Opombe,
         t.Status,
         f.ID AS frizer_ID,
         f.Ime, 
         f.Priimek,
         s.ID AS storitev_ID,
         s.Ime AS storitev,
         s.Cena,
         s.Trajanje
        FROM termini t
        JOIN frizerji f ON f.ID = t.Frizerji_id
        JOIN termini_storitve ts ON ts.Termini_id = t.ID
        JOIN storitve s ON s.ID = ts.Storitve_id
        WHERE t.Uporabniki_id = ?
        ORDER BY t.Cas_termina ASC`, 
        [uporabnik_ID]);

        const terminiMap = {};

        for (const row of rows) {
            if (!terminiMap[row.termin_ID]) {
                terminiMap[row.termin_ID] = {
                    termin_ID: row.termin_ID,
                    frizer: `${row.Ime} ${row.Priimek}`,
                    storitve: [],
                    zacetek_termina: row.Cas_termina,
                    skupno_trajanje: 0,
                    skupna_cena: 0,
                    opombe: row.Opombe,
                    status: row.Status,
                };
            }

            terminiMap[row.termin_ID].storitve.push({
                id: row.storitev_ID,
                naziv: row.storitev,
                trajanje: Number(row.Trajanje),
                cena: Number(row.Cena),
            });

            terminiMap[row.termin_ID].skupno_trajanje += Number(row.Trajanje);
            terminiMap[row.termin_ID].skupna_cena += Number(row.Cena);
        }

        const termini = Object.values(terminiMap).map(t => {
            const konec = new Date(t.zacetek_termina);
            konec.setMinutes(konec.getMinutes() + t.skupno_trajanje);

            return {
                termin_ID: t.termin_ID,
                frizer: t.frizer,
                storitve: t.storitve,
                zacetek_termina: t.zacetek_termina,
                konec_termina: konec,
                skupno_trajanje: t.skupno_trajanje,
                skupna_cena: t.skupna_cena,
                opombe: t.opombe,
                status: t.status,
                preklic_url: utils.urlVira(req, `/termini/preklic/${t.termin_ID}`)
            };
        });

        res.json(termini);
    } catch (err) {
      res.status(500).json({ message: 'Napaka pri pridobivanju terminov.' });
    }
});

/**
 * @swagger
 * /termini/preklic/{id}:
 *   patch:
 *     summary: Preklic rezerviranega termina
 *     description: |
 *       Prekliče rezerviran termin, če je status termina `'Rezervirano'`, uporabnik je lastnik in je do začetka termina več kot `24` ur.
 *       V primeru uspešnega preklica se vrne sporočilo o uspešnem preklicu.
 *       V primeru napake se vrne ustrezen status in sporočilo.
 *     tags:
 *       - Termini
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID termina za preklic
 *         example: 13
 *     responses:
 *       200:
 *         description: Termin uspešno preklican
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Termin je bil uspešno preklican.
 *       401:
 *         description: Neavtenticiran uporabnik
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ni tokena ali je neveljaven ali potekel.
 *       403:
 *         description: Uporabnik nima ustreznih pravic
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Dostop zavrnjen. Ni dovoljeno za vašo vlogo.
 *       404:
 *         description: Termin ne obstaja ali ni v lasti uporabnika
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Termin ne obstaja.
 *       409:
 *         description: Termina ni mogoče preklicati, ker status ni `'Rezervirano'` ali je do začetka termina manj kot `24` ur
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Tega termina ni mogoče preklicati.
 *       500:
 *         description: Napaka na strežniku
 */
router.patch('/preklic/:id', auth.avtentikacijaJWT, auth.dovoliRole('uporabnik'), async (req, res) => {
    try {

        const termin_ID = req.params.id;
        const uporabnik_ID = req.user.ID;

        const [[termin]] = await pool.query(`
            SELECT Status, Cas_termina
            FROM termini
            WHERE ID = ? AND Uporabniki_id = ?`,
            [termin_ID, uporabnik_ID]
        );

        if (!termin) {
            return res.status(404).json({ message: 'Termin ne obstaja.' });
        }

        if (termin.Status !== 'Rezervirano') {
            return res.status(409).json({
                message: 'Tega termina ni mogoče preklicati.'
            });
        }

        const zdaj = new Date();
        const terminStart = new Date(termin.Cas_termina);
        const razlikaUre = (terminStart - zdaj) / (1000 * 60 * 60); // Razlika v urah

        if (razlikaUre < 24) {
            return res.status(409).json({
                message: 'Tega termina ni mogoče preklicati, ker je preklic možen najmanj 24 ur pred začetkom termina.'
            });
        }

        await pool.query(`
            UPDATE termini
            SET Status = 'Preklicano'
            WHERE ID = ?`,
            [termin_ID]
        );

        res.json({
            success: true,
            message: 'Termin je bil uspešno preklican.'
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Napaka pri preklicu termina.' });
    }
});

module.exports = router;
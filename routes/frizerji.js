const express = require('express');
const router = express.Router();
const pool = require('../utils/db.js');
const utils = require('../utils/utils.js');
const auth = require('../utils/auth.js');
const bcrypt = require('bcrypt');

/**
 * @swagger
 * /frizerji/signup:
 *   post:
 *     summary: Registracija novega frizerja
 *     description: |
 *       Ustvari novega frizerja, shrani hashirano geslo v bazo 
 *       ter doda njegove specializacije.
 *     tags:
 *       - Frizerji
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - Spol
 *               - Ime
 *               - Priimek
 *               - Naslov
 *               - Starost
 *               - Mail
 *               - Telefon
 *               - Opis
 *               - Uporabnisko_ime
 *               - Geslo
 *               - Specializacije
 *             properties:
 *               Spol:
 *                 type: string
 *                 enum: [Moški, Ženski]
 *                 example: Moški
 *               Ime:
 *                 type: string
 *                 example: Miha
 *               Priimek:
 *                 type: string
 *                 example: Novak
 *               Naslov:
 *                 type: string
 *                 example: Slovenska 1, Ljubljana
 *               Starost:
 *                 type: integer
 *                 example: 25
 *               Mail:
 *                 type: string
 *                 format: email
 *                 example: miha.novak@email.com
 *               Telefon:
 *                 type: string
 *                 example: "+38640123456"
 *               Opis:
 *                 type: string
 *                 example: "Specialist za moške pričeske"
 *               Uporabnisko_ime:
 *                 type: string
 *                 example: miha123
 *               Geslo:
 *                 type: string
 *                 format: password
 *                 example: skrivnoGeslo123
 *               Specializacije:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                 example: 
 *                   - "Moško striženje"
 *                   - "Britje"
 *                   - "Barvanje las"
 *     responses:
 *       201:
 *         description: Frizer uspešno ustvarjen skupaj s specializacijami
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Frizer s specializacijami uspešno dodan.
 *       400:
 *         description: Napačni ali manjkajoči podatki
  *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Podatki manjkajo ali so napačni.
 *       409:
 *         description: Uporabniško ime že obstaja
  *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Uporabniško ime že obstaja.
 *       500:
 *         description: Napaka na strežniku
 */
// Dodajanje frizerja
router.post('/signup', async (req, res, next) => {
    const { Spol, Ime, Priimek, Naslov, Starost, Mail, Telefon, Opis, Uporabnisko_ime, Geslo, Specializacije } = req.body;
    // Preveri, če so vsi potrebni podatki prisotni
    if (!Spol || !Ime || !Priimek || !Naslov || !Starost || !Mail || !Telefon || !Opis || !Uporabnisko_ime || !Geslo || 
        !Array.isArray(Specializacije) || Specializacije.length === 0
    ) {
        return res.status(400).json({ message: 'Manjkajoči podatki.' });
    }

    const dovoljeniSpoli = ['Moški', 'Ženski'];
    if (!dovoljeniSpoli.includes(Spol)) {
        return res.status(400).json({ message: 'Neveljavna vrednost za spol.' });
    }

    const StarostNum = Number(Starost);
    if (!Number.isInteger(StarostNum) || StarostNum < 0 || StarostNum > 100) {
        return res.status(400).json({ message: 'Starost mora biti veljavna številka.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(Mail)) {
        return res.status(400).json({ message: 'Neveljaven email naslov.' });
    }

    if (Geslo.length < 8) {
        return res.status(400).json({ message: 'Geslo mora imeti vsaj 8 znakov.' });
    }

    try {
        if (await utils.frizerObstaja(Uporabnisko_ime)) {
            return res.status(409).json({ message: 'Uporabniško ime že obstaja.' });
        }
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Hashiranje gesla
            const hashedGeslo = await bcrypt.hash(Geslo, 10);

            // Vstavi novega frizerja v bazo
            const [result] = await connection.execute(`
                INSERT INTO frizerji (Spol, Ime, Priimek, Naslov, Starost, Mail, Telefon, Opis, Uporabnisko_ime, Geslo) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [Spol, Ime, Priimek, Naslov, StarostNum, Mail, Telefon, Opis, Uporabnisko_ime, hashedGeslo]
            );

            // Preverimo, če je bila vstavljena natanko ena vrstica
            if (result.affectedRows !== 1) {
                throw new Error('Dodajanje frizerja ni bilo uspešno.');
            }

            const frizerId = result.insertId;

            // Vstavi specializacije
            const insertSpecializacijeSql = 
                'INSERT INTO specializacija (Frizerji_id, Naziv) VALUES (?, ?)';
            
            for (const naziv of Specializacije) {
                await connection.execute(insertSpecializacijeSql, [frizerId, naziv]);
            }

            await connection.commit();

            return res.status(201).json({
                message: 'Frizer s specializacijami uspešno dodan.',
            });

        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (err) {
        next(err);
    }
});

/**
 * @swagger
 * /frizerji/login:
 *   post:
 *     summary: Prijava frizerja
 *     description: Preveri uporabniško ime in geslo ter vrne JWT token ob uspešni prijavi.
 *     tags:
 *       - Frizerji
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - Uporabnisko_ime
 *               - Geslo
 *             properties:
 *               Uporabnisko_ime:
 *                 type: string
 *                 example: miha123
 *               Geslo:
 *                 type: string
 *                 format: password
 *                 example: skrivnoGeslo123
 *     responses:
 *       200:
 *         description: Prijava uspešna
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Uspešna prijava.
 *       400:
 *         description: Manjkajoči podatki
  *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Manjkajo podatki.
 *       401:
 *         description: Napačno uporabniško ime ali geslo
  *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Napačno uporabniško ime ali geslo.
 *       500:
 *         description: Napaka na strežniku
 */
// Prijava frizerja
router.post('/login', async (req, res, next) => {
    const { Uporabnisko_ime, Geslo } = req.body;

    if (!Uporabnisko_ime || !Geslo) {
        return res.status(400).json({ message: 'Manjkajoči podatki.' });
    }

    try {
        // Poiščemo frizerja v bazi
        const [rows] = await pool.execute(
            'SELECT ID, Uporabnisko_ime, Geslo FROM frizerji WHERE Uporabnisko_ime = ?',
            [Uporabnisko_ime]
        );

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Napačno uporabniško ime ali geslo.' });
        }

        const frizer = rows[0];

        // Preverimo geslo
        const match = await bcrypt.compare(Geslo, frizer.Geslo);
        if (!match) {
            return res.status(401).json({ message: 'Napačno uporabniško ime ali geslo.' });
        }

        // JWT token
        const token = auth.generirajJWT(
            {
                ID: frizer.ID,
                Uporabnisko_ime: frizer.Uporabnisko_ime,
                role: 'frizer'
            },
            'frizer'
        );

        res.json({ message: 'Prijava uspešna.', token });

    } catch (err) {
        next(err);
    }
});

/**
 * @swagger
 * /frizerji/jaz:
 *   get:
 *     summary: Preveri prijavljenega frizerja
 *     description: Vrne informacije o prijavljenem frizerju na podlagi posredovanega JWT tokena.
 *     tags:
 *       - Frizerji
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Frizer je prijavljen
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Frizer uspešno prijavljen.
 *       401:
 *         description: Neavtenticiran frizer
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ni tokena ali je neveljaven ali potekel.
 */
// Avtentikacija frizerja
router.get('/jaz', auth.avtentikacijaJWT, (req, res) => {
    res.json({ 
        message: 'Frizer je prijavljen.', 
        user: req.user 
    });
});

/**
 * @swagger
 * /frizerji:
 *   get:
 *     summary: Pridobi seznam osebnih imen vseh frizerjev
 *     description: |
 *       Vrne seznam vseh frizerjev, ki so na voljo v sistemu.
 *       Vsak frizer vsebuje enolični identifikator in njegovo ime ter priimek,
 *       ki sta namenjena prikazu v uporabniškem vmesniku.
 *     tags:
 *       - Frizerji
 *     responses:
 *       200:
 *         description: Uspešno pridobljen seznam frizerjev
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 3
 *                     description: Enolični ID frizerja
 *                   osebno_ime:
 *                     type: string
 *                     example: Janez Novak
 *                     description: Ime in priimek frizerja
 *       500:
 *         description: Napaka na strežniku
 */
// Pridobivanje vseh frizerjev
router.get('/', async (req, res, next) => {
    try {
        const [rows] = await pool.execute('SELECT ID, Ime, Priimek FROM frizerji');
        const result = rows.map(row => ({
            id: row.ID,
            osebno_ime: `${row.Ime} ${row.Priimek}`
        }));
        res.json(result);
    } catch (err) {
        next(err);
    }
});

/**
 * @swagger
 * /frizerji/info:
 *   get:
 *     summary: Pridobi informacije o vseh frizerjih
 *     description: |
 *       Vrne seznam vseh frizerjev skupaj z njihovimi specializacijami
 *       in delovniki.  
 *       Vsak frizer ima lahko več specializacij in več delovnikov.
 *     tags:
 *       - Frizerji
 *     responses:
 *       200:
 *         description: Uspešno pridobljen seznam frizerjev
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   ID:
 *                     type: integer
 *                     example: 1
 *                   Ime:
 *                     type: string
 *                     example: Janez
 *                   Priimek:
 *                     type: string
 *                     example: Novak
 *                   Starost:
 *                     type: integer
 *                     example: 30
 *                   Mail:
 *                     type: string
 *                     example: janez.novak@email.com
 *                   Telefon:
 *                     type: string
 *                     example: "+38640123456"
 *                   Opis:
 *                     type: string
 *                     example: Izkušen frizer z večletno prakso
 *                   specializacije:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         naziv:
 *                           type: string
 *                           example: Moško striženje
 *                   delovniki:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         dan:
 *                           type: string
 *                           example: 2025-11-24
 *                         zacetek:
 *                           type: string
 *                           example: "08:00:00"
 *                         konec:
 *                           type: string
 *                           example: "16:00:00"
 *       500:
 *         description: Napaka na strežniku
 */
// Pridobivanje informacij o vseh frizerjih
router.get('/info', async (req, res, next) => {
    try {
        const [rows] = await pool.execute(`
            SELECT 
                f.ID AS frizer_id, 
                f.Ime,
                f.Priimek,
                f.Starost,
                f.Mail,
                f.Telefon,
                f.Opis,
                s.ID AS specializacija_id,
                s.Naziv AS specializacija,
                d.ID AS delovnik_id,
                DATE_FORMAT(d.Dan, '%Y-%m-%d') AS Dan,
                d.Zacetek,
                d.Konec
            FROM frizerji f
            LEFT JOIN specializacija s ON f.ID = s.Frizerji_id
            LEFT JOIN delovnik d ON f.ID = d.Frizerji_id
            ORDER BY f.ID
        `);

        const frizerji = {};

        for (const row of rows) {
            if (!frizerji[row.frizer_id]) {
                frizerji[row.frizer_id] = {
                    ID: row.frizer_id,
                    Ime: row.Ime,
                    Priimek: row.Priimek,
                    Starost: row.Starost,
                    Mail: row.Mail,
                    Telefon: row.Telefon,
                    Opis: row.Opis,
                    specializacije: [],
                    delovniki: []
                };
            }
            // specializacije
            if (row.specializacija_id &&
                !frizerji[row.frizer_id].specializacije.some(
                    s => s.id === row.specializacija_id
                )
            ) {
                frizerji[row.frizer_id].specializacije.push({
                    id: row.specializacija_id,
                    naziv: row.specializacija
                });
            }
            // delovniki
            if (row.delovnik_id &&
                !frizerji[row.frizer_id].delovniki.some(
                    d => d.id === row.delovnik_id
                )
            ) {
                frizerji[row.frizer_id].delovniki.push({
                    id: row.delovnik_id,
                    dan: row.Dan,
                    zacetek: row.Zacetek,
                    konec: row.Konec
                });
            }
        }

        res.json(Object.values(frizerji));
    } catch (err) {
        next(err);
    }
});

/**
 * @swagger
 * /frizerji/termini:
 *   get:
 *     summary: Pridobi termine frizerja za določen dan
 *     description: Vrne seznam terminov za prijavljenega frizerja za določen datum. Za vsak termin vrne `uro`, `ime` in `priimek` stranke ter `URL` do podrobnosti termina.
 *     tags:
 *       - Frizerji
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dan
 *         required: true
 *         schema:
 *           type: string
 *         description: Datum za katerega želimo pridobiti termine
 *         example: "2026-01-03"
 *     responses:
 *       200:
 *         description: Uspešno pridobljen seznam terminov
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 termini:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       ura:
 *                         type: string
 *                         example: "10:30:00"
 *                         description: Čas začetka termina
 *                       stranka:
 *                         type: string
 *                         example: "Janez Novak"
 *                         description: Ime in priimek stranke
 *                       url:
 *                         type: string
 *                         format: uri
 *                         example: "http://localhost:3000/frizerji/termini/1"
 *                         description: URL do podrobnosti termina
 *                 message:
 *                   type: string
 *                   nullable: true
 *                   example: Ni terminov za ta dan.
 *                   description: Sporočilo ob praznem seznamu terminov
 *       400:
 *         description: Manjkajoč ali neveljaven datum
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Neveljaven datum. Uporabi format YYYY-MM-DD.
 *       401:
 *         description: Neavtenticiran frizer
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ni tokena ali je neveljaven ali potekel.
 *       403:
 *         description: Frizer nima ustreznih pravic
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
router.get('/termini', auth.avtentikacijaJWT, auth.dovoliRole('frizer'), async (req, res, next) => {
    try {
        const dan = req.query.dan; // datum v obliki 'YYYY-MM-DD' iz query stringa
        const frizerId = req.user.ID;

        if (!dan) {
            return res.status(400).json({ message: 'Manjkajoč datum.' });
        }

        // Preverimo, če je format datuma veljaven
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dan)) {
            return res.status(400).json({ message: 'Neveljaven datum. Uporabi format YYYY-MM-DD.' });
        }

        const [y, m, d] = dan.split('-').map(Number);
        if (y < 2025 || y > 2026 || m < 1 || m > 12 || d < 1 || d > 31) {
            return res.status(400).json({ error: 'Neveljaven datum.' });
        }

        const [rows] = await pool.execute(`
            SELECT t.ID, TIME(t.Cas_termina) AS Ura, u.Ime, u.Priimek
            FROM termini t
            JOIN uporabniki u ON t.Uporabniki_id = u.ID
            WHERE t.Frizerji_id = ? AND DATE(t.Cas_termina) = ?
            ORDER BY t.Cas_termina ASC`, 
            [frizerId, dan]);

        if (rows.length === 0) {
            return res.json({
                termini: [],
                message: 'Ni terminov za ta dan.'
            });
        }

        const termini = rows.map(row => ({
            ura: row.Ura,
            stranka: row.Ime + ' ' + row.Priimek,
            url: utils.urlVira(req, `/frizerji/termini/${row.ID}`)
        }));

        res.json(termini);
    } catch (err) {
        next(err);
    }
});

/**
 * @swagger
 * /frizerji/termini/{id}:
 *   get:
 *     summary: Pridobi podrobnosti določenega termina
 *     description: |
 *       Vrne podrobnosti določenega termina glede na parameter `id` v URL-ju.
 *       Sistem vrne ime in priimek stranke, uro termina, seznam storitev, ki vsebuje naziv, trajanje in ceno vsake storitve.
 *       Prav tako vrne skupno trajanje in ceno storitev, morebitne opombe, kontakt stranke, ki vsebuje telefon in mail, ter status termina.
 *       Sistem vrne še URL naslov za spremembo statusa termina.
 *     tags:
 *       - Frizerji
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifikator termina, za katerega želimo pridobiti podrobnosti
 *         example: 11
 *     responses:
 *       200:
 *         description: Podrobnosti termina
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   termin_id:
 *                     type: integer
 *                     example: 12
 *                   stranka:
 *                     type: string
 *                     example: Ana Novak
 *                   ura:
 *                     type: string
 *                     example: "10:00:00"
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
 *                   kontakt:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         telefon:
 *                           type: string
 *                           example: "+38640123456"
 *                         mail:
 *                           type: string
 *                           format: email
 *                           example: miha.novak@email.com
 *                   status:
 *                     type: string
 *                     example: Rezervirano
 *                   sprememba_url:
 *                     type: string
 *                     format: uri
 *                     example: http://localhost:3000/frizerji/termini/12
 *                     description: URL do spremembe statusa termina
 *       401:
 *         description: Neavtenticiran frizer
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ni tokena ali je neveljaven ali potekel.
 *       403:
 *         description: Frizer nima ustreznih pravic
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Dostop zavrnjen. Ni dovoljeno za vašo vlogo.
 *       404:
 *         description: Termin ne obstaja
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Termin ne obstaja.
 *       500:
 *         description: Napaka na strežniku
 */
router.get('/termini/:id', auth.avtentikacijaJWT, auth.dovoliRole('frizer'), async (req, res, next) => {
    try {
        const terminId = req.params.id;
        const frizerId = req.user.ID;

        // Termin + uporabnik
        const [terminRows] = await pool.execute(`
            SELECT 
                t.ID,
                TIME(t.Cas_termina) AS Ura,
                t.Opombe,
                t.Status,
                u.Ime,
                u.Priimek,
                u.Telefon,
                u.Mail
            FROM termini t
            JOIN uporabniki u ON u.ID = t.Uporabniki_id
            WHERE t.ID = ? AND t.Frizerji_id = ?`, 
        [terminId, frizerId]);

        if (terminRows.length === 0) {
            return res.status(404).json({ message: 'Termin ne obstaja.' });
        }

        // Storitve za termin
        const [storitveRows] = await pool.execute(`
            SELECT
                s.ID,
                s.Ime,
                s.Trajanje,
                s.Cena
            FROM termini_storitve ts
            JOIN storitve s ON s.ID = ts.Storitve_id
            WHERE ts.Termini_id = ?`,
        [terminId]);

        // Seštevek
        const [sumRows] = await pool.execute(`
            SELECT
                SUM(s.Trajanje) AS skupno_trajanje,
                SUM(s.Cena) AS skupna_cena
            FROM termini_storitve ts
            JOIN storitve s ON s.ID = ts.Storitve_id
            WHERE ts.Termini_id = ?`,
        [terminId]);

        const skupno_trajanje = Number(sumRows[0].skupno_trajanje);
        const skupna_cena = Number(sumRows[0].skupna_cena);

        res.json({
            termin_id: terminRows[0].ID,
            stranka: `${terminRows[0].Ime} ${terminRows[0].Priimek}`,
            ura: terminRows[0].Ura,
            storitve: storitveRows.map(s => ({ 
                id: s.ID,
                naziv: s.Ime,
                trajanje: s.Trajanje,
                cena: Number(s.Cena)
            })), 
            skupno_trajanje,
            skupna_cena,
            opombe: terminRows[0].Opombe || null,
            kontakt: {
                telefon: terminRows[0].Telefon,
                mail: terminRows[0].Mail
            },
            status: terminRows[0].Status,
            sprememba_url: utils.urlVira(req, `/frizerji/termini/${terminRows[0].ID}`)
        });

    } catch (err) {
        next(err);
    }
});

/**
 * @swagger
 * /frizerji/termini/{id}:
 *   patch:
 *     summary: Sprememba statusa termina
 *     description: |
 *       Spremeni status rezerviranega termina iz `Rezervirano` v `Preklicano`, `V izvajanju` ali `Zaključeno`, ali iz `V izvajanju` v `Zaključeno`.
 *       V primeru uspešne spremembe statusa se vrne sporočilo o uspešni spremembi ter star in nov status.
 *     tags:
 *       - Frizerji
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID termina za spremembo statusa
 *         example: 13
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 example: 'V izvajanju'
 *                 description: Posodobljen status termina
 *     responses:
 *       200:
 *         description: Status termina uspešno posodobljen
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Status termina je bil uspešno posodobljen.
 *                   description: Sporočilo ob uspehu
 *                 termin_id:
 *                   type: boolean
 *                   example: true
 *                   description: ID posodobljenega termina
 *                 prejsnji_status:
 *                   type: string
 *                   example: 'Rezervirano'
 *                   description: Prejšnji status termina
 *                 novi_status:
 *                   type: string
 *                   example: 'V izvajanju'
 *                   description: Posodobljeni status termina
 *       400:
 *         description: Neveljaven status za spremembo termina
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Neveljaven status.
 *       401:
 *         description: Neavtenticiran frizer
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ni tokena ali je neveljaven ali potekel.
 *       403:
 *         description: Frizer nima ustreznih pravic
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Dostop zavrnjen. Ni dovoljeno za vašo vlogo.
 *       404:
 *         description: Termin ne obstaja
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Termin ne obstaja.
 *       409:
 *         description: Sprememba statusa termina ni mogoča, ker prehod iz prejšnjega v nov status ni dovoljen
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Prehod iz statusa 'Preklicano' v 'Rezervirano' ni dovoljen.
 *       500:
 *         description: Napaka na strežniku
 */
router.patch('/termini/:id', auth.avtentikacijaJWT, auth.dovoliRole('frizer'), async(req, res, next) => {
    try {
        const terminId = req.params.id;
        const frizerId = req.user.ID;
        const { status: novStatus } = req.body;

        // Validacija inputa
        const dovoljeniStatusi = [
            'Rezervirano',
            'Preklicano',
            'V izvajanju',
            'Zaključeno'
        ];

        if (!dovoljeniStatusi.includes(novStatus)) {
            return res.status(400).json({
                message: 'Neveljaven status.'
            });
        }

        // preveri termin (obstoj, lastništvo, trenutni status)
        const [terminRows] = await pool.execute(`
            SELECT Status
            FROM termini
            WHERE ID = ? AND Frizerji_id = ?
        `, [terminId, frizerId]);

        if (terminRows.length === 0) {
            return res.status(404).json({
                message: 'Termin ne obstaja.'
            });
        }

        const trenutniStatus = terminRows[0].Status;

        // preveri dovoljen prehod
        const dovoljeniPrehodi = {
            Rezervirano: ['Preklicano', 'V izvajanju', 'Zaključeno'],
            'V izvajanju': ['Zaključeno'],
            Zaključeno: [],
            Preklicano: []
        };

        if (!dovoljeniPrehodi[trenutniStatus].includes(novStatus)) {
            return res.status(409).json({
                message: `Prehod iz statusa '${trenutniStatus}' v '${novStatus}' ni dovoljen.`
            });
        }

        // posodobi status
        await pool.execute(`
            UPDATE termini
            SET Status = ?
            WHERE ID = ?
        `, [novStatus, terminId]);

        // odgovor
        res.status(200).json({
            message: 'Status termina je bil uspešno posodobljen.',
            termin_id: terminId,
            prejsnji_status: trenutniStatus,
            novi_status: novStatus
        });

    } catch (err) {
        next(err);
    }
});

module.exports = router;

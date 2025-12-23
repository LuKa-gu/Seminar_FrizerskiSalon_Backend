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
 *         description: Neavtenticiran uporabnik
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
 *                           format: date
 *                           example: 2025-11-24
 *                         zacetek:
 *                           type: string
 *                           format: time
 *                           example: "08:00:00"
 *                         konec:
 *                           type: string
 *                           format: time
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
                d.Dan,
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
                    dan: row.Dan instanceof Date 
                        ? row.Dan.toISOString().split('T')[0] // Formatiranje datuma kot YYYY-MM-DD
                        : row.Dan, // V primeru, da je string
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

module.exports = router;

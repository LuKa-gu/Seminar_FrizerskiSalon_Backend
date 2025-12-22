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
 *     description: Ustvari novega frizerja in shrani hashirano geslo v bazo.
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
 *     responses:
 *       201:
 *         description: Frizer uspešno ustvarjen
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Napačni ali manjkajoči podatki
 *       409:
 *         description: Uporabniško ime že obstaja
 *       500:
 *         description: Napaka na strežniku
 */
// Dodajanje frizerja
router.post('/signup', async (req, res, next) => {
    const { Spol, Ime, Priimek, Naslov, Starost, Mail, Telefon, Opis, Uporabnisko_ime, Geslo } = req.body;
    // Preveri, če so vsi potrebni podatki prisotni
    if (!Spol || !Ime || !Priimek || !Naslov || !Starost || !Mail || !Telefon || !Opis || !Uporabnisko_ime || !Geslo) {
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
        
        // Hashiranje gesla
        const hashedGeslo = await bcrypt.hash(Geslo, 10);

        // Vstavi novega frizerja v bazo
        const sql = 'INSERT INTO frizerji (Spol, Ime, Priimek, Naslov, Starost, Mail, Telefon, Opis, Uporabnisko_ime, Geslo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const [result] = await pool.execute(sql, [Spol, Ime, Priimek, Naslov, StarostNum, Mail, Telefon, Opis, Uporabnisko_ime, hashedGeslo]);

        // Preverimo, če je bila vstavljena natanko ena vrstica
        if (result.affectedRows === 1) {
            return res.status(201).json({
                message: 'Frizer uspešno dodan.'
            });
        } else {
            return res.status(500).json({ message: 'Dodajanje frizerja ni bilo uspešno.' });
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
 *       400:
 *         description: Manjkajoči podatki
 *       401:
 *         description: Napačno uporabniško ime ali geslo
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
 *       401:
 *         description: Manjka token
 *       403:
 *         description: Neveljaven ali potekel token
 */
router.get('/jaz', auth.avtentikacijaJWT, (req, res) => {
    res.json({ 
        message: 'Frizer je prijavljen.', 
        user: req.user 
    });
});

module.exports = router;

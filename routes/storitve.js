const express = require('express');
const router = express.Router();
const pool = require('../utils/db.js');
const utils = require('../utils/utils.js');
const auth = require('../utils/auth.js');

/**
 * @swagger
 * /storitve:
 *   get:
 *     summary: Pridobi seznam vseh storitev
 *     description: |
 *       Vrne seznam vseh storitev, ki so na voljo v sistemu. 
 *       Vsaka storitev vsebuje enolični `ID`, `naziv` ter `URL` do podrobnosti storitve, ki se lahko uporablja za prikaz dodatnih informacij v uporabniškem vmesniku.
 *       URL vsebuje kombinacijo `ID` in formatiranega naziva (slug) za boljšo berljivost, npr. `12-zensko-strizenje`.
 *     tags:
 *       - Storitve
 *     responses:
 *       200:
 *         description: Uspešno pridobljen seznam storitev
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 12
 *                     description: Enolični ID storitve
 *                   naziv:
 *                     type: string
 *                     example: Žensko striženje
 *                     description: Naziv storitve
 *                   url:
 *                     type: string
 *                     format: uri
 *                     example: http://localhost:3000/storitve/12-zensko-strizenje
 *                     description: URL do podrobnosti storitve
 *       500:
 *         description: Napaka na strežniku
 */
// Pridobivanje id-jev in nazivov vseh storitev + link do podrobnosti
router.get('/', async (req, res, next) => {
    try {
        const [rows] = await pool.execute('SELECT ID, Ime FROM storitve');
        const result = rows.map(row => ({
            id: row.ID,
            naziv: row.Ime,
            url: utils.urlVira(req, `/storitve/${row.ID}-${utils.createSlug(row.Ime)}`)
        }));
        res.json(result);
    } catch (err) {
        next(err);
    }
});

/**
 * @swagger
 * /storitve/{naziv}:
 *   get:
 *     summary: Pridobi podrobnosti določene storitve
 *     description: |
 *       Vrne vse podatke določene storitve.
 *       Parameter `naziv` je v obliki `id-slug`, kjer se za poizvedbo uporabi samo `id`.
 *       Primer: `12-zensko-strizenje`
 *     tags:
 *       - Storitve
 *     parameters:
 *       - in: path
 *         name: naziv
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d+-[a-z]+(?:-[a-z]+)*$'
 *         description: Identifikator storitve v obliki `id-slug`
 *         example: 12-zensko-strizenje
 *     responses:
 *       200:
 *         description: Podrobnosti storitve
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ID:
 *                   type: integer
 *                   example: 12
 *                 Ime:
 *                   type: string
 *                   example: Žensko striženje
 *                 Opis:
 *                   type: string
 *                   example: Klasično žensko striženje
 *                 Trajanje:
 *                   type: integer
 *                   example: 60
 *                 Cena:
 *                   type: string
 *                   example: "15.00"
 *       400:
 *         description: Neveljaven format parametra `naziv`
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Neveljaven format naziva storitve. Pričakovan format je id-slug.
 *       404:
 *         description: Storitev ne obstaja
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Storitev ne obstaja.
 *       500:
 *         description: Napaka na strežniku
 */
// Pridobivanje podrobnosti določene storitve glede na naziv
router.get('/:naziv', utils.resolveStoritev, (req, res) => {
    res.json(req.storitev);
});

/**
 * @swagger
 * /storitve/{naziv}:
 *   put:
 *     summary: Posodobi določeno storitev
 *     description: |
 *       Omogoča posodobitev podatkov določene storitve.  
 *       Parameter `naziv` je v obliki `id-slug`, kjer se za poizvedbo uporabi samo `id`.  
 *       Primer: `12-zensko-strizenje`
 *     tags:
 *       - Storitve
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: naziv
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d+-[a-z]+(?:-[a-z]+)*$'
 *         description: Identifikator storitve v obliki `id-slug`
 *         example: 12-zensko-strizenje
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               Opis:
 *                 type: string
 *                 example: Posodobljen opis storitve
 *               Trajanje:
 *                 type: integer
 *                 example: 75
 *               Cena:
 *                 type: string
 *                 example: "20.00"
 *     responses:
 *       200:
 *         description: Storitev uspešno posodobljena
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Storitev uspešno posodobljena.
 *       400:
 *         description: Neveljaven format parametra `naziv` ali podatkov
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Neveljaven format naziva storitve ali podatkov za posodobitev.
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
 *         description: Storitev ne obstaja
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Storitev ne obstaja.
 *       500:
 *         description: Napaka na strežniku
 */
// Posodabljanje storitev
router.put('/:naziv', auth.avtentikacijaJWT, auth.dovoliRole('frizer'), utils.resolveStoritev, async (req, res, next) => {
    try {
        const { Opis, Trajanje, Cena } = req.body;

        await pool.execute(`
            UPDATE storitve
            SET Opis = ?, Trajanje = ?, Cena = ?
            WHERE ID = ?`, 
            [   Opis ?? req.storitev.Opis,
                Trajanje ?? req.storitev.Trajanje, 
                Cena ?? req.storitev.Cena, 
                req.storitev.ID
            ]);

        res.json({ message: 'Storitev uspešno posodobljena.' });
    } catch (err) {
        next(err);
    }
});

/**
 * @swagger
 * /storitve/{naziv}:
 *   delete:
 *     summary: Izbriši določeno storitev
 *     description: |
 *       Omogoča brisanje določene storitve.  
 *       Parameter `naziv` je v obliki `id-slug`, kjer se za poizvedbo uporabi samo `id`.  
 *       Primer: `12-zensko-strizenje`
 *     tags:
 *       - Storitve
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: naziv
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d+-[a-z]+(?:-[a-z]+)*$'
 *         description: Identifikator storitve v obliki `id-slug`
 *         example: 12-zensko-strizenje
 *     responses:
 *       200:
 *         description: Storitev uspešno izbrisana
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Storitev uspešno izbrisana.
 *       400:
 *         description: Neveljaven format parametra `naziv`
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Neveljaven format naziva storitve.
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
 *         description: Storitev ne obstaja
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Storitev ne obstaja.
 *       500:
 *         description: Napaka na strežniku
 */
// Brisanje storitev
router.delete('/:naziv', auth.avtentikacijaJWT, auth.dovoliRole('frizer'), utils.resolveStoritev, async (req, res, next) => {
    try {
        await pool.execute('DELETE FROM storitve WHERE ID = ?', [req.storitev.ID]);

        res.json({ message: 'Storitev uspešno izbrisana.' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
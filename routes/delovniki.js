const express = require('express');
const router = express.Router();
const pool = require('../utils/db.js');
const utils = require('../utils/utils.js');
const auth = require('../utils/auth.js');

/**
 * @swagger
 * /delovniki:
 *   get:
 *     summary: Pridobi vse delovnike frizerja
 *     description: |
 *       Pridobi seznam vseh delovnikov za prijavljenega frizerja.
 *       Vsak delovnik ima svoj `datum` in čas `začetka` ter `konca`.
 *       Vsak delovnik vsebuje tudi `URL`, ki vsebuje `ID` delovnika, za posodobitev ali brisanje delovnika.
 *     tags:
 *       - Delovniki
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Uspešno pridobljen seznam delovnikov
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 delovniki_url:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       ID:
 *                         type: integer
 *                         example: 1
 *                       Dan:
 *                         type: string
 *                         example: "2025-11-24"
 *                       Zacetek:
 *                         type: string
 *                         example: "08:00:00"
 *                       Konec:
 *                         type: string
 *                         example: "12:00:00"
 *                       Url:
 *                         type: string
 *                         format: uri
 *                         example: http://localhost:3000/delovniki/12
 *                         description: Url za posodobitev ali brisanje delovnika
 *                 message:
 *                   type: string
 *                   nullable: true
 *                   example: Rezerviran ni noben delovnik.
 *                   description: Sporočilo ob praznem seznamu delovniki_url
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Napaka na strežniku.
 */
// Pridobitev vseh delovnikov frizerja
router.get('/', auth.avtentikacijaJWT, auth.dovoliRole('frizer'), async (req, res, next) => {
    try {
        const frizer_ID = req.user.ID;

        const [rows] = await pool.execute(
            `
            SELECT ID, DATE_FORMAT(Dan, '%Y-%m-%d') AS Dan, Zacetek, Konec
            FROM delovnik
            WHERE Frizerji_id = ?
            ORDER BY Dan, Zacetek`, 
            [frizer_ID]
        );

        if (rows.length === 0) {
            return res.json({
                delovniki_url: [],
                message: 'Rezerviran ni noben delovnik.'
            });
        }

        const delovniki_url = rows.map(row => ({
            ID: row.ID,
            dan: row.Dan,
            Zacetek: row.Zacetek,
            Konec: row.Konec,
            Url: utils.urlVira(req, `/delovniki/${row.ID}`)
        }));

        res.json(delovniki_url);

    } catch (err) {
        next(err);
    }
});

/**
 * @swagger
 * /delovniki:
 *   post:
 *     summary: Dodajanje delovnega časa frizerja
 *     description: |
 *       Frizer lahko doda en ali več `delovnih intervalov` na isti dan
 *       (npr. dopoldanski in popoldanski termin).
 *       Časovni intervali se ne smejo prekrivati.
 *     tags:
 *       - Delovniki
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dan
 *               - zacetek
 *               - konec
 *             properties:
 *               dan:
 *                 type: string
 *                 example: "2025-11-24"
 *               zacetek:
 *                 type: string
 *                 example: "08:00"
 *               konec:
 *                 type: string
 *                 example: "12:00"
 *     responses:
 *       201:
 *         description: Delovnik uspešno dodan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Delovnik uspešno dodan.
 *                 delovnik:
 *                   type: object
 *                   properties:
 *                     frizer_ID:
 *                       type: integer
 *                       example: 1
 *                     dan:
 *                       type: string
 *                       example: "2025-11-24"
 *                     zacetek:
 *                       type: string
 *                       example: "08:00"
 *                     konec:
 *                       type: string
 *                       example: "12:00"
 *       400:
 *         description: Napačni ali manjkajoči podatki
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Začetek mora biti pred koncem.
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
 *       409:
 *         description: Časovni interval se prekriva z obstoječim delovnikom
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Delovnik se časovno prekriva z obstoječim.
 *       500:
 *         description: Napaka na strežniku
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Napaka na strežniku.
 */
// Rezervacija delovnika frizerja
router.post('/', auth.avtentikacijaJWT, auth.dovoliRole('frizer'), async (req, res, next) => {
    try {
        const frizer_ID = req.user.ID;
        const { dan, zacetek, konec } = req.body;

        // Validacija
        if (!dan || !zacetek || !konec) {
            return res.status(400).json({
                message: 'Manjkajoči podatki (dan, zacetek, konec).'
            });
        }

        if (zacetek >= konec) {
            return res.status(400).json({
                message: 'Začetek mora biti pred koncem.'
            });
        }

        // Preveri prekrivanje časov
        const [prekrivanja] = await pool.execute(
            `SELECT ID
            FROM delovnik
            WHERE Frizerji_id = ?
             AND Dan = ?
             AND Zacetek < ?
             AND Konec > ?`,
            [frizer_ID, dan, konec, zacetek]
        );

        if (prekrivanja.length > 0) {
            return res.status(409).json({
                message: 'Delovnik se časovno prekriva z obstoječim.'
            });
        }

        // Vstavi nov delovnik
        await pool.execute(
            `INSERT INTO delovnik (Frizerji_id, Dan, Zacetek, Konec)
            VALUES (?, ?, ?, ?)`,
            [frizer_ID, dan, zacetek, konec]
        );

        res.status(201).json({
            message: 'Delovnik uspešno dodan.',
            delovnik: {
                frizer_ID,
                dan,
                zacetek,
                konec
            }
        });

    } catch (err) {
        next(err);
    }
});

/**
 * @swagger
 * /delovniki/{id}:
 *   put:
 *     summary: Posodobi delovnik frizerja
 *     description: |
 *       Posodobi delovnik prijavljenega frizerja.
 *       Posodobi `datum` in `čas začetka` ter `konca` delovnika glede na njegov `ID`.
 *     tags:
 *       - Delovniki
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Enolični id delovnika
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dan
 *               - zacetek
 *               - konec
 *             properties:
 *               dan:
 *                 type: string
 *                 example: "2025-11-24"
 *               zacetek:
 *                 type: string
 *                 example: "08:00"
 *               konec:
 *                 type: string
 *                 example: "12:00"
 *     responses:
 *       200:
 *         description: Delovnik uspešno posodobljen
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Delovnik uspešno posodobljen.
 *       400:
 *         description: Napačni ali manjkajoči podatki
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Manjkajoči podatki.
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
 *         description: Delovnik ne obstaja
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Delovnik ne obstaja.
 *       409:
 *         description: Časovni interval se prekriva z obstoječim delovnikom
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Delovnik se časovno prekriva z obstoječim.
 *       500:
 *         description: Napaka na strežniku
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Napaka na strežniku.
 */
// Posodobitev delovnika frizerja
router.put('/:id', auth.avtentikacijaJWT, auth.dovoliRole('frizer'), async (req, res, next) => {
    try {
        const frizer_ID = req.user.ID;
        const delovnik_ID = req.params.id;
        const { dan, zacetek, konec } = req.body;

        if (!dan || !zacetek || !konec) {
            return res.status(400).json({
                message: 'Manjkajoči podatki.'
            });
        }

        if (zacetek >= konec) {
            return res.status(400).json({
                message: 'Začetek mora biti pred koncem.'
            });
        }

        // Preveri obstoj in lastništvo
        const [[obstaja]] = await pool.execute(
            `SELECT ID
            FROM delovnik
            WHERE ID = ? AND Frizerji_id = ?`,
            [delovnik_ID, frizer_ID]
        );

        if (!obstaja) {
            return res.status(404).json({
                message: 'Delovnik ne obstaja.'
            });
        }

        // Preveri prekrivanje (izključi samega sebe)
        const [prekrivanja] = await pool.execute(
            `SELECT ID
            FROM delovnik
            WHERE Frizerji_id = ?
            AND Dan = ?
            AND ID <> ?
            AND Zacetek < ?
            AND Konec > ?`,
            [frizer_ID, dan, delovnik_ID, konec, zacetek]
        );

        if (prekrivanja.length > 0) {
            return res.status(409).json({
                message: 'Delovnik se časovno prekriva z obstoječim.'
            });
        }

        // Update
        await pool.execute(
            `UPDATE delovnik
            SET Dan = ?, Zacetek = ?, Konec = ?
            WHERE ID = ?`,
            [dan, zacetek, konec, delovnik_ID]
        );

        res.json({
            message: 'Delovnik uspešno posodobljen.'
        });

    } catch (err) {
        next(err);
    }
});

/**
 * @swagger
 * /delovniki/{id}:
 *   delete:
 *     summary: Izbriši delovnik frizerja
 *     description: Izbriši delovnik prijavljenega frizerja glede na njegov `ID`.
 *     tags:
 *       - Delovniki
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Enolični id delovnika
 *         example: 1
 *     responses:
 *       200:
 *         description: Delovnik uspešno izbrisan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Delovnik uspešno izbrisan.
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
 *         description: Delovnik ne obstaja
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Delovnik ne obstaja.
 *       500:
 *         description: Napaka na strežniku
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Napaka na strežniku.
 */
// Brisanje delovnika frizerja
router.delete('/:id', auth.avtentikacijaJWT, auth.dovoliRole('frizer'), async (req, res, next) => {
    try {
        const frizer_ID = req.user.ID;
        const delovnik_ID = req.params.id;

        const [result] = await pool.execute(
            `DELETE FROM delovnik
            WHERE ID = ? AND Frizerji_id = ?`,
            [delovnik_ID, frizer_ID]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: 'Delovnik ne obstaja.'
            });
        }

        res.json({
            message: 'Delovnik uspešno izbrisan.'
        });

    } catch (err) {
        next(err);
    }
});

module.exports = router;
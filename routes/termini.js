const express = require('express');
const router = express.Router();
const pool = require('../utils/db.js');
const utils = require('../utils/utils.js');
const auth = require('../utils/auth.js');

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

        if (!frizer_ID || !dan || !ura || !Array.isArray(storitve) || storitve.length === 0) {
            return res.status(400).json({ message: 'Manjkajoči podatki za rezervacijo.' });
        }

        const cas_termina = `${dan} ${ura}:00`;

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
            Status = 'rezervirano' AND
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
            message: 'Termin uspešno rezerviran.', 
            success: true,
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

module.exports = router;
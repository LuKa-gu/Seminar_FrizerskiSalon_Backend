const express = require('express');
const router = express.Router();
const { uporabnikObstaja } = require('../utils/utils');

/**
 * @swagger
 * /uporabniki/obstaja/{uporabnisko_ime}:
 *   get:
 *     summary: Preveri, ali uporabniško ime nekega uporabnika obstaja
 *     parameters:
 *       - in: path
 *         name: uporabnisko_ime
 *         schema:
 *           type: string
 *         required: true
 *         description: Uporabniško ime, ki ga želimo preveriti
 *     responses:
 *       200:
 *         description: true ali false
 *         content:
 *           application/json:
 *             schema:
 *               type: boolean
 */
router.get('/obstaja/:uporabnisko_ime', async (req, res) => {
    try {
        const obstaja = await uporabnikObstaja(req.params.uporabnisko_ime);
        res.status(200).json( obstaja );
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

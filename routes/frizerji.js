const express = require('express');
const router = express.Router();
const { frizerObstaja } = require('../utils/utils');

/**
 * @swagger
 * /frizerji/obstaja/{uporabnisko_ime}:
 *   get:
 *     summary: Preveri, ali uporabniško ime nekega frizerja obstaja
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
        const obstaja = await frizerObstaja(req.params.uporabnisko_ime);
        res.json( obstaja );
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

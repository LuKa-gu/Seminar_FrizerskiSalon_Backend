const jwt = require('jsonwebtoken');

function generirajJWT(payload, role = 'uporabnik') {
    let expiresIn = process.env.JWT_EXPIRES_IN_UPOR || '7d';
    if (role === 'frizer') {
        expiresIn = process.env.JWT_EXPIRES_IN_FRI || '3d';
    }
    return jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn }
    );
}

function avtentikacijaJWT(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Manjka avtentikacijski token.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err || !user || !user.ID) {
            return res.status(401).json({ message: 'Token ni veljaven ali je potekel.' });
        }

        req.user = user;
        next();
    });
}

function dovoliRole(...dovoljeneRole) {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(403).json({ message: 'Ni podatka o uporabnikovi vlogi.' });
        }

        if (!dovoljeneRole.includes(req.user.role)) {
            return res.status(403).json({ message: 'Nimate pravic za to dejanje.' });
        }

        next();
    };
}


module.exports = {
    generirajJWT,
    avtentikacijaJWT,
    dovoliRole
};
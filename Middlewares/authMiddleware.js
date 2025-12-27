const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
    try {
        const token = req.header("Authorization")?.split(" ")[1];

        // if (!token) return res.status(401).json({ error: "Access denied" });

        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        next();
        // res.status(400).json({ error: "Invalid token" });
    }
};

module.exports = authMiddleware;
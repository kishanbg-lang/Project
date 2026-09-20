const jwt = require('jsonwebtoken');
require('dotenv').config();

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  const token = header && header.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'No token provided. Please log in.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token. Please log in again.' });
    }
    req.studentId = decoded.id;
    next();
  });
}

module.exports = authMiddleware;

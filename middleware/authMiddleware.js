const jwt = require("jsonwebtoken");

// Verifies the JWT sent in the Authorization header.
// Usage: Authorization: Bearer <token>
const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401);
    return next(new Error("Not authorized, no token provided"));
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Attach decoded user info (id, username) to the request for later use
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401);
    next(new Error("Not authorized, token invalid or expired"));
  }
};

module.exports = { protect };
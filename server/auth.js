const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-env";
const ENC_SECRET = process.env.ENC_SECRET || "change-me-encryption-secret";

function getAesKey() {
  return crypto.createHash("sha256").update(ENC_SECRET).digest();
}

function encryptSecret(plainText) {
  const iv = crypto.randomBytes(16);
  const key = getAesKey();
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptSecret(cipherText) {
  const [ivHex, dataHex] = cipherText.split(":");
  const key = getAesKey();
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

function createToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      walletAddress: user.wallet_address,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  const token = header.replace("Bearer ", "");

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired auth token" });
  }
}

module.exports = {
  authRequired,
  createToken,
  decryptSecret,
  encryptSecret,
};
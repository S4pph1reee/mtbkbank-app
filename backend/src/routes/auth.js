const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const router = express.Router();

// POST /api/auth/login — PIN auth
router.post('/login', [
  body('phone').isString().notEmpty().withMessage('Телефон обязателен'),
  body('pin').isString().isLength({ min: 4, max: 6 }).withMessage('ПИН-код должен быть 4-6 символов')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { phone, pin } = req.body;

    const user = await req.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    const validPin = await bcrypt.compare(pin, user.pin);
    if (!validPin) {
      return res.status(401).json({ error: 'Неверный ПИН-код' });
    }

    const accessToken = jwt.sign(
      { userId: user.id, isAdmin: user.isAdmin },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, refresh: true },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token: accessToken, // for backwards compatibility on frontend
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        mbPoints: user.mbPoints,
        status: user.status,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/verify — verify PIN (for sensitive operations)
router.post('/verify', [
  body('phone').isString().notEmpty(),
  body('pin').isString().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ valid: false, errors: errors.array() });

    const { phone, pin } = req.body;
    const user = await req.prisma.user.findUnique({ where: { phone } });
    if (!user) return res.status(401).json({ valid: false });

    const validPin = await bcrypt.compare(pin, user.pin);
    res.json({ valid: validPin });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

    jwt.verify(refreshToken, process.env.JWT_SECRET, async (err, decoded) => {
      if (err || !decoded.refresh) return res.status(403).json({ error: 'Invalid refresh token' });

      const user = await req.prisma.user.findUnique({ where: { id: decoded.userId } });
      if (!user) return res.status(404).json({ error: 'User not found' });

      const newAccessToken = jwt.sign(
        { userId: user.id, isAdmin: user.isAdmin },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      res.json({ accessToken: newAccessToken });
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

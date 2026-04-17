const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

// POST /api/auth/login — PIN auth
router.post('/login', async (req, res) => {
  try {
    const { phone, pin } = req.body;
    if (!phone || !pin) {
      return res.status(400).json({ error: 'Укажите телефон и ПИН-код' });
    }

    const user = await req.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    const validPin = await bcrypt.compare(pin, user.pin);
    if (!validPin) {
      return res.status(401).json({ error: 'Неверный ПИН-код' });
    }

    const token = jwt.sign(
      { userId: user.id, isAdmin: user.isAdmin },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
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
router.post('/verify', async (req, res) => {
  try {
    const { phone, pin } = req.body;
    const user = await req.prisma.user.findUnique({ where: { phone } });
    if (!user) return res.status(401).json({ valid: false });

    const validPin = await bcrypt.compare(pin, user.pin);
    res.json({ valid: validPin });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

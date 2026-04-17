const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/subscriptions
router.get('/', async (req, res) => {
  try {
    const subs = await req.prisma.subscription.findMany({
      where: { userId: req.userId },
      orderBy: { nextPayment: 'asc' },
    });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/subscriptions/:id
router.put('/:id', async (req, res) => {
  try {
    const { isActive } = req.body;
    const sub = await req.prisma.subscription.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!sub) return res.status(404).json({ error: 'Подписка не найдена' });

    const updated = await req.prisma.subscription.update({
      where: { id: sub.id },
      data: { isActive },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

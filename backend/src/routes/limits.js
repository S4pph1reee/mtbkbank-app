const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/limits
router.get('/', async (req, res) => {
  try {
    const limits = await req.prisma.spendingLimit.findMany({
      where: { userId: req.userId },
    });
    res.json(limits);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/limits/:id
router.put('/:id', async (req, res) => {
  try {
    const { limitAmount } = req.body;
    const limit = await req.prisma.spendingLimit.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!limit) return res.status(404).json({ error: 'Лимит не найден' });

    const updated = await req.prisma.spendingLimit.update({
      where: { id: limit.id },
      data: { limitAmount },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

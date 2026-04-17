const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/users/me
router.get('/me', async (req, res) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true, name: true, phone: true, avatarUrl: true,
        mbPoints: true, status: true, isAdmin: true, createdAt: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/users/me
router.put('/me', async (req, res) => {
  try {
    const { name, avatarUrl } = req.body;
    const user = await req.prisma.user.update({
      where: { id: req.userId },
      data: { ...(name && { name }), ...(avatarUrl && { avatarUrl }) },
      select: {
        id: true, name: true, phone: true, avatarUrl: true,
        mbPoints: true, status: true,
      },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/users/me/stats
router.get('/me/stats', async (req, res) => {
  try {
    const [user, cardCount, deckCount, tradeCount] = await Promise.all([
      req.prisma.user.findUnique({
        where: { id: req.userId },
        select: { mbPoints: true, status: true },
      }),
      req.prisma.userCard.count({ where: { userId: req.userId } }),
      req.prisma.deck.count({ where: { userId: req.userId } }),
      req.prisma.cardTrade.count({
        where: { fromUserId: req.userId, status: 'ACCEPTED' },
      }),
    ]);

    res.json({
      mbPoints: user.mbPoints,
      status: user.status,
      totalCards: cardCount,
      totalDecks: deckCount,
      completedTrades: tradeCount,
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { sacrificeCard, convertCardToPoints } = require('../services/cardEngine');
const router = express.Router();

router.use(authMiddleware);

// GET /api/cards/collection — all available card templates
router.get('/collection', async (req, res) => {
  try {
    const { rarity } = req.query;
    const where = { isActive: true };
    if (rarity) where.rarity = rarity;

    const cards = await req.prisma.collectionCard.findMany({
      where,
      orderBy: [{ rarity: 'asc' }, { name: 'asc' }],
    });
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/cards/inventory — user's collected cards
router.get('/inventory', async (req, res) => {
  try {
    const { rarity, sort = 'date' } = req.query;

    const where = { userId: req.userId };

    const cards = await req.prisma.userCard.findMany({
      where,
      include: {
        collectionCard: true,
        deckCards: { include: { deck: true } },
      },
      orderBy: sort === 'rarity'
        ? { collectionCard: { rarity: 'desc' } }
        : { acquiredAt: 'desc' },
    });

    // Filter by rarity after include
    const filtered = rarity
      ? cards.filter(c => c.collectionCard.rarity === rarity)
      : cards;

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/cards/:id
router.get('/:id', async (req, res) => {
  try {
    const card = await req.prisma.userCard.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: {
        collectionCard: true,
        deckCards: { include: { deck: true } },
      },
    });
    if (!card) return res.status(404).json({ error: 'Карта не найдена' });
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/cards/sacrifice
router.post('/sacrifice', async (req, res) => {
  try {
    const { sacrificeId, targetId } = req.body;
    if (!sacrificeId || !targetId) {
      return res.status(400).json({ error: 'Укажите карту для жертвы и целевую карту' });
    }

    const result = await sacrificeCard(req.prisma, req.userId, sacrificeId, targetId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/cards/convert — convert card to MB points
router.post('/convert', async (req, res) => {
  try {
    const { cardId } = req.body;
    if (!cardId) return res.status(400).json({ error: 'Укажите карту' });

    const result = await convertCardToPoints(req.prisma, req.userId, cardId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/cards/rarities — rarity distribution stats for user
router.get('/stats/rarities', async (req, res) => {
  try {
    const cards = await req.prisma.userCard.findMany({
      where: { userId: req.userId },
      include: { collectionCard: { select: { rarity: true } } },
    });

    const stats = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 };
    for (const c of cards) {
      stats[c.collectionCard.rarity]++;
    }

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

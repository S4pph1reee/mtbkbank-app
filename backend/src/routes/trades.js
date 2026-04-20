const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/trades
router.get('/', async (req, res) => {
  try {
    const { status = 'PENDING' } = req.query;
    const trades = await req.prisma.cardTrade.findMany({
      where: {
        OR: [
          { fromUserId: req.userId },
          { toUserId: req.userId },
        ],
        status,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(trades);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/trades — create trade offer
router.post('/', async (req, res) => {
  try {
    const { offeredCardId, requestedCardId, toUserId, mbPointsOffer = 0 } = req.body;

    if (!offeredCardId || !toUserId) {
      return res.status(400).json({ error: 'Укажите карту и получателя' });
    }

    // Verify card belongs to user
    const card = await req.prisma.userCard.findFirst({
      where: { id: offeredCardId, userId: req.userId },
    });
    if (!card) return res.status(404).json({ error: 'Карта не найдена' });

    // Verify user has enough mbPoints
    if (mbPointsOffer > 0) {
      const user = await req.prisma.user.findUnique({ where: { id: req.userId } });
      if (user.mbPoints < mbPointsOffer) {
        return res.status(400).json({ error: 'Недостаточно MB points' });
      }
    }

    const trade = await req.prisma.cardTrade.create({
      data: {
        fromUserId: req.userId,
        toUserId,
        offeredCardId,
        requestedCardId,
        mbPointsOffer,
      },
    });

    // Notify recipient
    await req.prisma.notification.create({
      data: {
        userId: toUserId,
        title: '🔄 Предложение обмена',
        body: 'Вам предложили обменять карточку! Проверьте раздел обменов.',
        icon: 'swap_horiz',
      },
    });

    res.json(trade);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/trades/:id/accept
router.put('/:id/accept', async (req, res) => {
  try {
    const trade = await req.prisma.cardTrade.findFirst({
      where: { id: req.params.id, toUserId: req.userId, status: 'PENDING' },
    });
    if (!trade) return res.status(404).json({ error: 'Обмен не найден' });

    // Verify offered card still belongs to fromUserId securely preventing exploits
    const offeredCard = await req.prisma.userCard.findFirst({
      where: { id: trade.offeredCardId, userId: trade.fromUserId },
    });
    if (!offeredCard) {
      await req.prisma.cardTrade.update({ where: { id: trade.id }, data: { status: 'CANCELLED' } });
      return res.status(400).json({ error: 'Карта отправителя больше не доступна' });
    }

    // Verify requested card still belongs to acceptor
    if (trade.requestedCardId) {
      const requestedCard = await req.prisma.userCard.findFirst({
        where: { id: trade.requestedCardId, userId: req.userId },
      });
      if (!requestedCard) {
        await req.prisma.cardTrade.update({ where: { id: trade.id }, data: { status: 'CANCELLED' } });
        return res.status(400).json({ error: 'У вас больше нет запрашиваемой карты' });
      }
    }

    // Verify MB point constraints haven't shifted
    if (trade.mbPointsOffer > 0) {
      const fromUser = await req.prisma.user.findUnique({ where: { id: trade.fromUserId } });
      if (fromUser.mbPoints < trade.mbPointsOffer) {
        await req.prisma.cardTrade.update({ where: { id: trade.id }, data: { status: 'CANCELLED' } });
        return res.status(400).json({ error: 'У отправителя больше нет средств для этого обмена' });
      }
    }

    // Transfer offered card
    await req.prisma.deckCard.deleteMany({ where: { userCardId: trade.offeredCardId } });
    await req.prisma.userCard.update({
      where: { id: trade.offeredCardId },
      data: { userId: req.userId, source: 'TRADE' },
    });

    // Transfer requested card if it exists
    if (trade.requestedCardId) {
      await req.prisma.deckCard.deleteMany({ where: { userCardId: trade.requestedCardId } });
      await req.prisma.userCard.update({
        where: { id: trade.requestedCardId },
        data: { userId: trade.fromUserId, source: 'TRADE' },
      });
    }

    // Transfer MB points if included
    if (trade.mbPointsOffer > 0) {
      await req.prisma.user.update({
        where: { id: trade.fromUserId },
        data: { mbPoints: { decrement: trade.mbPointsOffer } },
      });
      await req.prisma.user.update({
        where: { id: req.userId },
        data: { mbPoints: { increment: trade.mbPointsOffer } },
      });
    }

    await req.prisma.cardTrade.update({
      where: { id: trade.id },
      data: { status: 'ACCEPTED' },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Trade accept error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/trades/:id/reject
router.put('/:id/reject', async (req, res) => {
  try {
    const trade = await req.prisma.cardTrade.findFirst({
      where: { id: req.params.id, toUserId: req.userId, status: 'PENDING' },
    });
    if (!trade) return res.status(404).json({ error: 'Обмен не найден' });

    await req.prisma.cardTrade.update({
      where: { id: trade.id },
      data: { status: 'REJECTED' },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/trades/send — send card as gift
router.post('/send', async (req, res) => {
  try {
    const { cardId, toUserId } = req.body;
    if (!cardId || !toUserId) {
      return res.status(400).json({ error: 'Укажите карту и получателя' });
    }

    const card = await req.prisma.userCard.findFirst({
      where: { id: cardId, userId: req.userId },
      include: { collectionCard: true },
    });
    if (!card) return res.status(404).json({ error: 'Карта не найдена' });

    // Remove from decks
    await req.prisma.deckCard.deleteMany({ where: { userCardId: cardId } });

    // Transfer ownership
    await req.prisma.userCard.update({
      where: { id: cardId },
      data: { userId: toUserId, source: 'GIFT' },
    });

    // Create trade record
    await req.prisma.cardTrade.create({
      data: {
        fromUserId: req.userId,
        toUserId,
        offeredCardId: cardId,
        status: 'ACCEPTED',
        isGift: true,
      },
    });

    // Notify recipient
    await req.prisma.notification.create({
      data: {
        userId: toUserId,
        title: '🎁 Подарок!',
        body: `Вам подарили карточку "${card.collectionCard.name}"!`,
        icon: 'card_giftcard',
      },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

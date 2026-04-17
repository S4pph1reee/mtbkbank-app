const express = require('express');
const bcrypt = require('bcryptjs');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { processCardDrop } = require('../services/cardEngine');
const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

// ==================== USERS ====================

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const users = await req.prisma.user.findMany({
      select: {
        id: true, name: true, phone: true, mbPoints: true,
        status: true, isAdmin: true, createdAt: true,
        _count: { select: { userCards: true, accounts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', async (req, res) => {
  try {
    const { name, mbPoints, status, pin } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (mbPoints !== undefined) data.mbPoints = mbPoints;
    if (status !== undefined) data.status = status;
    if (pin) data.pin = await bcrypt.hash(pin, 10);

    const user = await req.prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, name: true, phone: true, mbPoints: true, status: true },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/admin/users
router.post('/users', async (req, res) => {
  try {
    const { name, phone, pin, mbPoints = 0, status = 'STANDARD', isAdmin = false } = req.body;
    const hashedPin = await bcrypt.hash(pin, 10);

    const user = await req.prisma.user.create({
      data: { name, phone, pin: hashedPin, mbPoints, status, isAdmin },
    });

    // Create default main account
    await req.prisma.bankAccount.create({
      data: {
        userId: user.id,
        name: 'Главный счёт',
        type: 'main',
        balance: 0,
        currency: 'RUB',
      },
    });

    res.json(user);
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Ошибка создания пользователя' });
  }
});

// ==================== CARD TEMPLATES ====================

// GET /api/admin/cards
router.get('/cards', async (req, res) => {
  try {
    const cards = await req.prisma.collectionCard.findMany({
      orderBy: [{ rarity: 'asc' }, { name: 'asc' }],
    });
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/admin/cards
router.post('/cards', async (req, res) => {
  try {
    const card = await req.prisma.collectionCard.create({ data: req.body });
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка создания карты' });
  }
});

// PUT /api/admin/cards/:id
router.put('/cards/:id', async (req, res) => {
  try {
    const card = await req.prisma.collectionCard.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления карты' });
  }
});

// DELETE /api/admin/cards/:id
router.delete('/cards/:id', async (req, res) => {
  try {
    await req.prisma.collectionCard.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

// ==================== GRANT CARDS ====================

// POST /api/admin/grant-card
router.post('/grant-card', async (req, res) => {
  try {
    const { userId, collectionCardId } = req.body;
    const card = await req.prisma.collectionCard.findUnique({
      where: { id: collectionCardId },
    });
    if (!card) return res.status(404).json({ error: 'Шаблон карты не найден' });

    const userCard = await req.prisma.userCard.create({
      data: {
        userId,
        collectionCardId,
        health: card.maxHealth,
        source: 'ADMIN',
      },
      include: { collectionCard: true },
    });

    res.json(userCard);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка выдачи карты' });
  }
});

// ==================== SIMULATE TRANSACTION ====================

// POST /api/admin/simulate-transaction
router.post('/simulate-transaction', async (req, res) => {
  try {
    const { userId, accountId, amount, category, merchant, merchantIcon } = req.body;

    const account = await req.prisma.bankAccount.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) return res.status(404).json({ error: 'Счёт не найден' });

    const [updatedAccount, transaction] = await req.prisma.$transaction([
      req.prisma.bankAccount.update({
        where: { id: accountId },
        data: { balance: { decrement: amount } },
      }),
      req.prisma.transaction.create({
        data: {
          userId,
          fromAccountId: accountId,
          amount,
          type: 'PURCHASE',
          category: category || 'Покупки',
          merchant: merchant || 'Тестовый магазин',
          merchantIcon: merchantIcon || 'shopping_bag',
          description: `Имитация покупки: ${merchant || 'Тестовый магазин'}`,
        },
      }),
    ]);

    // Process card drop
    const droppedCard = await processCardDrop(req.prisma, userId, transaction.id);

    res.json({
      account: updatedAccount,
      transaction,
      droppedCard: droppedCard ? {
        id: droppedCard.id,
        name: droppedCard.collectionCard.name,
        rarity: droppedCard.collectionCard.rarity,
      } : null,
    });
  } catch (err) {
    console.error('Simulate transaction error:', err);
    res.status(500).json({ error: 'Ошибка имитации' });
  }
});

// ==================== QUESTS ====================

// GET /api/admin/quests
router.get('/quests', async (req, res) => {
  try {
    const quests = await req.prisma.quest.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(quests);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/admin/quests
router.post('/quests', async (req, res) => {
  try {
    const quest = await req.prisma.quest.create({ data: req.body });
    res.json(quest);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка создания квеста' });
  }
});

// PUT /api/admin/quests/:id
router.put('/quests/:id', async (req, res) => {
  try {
    const quest = await req.prisma.quest.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(quest);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

// ==================== SYSTEM CONFIG ====================

// GET /api/admin/config
router.get('/config', async (req, res) => {
  try {
    const configs = await req.prisma.systemConfig.findMany();
    const configMap = {};
    for (const c of configs) {
      try { configMap[c.key] = JSON.parse(c.value); }
      catch { configMap[c.key] = c.value; }
    }
    res.json(configMap);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/admin/config/:key
router.put('/config/:key', async (req, res) => {
  try {
    const { value } = req.body;
    const config = await req.prisma.systemConfig.upsert({
      where: { key: req.params.key },
      update: { value: JSON.stringify(value) },
      create: { key: req.params.key, value: JSON.stringify(value) },
    });
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ==================== DASHBOARD ====================

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const [userCount, cardCount, totalMB, transactionCount, activeDecks] = await Promise.all([
      req.prisma.user.count(),
      req.prisma.userCard.count(),
      req.prisma.user.aggregate({ _sum: { mbPoints: true } }),
      req.prisma.transaction.count(),
      req.prisma.deck.count({ where: { isActive: true } }),
    ]);

    // Rarity distribution
    const cards = await req.prisma.userCard.findMany({
      include: { collectionCard: { select: { rarity: true } } },
    });
    const rarityDist = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 };
    for (const c of cards) rarityDist[c.collectionCard.rarity]++;

    res.json({
      totalUsers: userCount,
      totalCards: cardCount,
      totalMBInCirculation: totalMB._sum.mbPoints || 0,
      totalTransactions: transactionCount,
      activeDecks,
      rarityDistribution: rarityDist,
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

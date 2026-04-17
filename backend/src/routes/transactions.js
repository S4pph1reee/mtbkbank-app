const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { processCardDrop } = require('../services/cardEngine');
const router = express.Router();

router.use(authMiddleware);

// GET /api/transactions
router.get('/', async (req, res) => {
  try {
    const { limit = 20, offset = 0, category, type } = req.query;

    const where = { userId: req.userId };
    if (category) where.category = category;
    if (type) where.type = type;

    const [transactions, total] = await Promise.all([
      req.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      req.prisma.transaction.count({ where }),
    ]);

    res.json({ transactions, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/transactions/analytics
router.get('/analytics', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const now = new Date();
    let startDate;

    if (period === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      startDate = new Date(now.getFullYear(), 0, 1);
    }

    const transactions = await req.prisma.transaction.findMany({
      where: {
        userId: req.userId,
        type: 'PURCHASE',
        createdAt: { gte: startDate },
      },
    });

    // Group by category
    const categories = {};
    let totalSpent = 0;

    for (const t of transactions) {
      const cat = t.category || 'Другое';
      if (!categories[cat]) categories[cat] = 0;
      categories[cat] += Math.abs(t.amount);
      totalSpent += Math.abs(t.amount);
    }

    const breakdown = Object.entries(categories).map(([category, amount]) => ({
      category,
      amount,
      percentage: totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0,
    })).sort((a, b) => b.amount - a.amount);

    res.json({ totalSpent, breakdown, period });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/transactions/transfer
router.post('/transfer', async (req, res) => {
  try {
    const { fromAccountId, toAccountId, amount, description } = req.body;
    if (!fromAccountId || !toAccountId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Укажите все поля перевода' });
    }

    const fromAccount = await req.prisma.bankAccount.findFirst({
      where: { id: fromAccountId, userId: req.userId },
    });
    if (!fromAccount) return res.status(404).json({ error: 'Счёт отправителя не найден' });
    if (fromAccount.balance < amount) {
      return res.status(400).json({ error: 'Недостаточно средств' });
    }

    const toAccount = await req.prisma.bankAccount.findUnique({
      where: { id: toAccountId },
    });
    if (!toAccount) return res.status(404).json({ error: 'Счёт получателя не найден' });

    const result = await req.prisma.$transaction([
      req.prisma.bankAccount.update({
        where: { id: fromAccountId },
        data: { balance: { decrement: amount } },
      }),
      req.prisma.bankAccount.update({
        where: { id: toAccountId },
        data: { balance: { increment: amount } },
      }),
      req.prisma.transaction.create({
        data: {
          userId: req.userId,
          fromAccountId,
          toAccountId,
          amount,
          type: 'TRANSFER_OUT',
          category: 'Перевод',
          merchant: description || 'Перевод',
          merchantIcon: 'sync_alt',
          description: description || `Перевод на ${amount} ${fromAccount.currency}`,
        },
      }),
    ]);

    // If toAccount belongs to another user, create a TRANSFER_IN for them
    if (toAccount.userId !== req.userId) {
      await req.prisma.transaction.create({
        data: {
          userId: toAccount.userId,
          fromAccountId,
          toAccountId,
          amount,
          type: 'TRANSFER_IN',
          category: 'Перевод',
          merchant: 'Входящий перевод',
          merchantIcon: 'account_balance_wallet',
          description: description || `Входящий перевод ${amount} ${toAccount.currency}`,
        },
      });
    }

    res.json({ success: true, transaction: result[2] });
  } catch (err) {
    console.error('Transfer error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/quests/daily
router.get('/daily', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get active quests
    const quests = await req.prisma.quest.findMany({
      where: { isActive: true, type: 'DAILY' },
    });

    // Get user progress for today
    const userQuests = await req.prisma.userQuest.findMany({
      where: {
        userId: req.userId,
        assignedAt: { gte: today },
      },
      include: { quest: true },
    });

    // Assign quests if not yet assigned today
    if (userQuests.length === 0 && quests.length > 0) {
      const toAssign = quests.slice(0, 3); // max 3 daily quests
      const created = await Promise.all(
        toAssign.map(q =>
          req.prisma.userQuest.create({
            data: {
              userId: req.userId,
              questId: q.id,
              target: 1,
            },
            include: { quest: true },
          })
        )
      );
      return res.json(created);
    }

    res.json(userQuests);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/quests/weekly
router.get('/weekly', async (req, res) => {
  try {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const userQuests = await req.prisma.userQuest.findMany({
      where: {
        userId: req.userId,
        quest: { type: 'WEEKLY' },
        assignedAt: { gte: weekStart },
      },
      include: { quest: true },
    });

    res.json(userQuests);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/quests/:id/claim
router.post('/:id/claim', async (req, res) => {
  try {
    const userQuest = await req.prisma.userQuest.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
        completed: true,
        claimed: false,
      },
      include: { quest: true },
    });

    if (!userQuest) {
      return res.status(404).json({ error: 'Квест не найден или не завершён' });
    }

    // Give reward
    if (userQuest.quest.rewardMB > 0) {
      await req.prisma.user.update({
        where: { id: req.userId },
        data: { mbPoints: { increment: userQuest.quest.rewardMB } },
      });
    }

    // Mark as claimed
    await req.prisma.userQuest.update({
      where: { id: userQuest.id },
      data: { claimed: true },
    });

    res.json({
      success: true,
      reward: { mb: userQuest.quest.rewardMB },
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

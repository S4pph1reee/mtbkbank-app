/**
 * Card Engine — core game mechanics for the card collection system.
 */

// Rarity-based configuration
const RARITY_CONFIG = {
  COMMON:    { dropChance: 0.60, mbValue: 10,   healthDecay: 2.0, healMultiplier: 0.5,  cashbackRange: [0.5, 1.5] },
  RARE:      { dropChance: 0.25, mbValue: 50,   healthDecay: 1.5, healMultiplier: 1.0,  cashbackRange: [1.5, 3.0] },
  EPIC:      { dropChance: 0.12, mbValue: 200,  healthDecay: 1.0, healMultiplier: 1.5,  cashbackRange: [3.0, 5.0] },
  LEGENDARY: { dropChance: 0.03, mbValue: 1000, healthDecay: 0.5, healMultiplier: 2.0,  cashbackRange: [5.0, 10.0] },
};

/**
 * Roll for a card drop after a purchase transaction.
 * Returns null or a rarity string.
 */
function rollCardDrop(overrideRates = null) {
  const roll = Math.random();
  const rates = overrideRates || RARITY_CONFIG;

  // 70% chance to get ANY card on a purchase
  if (roll > 0.70) return null;

  const rarityRoll = Math.random();
  let cumulative = 0;

  for (const [rarity, config] of Object.entries(rates)) {
    cumulative += config.dropChance;
    if (rarityRoll <= cumulative) {
      return rarity;
    }
  }
  return 'COMMON'; // fallback
}

/**
 * Select a random card of given rarity from available pool.
 */
async function selectRandomCard(prisma, rarity) {
  const cards = await prisma.collectionCard.findMany({
    where: { rarity, isActive: true },
  });
  if (cards.length === 0) return null;
  return cards[Math.floor(Math.random() * cards.length)];
}

/**
 * Process a card drop for a transaction.
 */
async function processCardDrop(prisma, userId, transactionId) {
  const rarity = rollCardDrop();
  if (!rarity) return null;

  const card = await selectRandomCard(prisma, rarity);
  if (!card) return null;

  const userCard = await prisma.userCard.create({
    data: {
      userId,
      collectionCardId: card.id,
      health: card.maxHealth,
      source: 'PURCHASE',
    },
    include: { collectionCard: true },
  });

  // Update transaction with dropped card
  if (transactionId) {
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { droppedCardId: userCard.id },
    });
  }

  // Create a notification
  const rarityNames = { COMMON: 'Обычная', RARE: 'Редкая', EPIC: 'Эпическая', LEGENDARY: 'Легендарная' };
  await prisma.notification.create({
    data: {
      userId,
      title: '🎴 Новая карточка!',
      body: `Вы получили ${rarityNames[rarity]} карточку "${card.name}" от ${card.brandName}!`,
      icon: 'style',
    },
  });

  return userCard;
}

/**
 * Calculate total cashback percentage for a deck.
 */
async function calculateDeckCashback(prisma, deckId) {
  const deckCards = await prisma.deckCard.findMany({
    where: { deckId },
    include: {
      userCard: {
        include: { collectionCard: true },
      },
    },
  });

  let totalCashback = 0;
  const breakdown = [];

  for (const dc of deckCards) {
    const card = dc.userCard;
    // Only cards with health > 0 contribute cashback
    if (card.health > 0) {
      const percent = card.collectionCard.cashbackPercent;
      totalCashback += percent;
      breakdown.push({
        cardName: card.collectionCard.name,
        rarity: card.collectionCard.rarity,
        cashbackPercent: percent,
        health: card.health,
        category: card.collectionCard.cashbackCategory,
      });
    }
  }

  return { totalCashback, breakdown };
}

/**
 * Decay all card health daily.
 */
async function decayAllCardHealth(prisma) {
  // Load config overrides from SystemConfig
  let decayRates = {};
  try {
    const config = await prisma.systemConfig.findUnique({ where: { key: 'health_decay_rates' } });
    if (config) decayRates = JSON.parse(config.value);
  } catch (e) { /* use defaults */ }

  for (const [rarity, config] of Object.entries(RARITY_CONFIG)) {
    const decayAmount = decayRates[rarity] || config.healthDecay;

    await prisma.userCard.updateMany({
      where: {
        health: { gt: 0 },
        collectionCard: { rarity },
      },
      data: {
        health: { decrement: decayAmount },
      },
    });
  }

  // Fix negative health
  await prisma.userCard.updateMany({
    where: { health: { lt: 0 } },
    data: { health: 0 },
  });
}

/**
 * Remove cards that have reached 0 health (user confirmed: at 0 HP card disappears).
 */
async function cleanupDeadCards(prisma) {
  // First remove from any decks
  const deadCards = await prisma.userCard.findMany({
    where: { health: { lte: 0 } },
    select: { id: true, userId: true, collectionCard: true },
  });

  for (const card of deadCards) {
    await prisma.deckCard.deleteMany({
      where: { userCardId: card.id },
    });
  }

  // Delete the dead cards
  const result = await prisma.userCard.deleteMany({
    where: { health: { lte: 0 } },
  });

  // Notify users whose cards died
  const userIds = [...new Set(deadCards.map(c => c.userId))];
  for (const uid of userIds) {
    const count = deadCards.filter(c => c.userId === uid).length;
    await prisma.notification.create({
      data: {
        userId: uid,
        title: '💀 Карточки потеряны!',
        body: `${count} карточ(ек) потеряли всё здоровье и были уничтожены. Жертвуйте карты вовремя!`,
        icon: 'heart_broken',
      },
    });
  }

  return result.count;
}

/**
 * Sacrifice one card to heal another.
 */
async function sacrificeCard(prisma, userId, sacrificeId, targetId) {
  const sacrificeCard = await prisma.userCard.findFirst({
    where: { id: sacrificeId, userId },
    include: { collectionCard: true },
  });

  const targetCard = await prisma.userCard.findFirst({
    where: { id: targetId, userId },
    include: { collectionCard: true },
  });

  if (!sacrificeCard) throw new Error('Карта для жертвы не найдена');
  if (!targetCard) throw new Error('Целевая карта не найдена');
  if (sacrificeId === targetId) throw new Error('Нельзя жертвовать карту самой себе');

  const rarity = sacrificeCard.collectionCard.rarity;
  const healMultiplier = RARITY_CONFIG[rarity].healMultiplier;
  const healAmount = Math.floor(sacrificeCard.collectionCard.maxHealth * healMultiplier);

  const newHealth = Math.min(targetCard.collectionCard.maxHealth, targetCard.health + healAmount);

  // Remove sacrifice card from decks first
  await prisma.deckCard.deleteMany({ where: { userCardId: sacrificeId } });

  // Delete the sacrificed card
  await prisma.userCard.delete({ where: { id: sacrificeId } });

  // Heal the target
  const updated = await prisma.userCard.update({
    where: { id: targetId },
    data: { health: newHealth },
    include: { collectionCard: true },
  });

  return { healAmount, newHealth, card: updated };
}

/**
 * Convert a card to MB points.
 */
async function convertCardToPoints(prisma, userId, cardId) {
  const card = await prisma.userCard.findFirst({
    where: { id: cardId, userId },
    include: { collectionCard: true },
  });

  if (!card) throw new Error('Карта не найдена');

  const baseMB = card.collectionCard.mbValue;
  // Bonus for remaining health: up to +50% for full health
  const healthBonus = Math.floor(baseMB * (card.health / card.collectionCard.maxHealth) * 0.5);
  const totalMB = baseMB + healthBonus;

  // Remove from decks
  await prisma.deckCard.deleteMany({ where: { userCardId: cardId } });

  // Delete the card
  await prisma.userCard.delete({ where: { id: cardId } });

  // Add MB points to user
  await prisma.user.update({
    where: { id: userId },
    data: { mbPoints: { increment: totalMB } },
  });

  return { baseMB, healthBonus, totalMB };
}

module.exports = {
  RARITY_CONFIG,
  rollCardDrop,
  selectRandomCard,
  processCardDrop,
  calculateDeckCashback,
  decayAllCardHealth,
  cleanupDeadCards,
  sacrificeCard,
  convertCardToPoints,
};

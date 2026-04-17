require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const accountRoutes = require('./routes/accounts');
const transactionRoutes = require('./routes/transactions');
const paymentRoutes = require('./routes/payments');
const cardRoutes = require('./routes/cards');
const deckRoutes = require('./routes/decks');
const tradeRoutes = require('./routes/trades');
const questRoutes = require('./routes/quests');
const subscriptionRoutes = require('./routes/subscriptions');
const limitRoutes = require('./routes/limits');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');
const { decayAllCardHealth, cleanupDeadCards } = require('./services/cardEngine');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Make prisma available to routes
app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/decks', deckRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/quests', questRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/limits', limitRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Cron: Health decay every day at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('[CRON] Running daily card health decay...');
  try {
    await decayAllCardHealth(prisma);
    await cleanupDeadCards(prisma);
    console.log('[CRON] Health decay complete.');
  } catch (err) {
    console.error('[CRON] Health decay error:', err);
  }
});

app.listen(PORT, () => {
  console.log(`🏦 MTBBank API running on port ${PORT}`);
});

module.exports = app;

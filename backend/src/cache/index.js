const { createClient } = require('redis');

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

// Connect asynchronously (we don't strictly await it so app can boot without crashing if redis is down)
redisClient.connect().catch(e => {
  console.log('Redis connection error (cache will be bypassed):', e.message);
});

async function getCached(key) {
  try {
    if (!redisClient.isReady) return null;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.warn(`Redis GET error for key ${key}:`, error.message);
    return null;
  }
}

async function setCached(key, value, ttlSeconds) {
  try {
    if (!redisClient.isReady) return;
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.warn(`Redis SET error for key ${key}:`, error.message);
  }
}

async function invalidatePattern(pattern) {
  try {
    if (!redisClient.isReady) return;
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    console.warn(`Redis INVALIDATE error for pattern ${pattern}:`, error.message);
  }
}

module.exports = {
  redisClient,
  getCached,
  setCached,
  invalidatePattern
};

/**
 * Seed ML test data: user "ml_test_user" and 30+ accepted training samples
 * so the auto-retrain pipeline can trigger.
 *
 * Usage: node seed-ml.js
 * Requires: MONGO_URI or MONGODB_URI in .env or environment
 */

const path = require('path');
const fs = require('fs');

// Load .env from project root if it exists (no dotenv dependency)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const TEST_USER_ID = 'ml_test_user';
const ACCEPTED_COUNT = 32;

if (!MONGO_URI) {
  console.error('Set MONGO_URI or MONGODB_URI in .env or environment.');
  process.exit(1);
}

const locations = ['home', 'work', 'outside'];
const weathers = ['sunny', 'cloudy', 'rain'];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

async function seed() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const users = db.collection('users');
  await users.updateOne(
    { userId: TEST_USER_ID },
    {
      $set: {
        userId: TEST_USER_ID,
        name: 'ML Test User',
        email: 'ml_test_user@example.com',
        mlTrained: false,
        lastTrainingAt: null,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
  console.log('User "%s" ensured.', TEST_USER_ID);

  const trainingSamples = db.collection('training_samples');
  const existing = await trainingSamples.countDocuments({
    userId: TEST_USER_ID,
    accepted: true,
  });

  if (existing >= ACCEPTED_COUNT) {
    console.log(
      'Already %d accepted training samples for %s. No new samples inserted.',
      existing,
      TEST_USER_ID
    );
  } else {
    const toInsert = [];
    const now = new Date();
    for (let i = existing; i < ACCEPTED_COUNT; i++) {
      const hour = 8 + (i % 10);
      toInsert.push({
        userId: TEST_USER_ID,
        time: `${pad(hour)}:${pad((i * 7) % 60)}`,
        location: randomItem(locations),
        weather: randomItem(weathers),
        focusHours: 1 + (i % 4),
        suggestionType: 'break',
        accepted: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    await trainingSamples.insertMany(toInsert);
    console.log('Inserted %d training samples (accepted: true).', toInsert.length);
  }

  const total = await trainingSamples.countDocuments({
    userId: TEST_USER_ID,
    accepted: true,
  });
  console.log('Total accepted samples for "%s": %d', TEST_USER_ID, total);
  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

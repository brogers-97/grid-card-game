// Reset password script - run with: node reset-password.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const USERNAME = 'silencedkhan';
const NEW_PASSWORD = 'Brian@69';

async function resetPassword() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const hash = bcrypt.hashSync(NEW_PASSWORD, 10);
  const result = await db.collection('users').updateOne(
    { username: USERNAME },
    { $set: { passwordHash: hash } }
  );
  if (result.matchedCount > 0) {
    console.log(`Password reset for "${USERNAME}" to "${NEW_PASSWORD}"`);
  } else {
    console.log(`User "${USERNAME}" not found!`);
  }
  process.exit();
}

resetPassword().catch(err => { console.error(err); process.exit(1); });
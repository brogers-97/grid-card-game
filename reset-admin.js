// Run this script once to reset admin password
// Usage: node reset-admin.js YOUR_NEW_PASSWORD
// Example: node reset-admin.js admin123

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDB, User } = require('./database');

async function resetAdmin() {
  const newPassword = process.argv[2] || 'admin123';
  
  console.log('Connecting to database...');
  await connectDB();
  
  console.log('Resetting admin password...');
  
  try {
    // Delete existing admin user first
    const deleteResult = await User.deleteOne({ username: 'admin' });
    console.log('Deleted existing admin:', deleteResult.deletedCount > 0 ? 'yes' : 'no');
    
    // Wait a moment for deletion to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Create admin user directly
    const adminUser = new User({
      username: 'admin',
      passwordHash: hashedPassword,
      cards: {},
      decks: [],
      gold: 1000,
      stats: { campaignWins: 0, multiplayerWins: 0, multiplayerLosses: 0 },
      campaign: { currentLevel: 1, starsEarned: {} }
    });
    
    await adminUser.save();
    
    console.log('');
    console.log('=================================');
    console.log('Admin password reset successfully!');
    console.log('Username: admin');
    console.log('Password: ' + newPassword);
    console.log('=================================');
    console.log('');
    console.log('You can now delete this file (reset-admin.js)');
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

resetAdmin();
/**
 * One-time seed: create the default HR admin user.
 * Run with: npx ts-node src/scripts/create-hr.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserSchema } from '../users/schemas/user.schema';

async function main() {
  const uri = process.env.MONGO_URI ?? process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGO_URI or MONGODB_URI is not set in environment');
  }

  await mongoose.connect(uri);
  console.log('[seed] Connected to MongoDB');

  const UserModel =
    (mongoose.models[User.name] as mongoose.Model<any>) ??
    mongoose.model(User.name, UserSchema);

  const email = 'hr@ava.com';
  const existing = await UserModel.findOne({ email }).exec();

  if (existing) {
    console.log('[seed] User already exists — skipping');
    return;
  }

  const hashedPassword = await bcrypt.hash('hr@ava2026', 10);

  await UserModel.create({
    name: 'Responsable RH',
    email,
    password: hashedPassword,
    role: 'rh',
    emailVerified: true,
    status: 'active',
  });

  console.log('[seed] HR user created: hr@ava.com / hr@ava2026');
}

main()
  .catch((err) => {
    console.error('[seed] Error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
      console.log('[seed] Disconnected');
    } catch {
      // ignore
    }
  });

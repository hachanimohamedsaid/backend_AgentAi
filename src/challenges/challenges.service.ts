import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Challenge, ChallengeDocument } from './schemas/challenge.schema';

const DEFAULT_CHALLENGES: Array<
  Omit<
    Challenge,
    'createdAt' | 'updatedAt'
  >
> = [
  {
    id: 'ch_voice_email',
    title: 'Voice Email Master',
    description: 'Send an email using voice commands',
    longDescription:
      'Use the voice assistant to compose and send an email end-to-end without manual typing.',
    icon: 'mic',
    points: 100,
    type: 'voice_email',
    color: '#6366F1',
    steps: [
      'Open voice assistant',
      'Compose an email by voice',
      'Confirm and send the message',
    ],
    requiresVoice: true,
    requiresPayment: false,
    isActive: true,
    order: 1,
  },
  {
    id: 'ch_social_share',
    title: 'Social Campaign Starter',
    description: 'Create and publish a social post',
    longDescription:
      'Generate one campaign idea and publish a post from the social campaign module.',
    icon: 'share',
    points: 80,
    type: 'social_share',
    color: '#10B981',
    steps: [
      'Generate campaign draft',
      'Review final caption',
      'Publish the post',
    ],
    requiresVoice: false,
    requiresPayment: false,
    isActive: true,
    order: 2,
  },
  {
    id: 'ch_premium_checkout',
    title: 'Premium Unlock',
    description: 'Activate premium access',
    longDescription:
      'Complete a premium checkout to unlock premium features and challenge bonuses.',
    icon: 'credit-card',
    points: 150,
    type: 'premium_checkout',
    color: '#F59E0B',
    steps: ['Open billing page', 'Choose premium plan', 'Complete secure checkout'],
    requiresVoice: false,
    requiresPayment: true,
    isActive: true,
    order: 3,
  },
];

@Injectable()
export class ChallengesService {
  constructor(
    @InjectModel(Challenge.name)
    private readonly challengeModel: Model<ChallengeDocument>,
  ) {}

  async findActiveCatalog(): Promise<ChallengeDocument[]> {
    let catalog = await this.challengeModel
      .find({ isActive: true })
      .sort({ order: 1, createdAt: 1 })
      .lean()
      .exec();

    if (catalog.length === 0) {
      await this.challengeModel.insertMany(DEFAULT_CHALLENGES, { ordered: false });
      catalog = await this.challengeModel
        .find({ isActive: true })
        .sort({ order: 1, createdAt: 1 })
        .lean()
        .exec();
    }

    return catalog;
  }
}

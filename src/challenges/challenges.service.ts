import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Challenge, ChallengeDocument } from './schemas/challenge.schema';

type SeedChallenge = {
  id: string;
  title: string;
  description: string;
  longDescription: string;
  icon: string;
  points: number;
  type: string;
  color: string;
  steps: string[];
  requiresVoice: boolean;
  requiresPayment: boolean;
  isActive: boolean;
  order: number;
};

const DEFAULT_CHALLENGES: SeedChallenge[] = [
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
    steps: [
      'Open billing page',
      'Choose premium plan',
      'Complete secure checkout',
    ],
    requiresVoice: false,
    requiresPayment: true,
    isActive: true,
    order: 3,
  },
  {
    id: 'ch_profile_complete',
    title: 'Profile Pro',
    description: 'Complete your profile details',
    longDescription:
      'Add role, location, phone, and bio to complete your profile setup.',
    icon: 'user',
    points: 60,
    type: 'profile_setup',
    color: '#06B6D4',
    steps: ['Open profile page', 'Fill all missing fields', 'Save profile'],
    requiresVoice: false,
    requiresPayment: false,
    isActive: true,
    order: 4,
  },
  {
    id: 'ch_goal_create_1',
    title: 'Goal Setter',
    description: 'Create your first goal',
    longDescription:
      'Define one realistic goal in the goals module and save it.',
    icon: 'target',
    points: 50,
    type: 'goal_create',
    color: '#14B8A6',
    steps: ['Open goals', 'Create a new goal', 'Save and review'],
    requiresVoice: false,
    requiresPayment: false,
    isActive: true,
    order: 5,
  },
  {
    id: 'ch_goal_action_3',
    title: 'Action Tracker',
    description: 'Complete 3 goal actions',
    longDescription: 'Mark three planned goal actions as completed.',
    icon: 'check-square',
    points: 90,
    type: 'goal_actions',
    color: '#22C55E',
    steps: ['Open a goal', 'Complete three actions', 'Verify progress'],
    requiresVoice: false,
    requiresPayment: false,
    isActive: true,
    order: 6,
  },
  {
    id: 'ch_meeting_create',
    title: 'Meeting Organizer',
    description: 'Create your first smart meeting',
    longDescription:
      'Use the meeting module to create and save a meeting context.',
    icon: 'calendar',
    points: 70,
    type: 'meeting_create',
    color: '#8B5CF6',
    steps: ['Open meetings', 'Create meeting', 'Save details'],
    requiresVoice: false,
    requiresPayment: false,
    isActive: true,
    order: 7,
  },
  {
    id: 'ch_advisor_first_tip',
    title: 'Advisor Insight',
    description: 'Request your first advisor suggestion',
    longDescription:
      'Ask the advisor module for one actionable business suggestion.',
    icon: 'lightbulb',
    points: 55,
    type: 'advisor_tip',
    color: '#F97316',
    steps: ['Open advisor', 'Submit your context', 'Read the suggestion'],
    requiresVoice: false,
    requiresPayment: false,
    isActive: true,
    order: 8,
  },
  {
    id: 'ch_ai_prompt_1',
    title: 'AI Explorer',
    description: 'Send your first AI prompt',
    longDescription:
      'Use the AI module to generate content from one custom prompt.',
    icon: 'cpu',
    points: 65,
    type: 'ai_prompt',
    color: '#0EA5E9',
    steps: ['Open AI module', 'Write prompt', 'Generate response'],
    requiresVoice: false,
    requiresPayment: false,
    isActive: true,
    order: 9,
  },
  {
    id: 'ch_mobility_quote_1',
    title: 'Mobility Scout',
    description: 'Generate one mobility quote',
    longDescription: 'Run a mobility quote and compare options.',
    icon: 'car',
    points: 75,
    type: 'mobility_quote',
    color: '#3B82F6',
    steps: ['Open mobility', 'Create quote request', 'Review best offer'],
    requiresVoice: false,
    requiresPayment: false,
    isActive: true,
    order: 10,
  },
  {
    id: 'ch_ml_prediction_1',
    title: 'Prediction Starter',
    description: 'Run one ML prediction',
    longDescription:
      'Generate one prediction from the ML service and inspect output.',
    icon: 'activity',
    points: 85,
    type: 'ml_prediction',
    color: '#A855F7',
    steps: ['Open ML features', 'Submit data', 'Check prediction result'],
    requiresVoice: false,
    requiresPayment: false,
    isActive: true,
    order: 11,
  },
  {
    id: 'ch_market_intel_1',
    title: 'Market Analyst',
    description: 'Run a market intelligence analysis',
    longDescription: 'Submit one market context and review generated analysis.',
    icon: 'bar-chart-2',
    points: 95,
    type: 'market_analysis',
    color: '#EF4444',
    steps: ['Open market intelligence', 'Submit context', 'Review report'],
    requiresVoice: false,
    requiresPayment: false,
    isActive: true,
    order: 12,
  },
  {
    id: 'ch_realtime_session_1',
    title: 'Realtime Connector',
    description: 'Start one realtime session',
    longDescription:
      'Open a realtime session and exchange at least one message.',
    icon: 'radio',
    points: 70,
    type: 'realtime_session',
    color: '#64748B',
    steps: ['Open realtime', 'Start session', 'Send one message'],
    requiresVoice: false,
    requiresPayment: false,
    isActive: true,
    order: 13,
  },
  {
    id: 'ch_billing_checkout_1',
    title: 'Billing Ready',
    description: 'Open checkout and reach payment step',
    longDescription: 'Start checkout flow and reach confirmation screen.',
    icon: 'wallet',
    points: 100,
    type: 'billing_checkout',
    color: '#D97706',
    steps: ['Open billing', 'Select plan', 'Reach payment confirmation'],
    requiresVoice: false,
    requiresPayment: true,
    isActive: true,
    order: 14,
  },
  {
    id: 'ch_social_campaign_2',
    title: 'Campaign Builder',
    description: 'Create 2 social campaign drafts',
    longDescription:
      'Generate and save two campaign drafts for different channels.',
    icon: 'megaphone',
    points: 120,
    type: 'social_campaign',
    color: '#EC4899',
    steps: ['Create first draft', 'Create second draft', 'Save both drafts'],
    requiresVoice: false,
    requiresPayment: false,
    isActive: true,
    order: 15,
  },
  {
    id: 'ch_assistant_plan_1',
    title: 'Assistant Planner',
    description: 'Create one plan with assistant',
    longDescription: 'Ask assistant to generate a multi-step action plan.',
    icon: 'clipboard',
    points: 75,
    type: 'assistant_plan',
    color: '#0D9488',
    steps: ['Open assistant', 'Describe objective', 'Save generated plan'],
    requiresVoice: false,
    requiresPayment: false,
    isActive: true,
    order: 16,
  },
  {
    id: 'ch_project_decision_1',
    title: 'Decision Maker',
    description: 'Record one project decision',
    longDescription: 'Add and finalize one project decision with rationale.',
    icon: 'git-branch',
    points: 70,
    type: 'project_decision',
    color: '#0891B2',
    steps: ['Open project decisions', 'Create decision', 'Save rationale'],
    requiresVoice: false,
    requiresPayment: false,
    isActive: true,
    order: 17,
  },
  {
    id: 'ch_project_analysis_1',
    title: 'Analysis Runner',
    description: 'Launch one project analysis',
    longDescription: 'Run analysis and inspect generated recommendations.',
    icon: 'search',
    points: 80,
    type: 'project_analysis',
    color: '#7C3AED',
    steps: ['Open analyses', 'Launch analysis', 'Read key outputs'],
    requiresVoice: false,
    requiresPayment: false,
    isActive: true,
    order: 18,
  },
  {
    id: 'ch_goal_streak_7',
    title: '7-Day Streak',
    description: 'Maintain 7 days of activity',
    longDescription:
      'Keep daily activity in the app for seven consecutive days.',
    icon: 'flame',
    points: 140,
    type: 'streak_7_days',
    color: '#F43F5E',
    steps: ['Log activity daily', 'Avoid missing a day', 'Reach day 7'],
    requiresVoice: false,
    requiresPayment: false,
    isActive: true,
    order: 19,
  },
  {
    id: 'ch_referral_invite_1',
    title: 'Community Invite',
    description: 'Invite one collaborator',
    longDescription:
      'Share the app with one collaborator and confirm invitation sent.',
    icon: 'user-plus',
    points: 60,
    type: 'referral_invite',
    color: '#4F46E5',
    steps: ['Open invite flow', 'Send one invitation', 'Confirm sent status'],
    requiresVoice: false,
    requiresPayment: false,
    isActive: true,
    order: 20,
  },
];

const MIN_ACTIVE_CHALLENGES = 20;
@Injectable()
export class ChallengesService {
  private readonly logger = new Logger(ChallengesService.name);

  constructor(
    @InjectModel(Challenge.name)
    private readonly challengeModel: Model<ChallengeDocument>,
  ) {}

  private async ensureCatalogSeeded(): Promise<void> {
    const activeCount = await this.challengeModel
      .countDocuments({ isActive: true })
      .exec();

    if (activeCount >= MIN_ACTIVE_CHALLENGES) {
      return;
    }

    this.logger.warn(
      `Challenge catalog too small: ${activeCount}. Minimum expected: ${MIN_ACTIVE_CHALLENGES}. Seeding defaults.`,
    );

    await this.challengeModel.bulkWrite(
      DEFAULT_CHALLENGES.map((challenge) => ({
        updateOne: {
          filter: { id: challenge.id },
          update: { $setOnInsert: challenge },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  async findActiveCatalog(): Promise<ChallengeDocument[]> {
    await this.ensureCatalogSeeded();

    return this.challengeModel
      .find({ isActive: true })
      .sort({ order: 1 })
      .limit(50)
      .lean()
      .exec();
  }
}

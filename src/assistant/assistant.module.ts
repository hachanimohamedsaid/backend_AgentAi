import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import {
  Context,
  ContextSchema,
} from './schemas/context.schema';
import {
  Suggestion,
  SuggestionSchema,
} from './schemas/suggestion.schema';
import {
  Habit,
  HabitSchema,
} from './schemas/habit.schema';
import {
  InteractionLog,
  InteractionLogSchema,
} from './schemas/interaction-log.schema';
import {
  TrainingSample,
  TrainingSampleSchema,
} from './schemas/training-sample.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { MlService } from './ml.service';

@Module({
  imports: [
    HttpModule.register({ timeout: 15000, maxRedirects: 5 }),
    MongooseModule.forFeature([
      { name: Context.name, schema: ContextSchema },
      { name: Suggestion.name, schema: SuggestionSchema },
      { name: Habit.name, schema: HabitSchema },
      { name: InteractionLog.name, schema: InteractionLogSchema },
      { name: TrainingSample.name, schema: TrainingSampleSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AssistantController],
  providers: [AssistantService, MlService],
})
export class AssistantModule {}

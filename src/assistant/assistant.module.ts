import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Context.name, schema: ContextSchema },
      { name: Suggestion.name, schema: SuggestionSchema },
      { name: Habit.name, schema: HabitSchema },
    ]),
  ],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}


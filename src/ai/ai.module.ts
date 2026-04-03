import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { DispatchEmailLlmService } from './dispatch-email-llm.service';
import { TaskAssignmentLlmService } from './task-assignment-llm.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiService, DispatchEmailLlmService, TaskAssignmentLlmService],
  exports: [AiService, DispatchEmailLlmService, TaskAssignmentLlmService],
})
export class AiModule {}

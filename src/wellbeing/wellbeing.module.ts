import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  WellbeingDiagnostic,
  WellbeingDiagnosticSchema,
} from './schemas/wellbeing-diagnostic.schema';
import {
  WellbeingUser,
  WellbeingUserSchema,
} from './schemas/wellbeing-user.schema';
import { WellbeingAiService } from './wellbeing-ai.service';
import { WellbeingController } from './wellbeing.controller';
import { WellbeingService } from './wellbeing.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WellbeingUser.name, schema: WellbeingUserSchema },
      { name: WellbeingDiagnostic.name, schema: WellbeingDiagnosticSchema },
    ]),
  ],
  controllers: [WellbeingController],
  providers: [WellbeingService, WellbeingAiService],
  exports: [WellbeingService],
})
export class WellbeingModule {}

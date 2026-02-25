import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MlController } from './ml.controller';
import { MlService } from './ml.service';
import {
  SpendingPrediction,
  SpendingPredictionSchema,
} from './schemas/spending-prediction.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SpendingPrediction.name, schema: SpendingPredictionSchema },
    ]),
  ],
  controllers: [MlController],
  providers: [MlService],
})
export class MlModule {}

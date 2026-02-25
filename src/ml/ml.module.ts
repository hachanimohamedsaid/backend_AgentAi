import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MlController } from './ml.controller';
import { MlService } from './ml.service';

@Module({
  imports: [ConfigModule],
  controllers: [MlController],
  providers: [MlService],
})
export class MlModule {}

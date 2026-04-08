import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../pm/mail/mail.module';
import { RhController } from './rh.controller';
import { RhService } from './rh.service';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    AuthModule,
    MailModule,
  ],
  controllers: [RhController],
  providers: [RhService],
})
export class RhModule {}

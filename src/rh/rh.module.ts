import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../pm/mail/mail.module';
import { RhController } from './rh.controller';
import { RhRoleGuard } from './rh-role.guard';
import { RhService } from './rh.service';
import { Conge, CongeSchema } from './schemas/conge.schema';
import { Reclamation, ReclamationSchema } from './schemas/reclamation.schema';
import { Maladie, MaladieSchema } from './schemas/maladie.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Conge.name, schema: CongeSchema },
      { name: Reclamation.name, schema: ReclamationSchema },
      { name: Maladie.name, schema: MaladieSchema },
    ]),
    AuthModule,
    MailModule,
  ],
  controllers: [RhController],
  providers: [RhService, RhRoleGuard],
})
export class RhModule {}

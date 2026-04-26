import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { MessagingController } from './messaging.controller';
import { MessagingGateway } from './messaging.gateway';
import { MessagingService } from './messaging.service';
import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { Message, MessageSchema } from './schemas/message.schema';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    UsersModule,
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
  ],
  providers: [MessagingService, MessagingGateway],
  controllers: [MessagingController],
  exports: [MessagingGateway, MessagingService],
})
export class MessagingModule {}


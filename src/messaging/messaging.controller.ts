import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessagingService } from './messaging.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { Request } from '@nestjs/common';

@Controller('messaging')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Get('conversations')
  async getConversations(@Request() req) {
    return this.messagingService.getConversations(req.user.id);
  }

  @Post('conversations/direct')
  async getOrCreateDirect(@Request() req, @Body() body: { participantId: string }) {
    return this.messagingService.getOrCreateDirect(req.user.id, body.participantId);
  }

  @Post('conversations/group')
  async createGroup(@Request() req, @Body() body: { name: string; participantIds: string[] }) {
    const dto: CreateConversationDto = {
      type: 'group',
      participantIds: body.participantIds,
      name: body.name,
    };
    return this.messagingService.createGroup(req.user.id, dto);
  }

  @Get('conversations/:id/messages')
  async getMessages(
    @Request() req,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const l = limit ? Number(limit) : 30;
    return this.messagingService.getMessages(id, req.user.id, cursor, Number.isFinite(l) ? l : 30);
  }

  @Patch('conversations/:id/read')
  async markRead(@Request() req, @Param('id') id: string) {
    await this.messagingService.markRead(id, req.user.id);
    return { success: true };
  }

  @Get('unread-count')
  async getTotalUnread(@Request() req) {
    const totalUnread = await this.messagingService.getTotalUnread(req.user.id);
    return { totalUnread };
  }

  @Get('users/search')
  async searchUsers(@Request() req, @Query('q') q: string) {
    return this.messagingService.searchUsers(q, req.user.id);
  }

  @Post('messages')
  async sendMessage(@Request() req, @Body() body: SendMessageDto) {
    const res = await this.messagingService.sendMessage(req.user.id, body);
    return res.message;
  }
}


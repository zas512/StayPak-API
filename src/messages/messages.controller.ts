import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { CreateMessageDto, MessageQueryDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  async create(@Req() req: Request & { user: { sub: string } }, @Body() dto: CreateMessageDto) {
    return this.messagesService.create(req.user.sub, dto);
  }

  @Get()
  async findAll(@Req() req: Request & { user: { sub: string } }, @Query() query: MessageQueryDto) {
    return this.messagesService.findAll(query, req.user.sub);
  }

  @Get('conversations')
  async getConversations(@Req() req: Request & { user: { sub: string } }) {
    return this.messagesService.getConversations(req.user.sub);
  }

  @Get('unread-count')
  async getUnreadCount(@Req() req: Request & { user: { sub: string } }) {
    return this.messagesService.getUnreadCount(req.user.sub);
  }

  @Patch(':id/read')
  async markAsRead(@Req() req: Request & { user: { sub: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.messagesService.markAsRead(id, req.user.sub);
  }
}
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto, MessageQueryDto } from './dto';
import { Prisma } from '@prisma/generated/prisma';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(senderId: string, dto: CreateMessageDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: { listing: { select: { hostId: true } } },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Verify sender is part of this booking
    const isGuest = booking.guestId === senderId;
    const isHost = booking.listing.hostId === senderId;

    if (!isGuest && !isHost) {
      throw new BadRequestException('Not authorized to send messages for this booking');
    }

    const message = await this.prisma.message.create({
      data: {
        bookingId: dto.bookingId,
        senderId,
        body: dto.body,
      },
      include: {
        sender: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    this.logger.log(`Message sent: ${message.id} in booking: ${dto.bookingId}`);
    return message;
  }

  async findAll(query: MessageQueryDto, userId: string) {
    const { page = 1, limit = 50, bookingId } = query;
    const skip = (page - 1) * limit;

    // Verify user has access to this booking
    if (bookingId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: { listing: { select: { hostId: true } } },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      const isGuest = booking.guestId === userId;
      const isHost = booking.listing.hostId === userId;

      if (!isGuest && !isHost) {
        throw new BadRequestException('Not authorized to view messages for this booking');
      }
    }

    const where: Prisma.MessageWhereInput = {};

    if (bookingId) {
      where.bookingId = bookingId;
    } else {
      // Get all messages for bookings user is part of
      const userBookings = await this.prisma.booking.findMany({
        where: {
          OR: [
            { guestId: userId },
            { listing: { hostId: userId } },
          ],
        },
        select: { id: true },
      });

      where.bookingId = { in: userBookings.map((b) => b.id) };
    }

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        skip,
        take: limit,
        orderBy: { sentAt: 'desc' },
        include: {
          sender: { select: { id: true, fullName: true, avatarUrl: true } },
          booking: {
            select: {
              id: true,
              listing: { select: { id: true, title: true, photos: { where: { isCover: true }, take: 1 } } },
            },
          },
        },
      }),
      this.prisma.message.count({ where }),
    ]);

    return {
      data: messages.reverse(), // Return in chronological order
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async markAsRead(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { booking: { include: { listing: { select: { hostId: true } } } } },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const isGuest = message.booking.guestId === userId;
    const isHost = message.booking.listing.hostId === userId;

    if (!isGuest && !isHost) {
      throw new BadRequestException('Not authorized');
    }

    if (message.senderId === userId) {
      throw new BadRequestException('Cannot mark your own message as read');
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: { isRead: true },
    });
  }

  async getUnreadCount(userId: string) {
    const userBookings = await this.prisma.booking.findMany({
      where: {
        OR: [
          { guestId: userId },
          { listing: { hostId: userId } },
        ],
      },
      select: { id: true },
    });

    const count = await this.prisma.message.count({
      where: {
        bookingId: { in: userBookings.map((b) => b.id) },
        senderId: { not: userId },
        isRead: false,
      },
    });

    return { unreadCount: count };
  }

  async getConversations(userId: string) {
    const userBookings = await this.prisma.booking.findMany({
      where: {
        OR: [
          { guestId: userId },
          { listing: { hostId: userId } },
        ],
      },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            photos: { where: { isCover: true }, take: 1 },
            host: { select: { id: true, fullName: true, avatarUrl: true } },
          },
        },
        guest: { select: { id: true, fullName: true, avatarUrl: true } },
        messages: {
          orderBy: { sentAt: 'desc' },
          take: 1,
          include: { sender: { select: { id: true, fullName: true, avatarUrl: true } } },
        },
      },
    });

    return userBookings.map((booking) => ({
      bookingId: booking.id,
      listing: booking.listing,
      otherUser: booking.listing.host.id === userId ? booking.guest : booking.listing.host,
      lastMessage: booking.messages[0] ?? null,
      unreadCount: booking.messages.filter(
        (m) => m.senderId !== userId && !m.isRead,
      ).length,
    }));
  }
}
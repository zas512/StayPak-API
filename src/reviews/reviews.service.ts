import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto, ReviewQueryDto } from './dto';
import { ReviewTarget, BookingStatus, Prisma } from '@prisma/client';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(reviewerId: string, dto: CreateReviewDto) {
    // Verify booking exists and is completed
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== BookingStatus.completed) {
      throw new BadRequestException('Can only review completed bookings');
    }

    // Verify reviewer is part of this booking
    const isGuest = booking.guestId === reviewerId;
    const isHost = await this.prisma.listing.findFirst({
      where: { id: booking.listingId, hostId: reviewerId },
    });

    if (!isGuest && !isHost) {
      throw new BadRequestException('Not authorized to review this booking');
    }

    // Check if review already exists
    const existing = await this.prisma.review.findUnique({
      where: {
        bookingId_reviewerId_target: {
          bookingId: dto.bookingId,
          reviewerId,
          target: dto.target,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Review already exists for this booking and target');
    }

    // Determine reviewee
    let revieweeId: string;
    if (dto.target === ReviewTarget.listing || dto.target === ReviewTarget.host) {
      const listing = await this.prisma.listing.findUnique({
        where: { id: booking.listingId },
        select: { hostId: true },
      });
      revieweeId = listing!.hostId;
    } else {
      revieweeId = booking.guestId;
    }

    if (revieweeId === reviewerId) {
      throw new BadRequestException('Cannot review yourself');
    }

    const review = await this.prisma.review.create({
      data: {
        bookingId: dto.bookingId,
        reviewerId,
        revieweeId,
        target: dto.target,
        rating: dto.rating,
        comment: dto.comment,
      },
      include: {
        reviewer: { select: { id: true, fullName: true, avatarUrl: true } },
        reviewee: { select: { id: true, fullName: true, avatarUrl: true } },
        booking: { select: { id: true, listing: { select: { title: true } } } },
      },
    });

    // Update average rating for reviewee if target is host
    if (dto.target === ReviewTarget.host) {
      await this.updateHostRating(revieweeId);
    }

    this.logger.log(`Review created: ${review.id} by ${reviewerId} for ${dto.target}`);
    return review;
  }

  async findAll(query: ReviewQueryDto) {
    const { page = 1, limit = 20, target, revieweeId, bookingId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ReviewWhereInput = {};

    if (target) where.target = target;
    if (revieweeId) where.revieweeId = revieweeId;
    if (bookingId) where.bookingId = bookingId;

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          reviewer: { select: { id: true, fullName: true, avatarUrl: true } },
          reviewee: { select: { id: true, fullName: true, avatarUrl: true } },
          booking: { select: { id: true, listing: { select: { title: true } } } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      data: reviews,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByBooking(bookingId: string) {
    return this.prisma.review.findMany({
      where: { bookingId },
      include: {
        reviewer: { select: { id: true, fullName: true, avatarUrl: true } },
        reviewee: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getHostRating(hostId: string) {
    const result = await this.prisma.review.aggregate({
      where: { revieweeId: hostId, target: ReviewTarget.host },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return {
      averageRating: result._avg.rating ?? 0,
      totalReviews: result._count.rating ?? 0,
    };
  }

  async getListingRating(listingId: string) {
    const reviews = await this.prisma.review.findMany({
      where: {
        booking: { listingId },
        target: ReviewTarget.listing,
      },
      select: { rating: true },
    });

    const total = reviews.length;
    const average = total > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0;

    // Rating breakdown
    const breakdown = [1, 2, 3, 4, 5].map((star) => ({
      star,
      count: reviews.filter((r) => r.rating === star).length,
    }));

    return { averageRating: average, totalReviews: total, breakdown };
  }

  private async updateHostRating(hostId: string) {
    const { averageRating, totalReviews } = await this.getHostRating(hostId);
    await this.prisma.user.update({
      where: { id: hostId },
      data: { /* Could add rating fields to User model */ },
    });
  }
}
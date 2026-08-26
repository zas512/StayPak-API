import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBookingDto,
  UpdateBookingDto,
  BookingQueryDto,
} from './dto';
import {
  BookingStatus,
  BookingPaymentStatus,
  PaymentGateway,
  PaymentRecordStatus,
  Prisma,
} from '@prisma/client';
import { Prisma as PrismaNamespace } from '@prisma/client';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private calculatePricing(
    pricePerNight: Decimal,
    nights: number,
    guestsCount: number,
  ): { baseAmount: Decimal; serviceFee: Decimal; totalAmount: Decimal } {
    const baseAmount = new Decimal(pricePerNight).times(nights);
    // Service fee: 10% of base amount, minimum PKR 500, maximum PKR 5000
    const serviceFeePercent = new Decimal(0.10);
    const minServiceFee = new Decimal(500);
    const maxServiceFee = new Decimal(5000);
    let serviceFee = baseAmount.times(serviceFeePercent);
    if (serviceFee.lessThan(minServiceFee)) serviceFee = minServiceFee;
    if (serviceFee.greaterThan(maxServiceFee)) serviceFee = maxServiceFee;
    const totalAmount = baseAmount.plus(serviceFee);
    return { baseAmount, serviceFee, totalAmount };
  }

  async create(guestId: string, dto: CreateBookingDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
      include: {
        availability: {
          where: {
            date: {
              gte: new Date(dto.checkIn),
              lt: new Date(dto.checkOut),
            },
          },
        },
      },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.status !== 'active') {
      throw new BadRequestException('Listing is not available for booking');
    }

    if (listing.hostId === guestId) {
      throw new BadRequestException('You cannot book your own listing');
    }

    if (dto.guestsCount > listing.maxGuests) {
      throw new BadRequestException(`Maximum ${listing.maxGuests} guests allowed`);
    }

    // Check availability
    const checkInDate = new Date(dto.checkIn);
    const checkOutDate = new Date(dto.checkOut);
    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));

    if (nights < 1) {
      throw new BadRequestException('Check-out must be after check-in');
    }

    // Check for blocked dates
    const blockedDates = listing.availability.filter(
      (a) => a.isBlocked && a.date >= checkInDate && a.date < checkOutDate,
    );

    if (blockedDates.length > 0) {
      throw new BadRequestException('Selected dates are not available');
    }

    // Check for existing bookings
    const existingBookings = await this.prisma.booking.findMany({
      where: {
        listingId: dto.listingId,
        status: { in: ['pending', 'confirmed'] },
        OR: [
          {
            checkIn: { lte: checkOutDate },
            checkOut: { gte: checkInDate },
          },
        ],
      },
    });

    if (existingBookings.length > 0) {
      throw new ConflictException('Listing is already booked for these dates');
    }

    const pricing = this.calculatePricing(listing.pricePerNight, nights, dto.guestsCount);

    const booking = await this.prisma.booking.create({
      data: {
        listingId: dto.listingId,
        guestId,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        guestsCount: dto.guestsCount,
        nights,
        baseAmount: pricing.baseAmount,
        serviceFee: pricing.serviceFee,
        totalAmount: pricing.totalAmount,
        status: listing.instantBook ? BookingStatus.confirmed : BookingStatus.pending,
        paymentStatus: BookingPaymentStatus.unpaid,
      },
      include: {
        listing: {
          include: {
            host: { select: { id: true, fullName: true, email: true, phone: true } },
            photos: { where: { isCover: true }, take: 1 },
          },
        },
        guest: { select: { id: true, fullName: true, email: true, phone: true } },
      },
    });

    this.logger.log(`Booking created: ${booking.id} for listing: ${dto.listingId}`);
    return booking;
  }

  async findAll(query: BookingQueryDto, userId: string, userRole: string) {
    const { page = 1, limit = 20, status, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.BookingWhereInput = {};

    if (userRole === 'guest') {
      where.guestId = userId;
    } else if (userRole === 'host') {
      where.listing = { hostId: userId };
    }

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.checkIn = {};
      if (startDate) where.checkIn.gte = new Date(startDate);
      if (endDate) where.checkIn.lte = new Date(endDate);
    }

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          listing: {
            include: {
              photos: { where: { isCover: true }, take: 1 },
              host: { select: { id: true, fullName: true, avatarUrl: true } },
            },
          },
          guest: { select: { id: true, fullName: true, avatarUrl: true } },
          payments: true,
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data: bookings,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string, userId: string, userRole: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        listing: {
          include: {
            photos: { orderBy: { sortOrder: 'asc' } },
            host: { select: { id: true, fullName: true, avatarUrl: true, phone: true, email: true } },
          },
        },
        guest: { select: { id: true, fullName: true, avatarUrl: true, phone: true, email: true } },
        payments: { orderBy: { createdAt: 'desc' } },
        messages: { orderBy: { sentAt: 'asc' } },
        reviews: true,
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${id} not found`);
    }

    // Check authorization
    if (userRole === 'guest' && booking.guestId !== userId) {
      throw new BadRequestException('Not authorized to view this booking');
    }
    if (userRole === 'host' && booking.listing.hostId !== userId) {
      throw new BadRequestException('Not authorized to view this booking');
    }

    return booking;
  }

  async update(userId: string, userRole: string, id: string, dto: UpdateBookingDto) {
    const booking = await this.findById(id, userId, userRole);

    if (userRole === 'guest') {
      // Guests can only cancel
      if (dto.status && dto.status !== BookingStatus.cancelled) {
        throw new BadRequestException('Guests can only cancel bookings');
      }
      if (dto.status === BookingStatus.cancelled) {
        if (![BookingStatus.pending, BookingStatus.confirmed].includes(booking.status)) {
          throw new BadRequestException('Cannot cancel this booking');
        }
        if (!dto.cancelReason) {
          throw new BadRequestException('Cancel reason is required');
        }
      }
    } else if (userRole === 'host') {
      // Hosts can confirm or cancel
      if (dto.status === BookingStatus.confirmed) {
        if (booking.status !== BookingStatus.pending) {
          throw new BadRequestException('Only pending bookings can be confirmed');
        }
      }
      if (dto.status === BookingStatus.cancelled) {
        if (![BookingStatus.pending, BookingStatus.confirmed].includes(booking.status)) {
          throw new BadRequestException('Cannot cancel this booking');
        }
        if (!dto.cancelReason) {
          throw new BadRequestException('Cancel reason is required');
        }
      }
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        status: dto.status,
        cancelReason: dto.cancelReason,
      },
      include: {
        listing: { include: { host: { select: { id: true, fullName: true, email: true } } } },
        guest: { select: { id: true, fullName: true, email: true } },
      },
    });

    this.logger.log(`Booking updated: ${id} to status: ${dto.status}`);
    return updated;
  }

  async initiatePayment(bookingId: string, userId: string, gateway: PaymentGateway) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { listing: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.guestId !== userId) {
      throw new BadRequestException('Not authorized');
    }

    if (booking.paymentStatus === BookingPaymentStatus.paid) {
      throw new BadRequestException('Booking already paid');
    }

    if (booking.status === BookingStatus.cancelled) {
      throw new BadRequestException('Cannot pay for cancelled booking');
    }

    // Create payment record
    const payment = await this.prisma.payment.create({
      data: {
        bookingId,
        gateway,
        amount: booking.totalAmount,
        currency: 'PKR',
        status: PaymentRecordStatus.initiated,
      },
    });

    // Generate gateway-specific payment URL
    const paymentUrl = await this.generatePaymentUrl(gateway, payment, booking);

    return { paymentId: payment.id, paymentUrl, gateway };
  }

  private async generatePaymentUrl(
    gateway: PaymentGateway,
    payment: any,
    booking: any,
  ): Promise<string> {
    const baseUrl = process.env.FRONTEND_URL?.split(',')[0] ?? 'http://localhost:4200';
    const callbackUrl = `${baseUrl}/booking/${booking.id}/payment/callback`;

    switch (gateway) {
      case PaymentGateway.jazzcash:
        return this.generateJazzCashUrl(payment, callbackUrl);
      case PaymentGateway.easypaisa:
        return this.generateEasyPaisaUrl(payment, callbackUrl);
      case PaymentGateway.safepay:
        return this.generateSafePayUrl(payment, callbackUrl);
      default:
        throw new BadRequestException('Unsupported payment gateway');
    }
  }

  private generateJazzCashUrl(payment: any, callbackUrl: string): string {
    // JazzCash integration would go here
    // For now, return a mock URL
    return `https://sandbox.jazzcash.com.pk/Application/Transaction/Checkout?pp_Amount=${payment.amount}&pp_TxnRefNo=${payment.id}&pp_ReturnURL=${encodeURIComponent(callbackUrl)}`;
  }

  private generateEasyPaisaUrl(payment: any, callbackUrl: string): string {
    // EasyPaisa integration would go here
    return `https://easypaisa.com.pk/checkout?amount=${payment.amount}&reference=${payment.id}&callback=${encodeURIComponent(callbackUrl)}`;
  }

  private generateSafePayUrl(payment: any, callbackUrl: string): string {
    // SafePay integration would go here
    return `https://safepay.com/checkout?amount=${payment.amount}&ref=${payment.id}&return_url=${encodeURIComponent(callbackUrl)}`;
  }

  async handlePaymentCallback(
    gateway: PaymentGateway,
    gatewayRef: string,
    status: 'success' | 'failed',
    gatewayResponse: any,
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: { gatewayRef },
      include: { booking: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === PaymentRecordStatus.success) {
      return payment; // Already processed
    }

    const newStatus = status === 'success' ? PaymentRecordStatus.success : PaymentRecordStatus.failed;

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        gatewayResponse,
      },
    });

    if (status === 'success') {
      // Update booking payment status
      await this.prisma.booking.update({
        where: { id: payment.bookingId },
        data: { paymentStatus: BookingPaymentStatus.paid },
      });

      // If instant book was false, confirm the booking
      const booking = await this.prisma.booking.findUnique({
        where: { id: payment.bookingId },
        include: { listing: true },
      });

      if (booking && !booking.listing.instantBook && booking.status === BookingStatus.pending) {
        await this.prisma.booking.update({
          where: { id: payment.bookingId },
          data: { status: BookingStatus.confirmed },
        });
      }
    }

    this.logger.log(`Payment ${payment.id} status updated to ${newStatus}`);
    return updated;
  }
}
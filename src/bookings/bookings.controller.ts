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
import { BookingsService } from './bookings.service';
import {
  CreateBookingDto,
  UpdateBookingDto,
  BookingQueryDto,
  InitiatePaymentDto,
  PaymentCallbackDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  async create(@Req() req: Request & { user: { sub: string; role: string } }, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(req.user.sub, dto);
  }

  @Get()
  async findAll(@Req() req: Request & { user: { sub: string; role: string } }, @Query() query: BookingQueryDto) {
    return this.bookingsService.findAll(query, req.user.sub, req.user.role);
  }

  @Get(':id')
  async findById(
    @Req() req: Request & { user: { sub: string; role: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookingsService.findById(id, req.user.sub, req.user.role);
  }

  @Patch(':id')
  async update(
    @Req() req: Request & { user: { sub: string; role: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingDto,
  ) {
    return this.bookingsService.update(req.user.sub, req.user.role, id, dto);
  }

  @Post(':id/payment')
  async initiatePayment(
    @Req() req: Request & { user: { sub: string; role: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.bookingsService.initiatePayment(id, req.user.sub, dto.gateway);
  }

  @Post('payment/callback')
  async paymentCallback(@Body() dto: PaymentCallbackDto) {
    // This endpoint would be called by payment gateways
    // In production, verify webhook signatures
    return this.bookingsService.handlePaymentCallback(
      'jazzcash', // Would be determined from gateway
      dto.gatewayRef,
      dto.status,
      dto.gatewayResponse,
    );
  }
}
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  BookingStatus,
  BookingPaymentStatus,
  PaymentGateway,
} from '../../prisma/generated/prisma/client';

export class CreateBookingDto {
  @IsString()
  listingId!: string;

  @IsDateString()
  checkIn!: string;

  @IsDateString()
  checkOut!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  guestsCount!: number;
}

export class UpdateBookingDto {
  @IsEnum(BookingStatus)
  @IsOptional()
  status?: BookingStatus;

  @IsString()
  @IsOptional()
  cancelReason?: string;
}

export class BookingQueryDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @IsEnum(BookingStatus)
  @IsOptional()
  status?: BookingStatus;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class InitiatePaymentDto {
  @IsEnum(PaymentGateway)
  gateway!: PaymentGateway;
}

export class PaymentCallbackDto {
  @IsString()
  gatewayRef!: string;

  @IsEnum(['success', 'failed'])
  status!: 'success' | 'failed';

  @IsOptional()
  gatewayResponse?: any;
}
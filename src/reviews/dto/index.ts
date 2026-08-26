import { IsEnum, IsInt, IsOptional, IsString, Min, Max, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ReviewTarget } from '@prisma/generated/prisma';

export class CreateReviewDto {
  @IsUUID()
  bookingId!: string;

  @IsEnum(ReviewTarget)
  target!: ReviewTarget;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @IsOptional()
  comment?: string;
}

export class ReviewQueryDto {
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

  @IsEnum(ReviewTarget)
  @IsOptional()
  target?: ReviewTarget;

  @IsUUID()
  @IsOptional()
  revieweeId?: string;

  @IsUUID()
  @IsOptional()
  bookingId?: string;
}
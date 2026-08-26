import { IsString, IsOptional, IsUUID, Min, Max, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMessageDto {
  @IsUUID()
  bookingId!: string;

  @IsString()
  body!: string;
}

export class MessageQueryDto {
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
  limit?: number = 50;

  @IsUUID()
  @IsOptional()
  bookingId?: string;
}
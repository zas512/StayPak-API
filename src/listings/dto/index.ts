import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  IsLatitude,
  IsLongitude,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PropertyType, ListingStatus } from '@prisma/generated/prisma';

export class CreateListingDto {
  @IsString()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(PropertyType)
  propertyType!: PropertyType;

  @IsString()
  city!: string;

  @IsString()
  @IsOptional()
  area?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsLatitude()
  @IsOptional()
  lat?: number;

  @IsLongitude()
  @IsOptional()
  lng?: number;

  @IsInt()
  @Min(1)
  @Max(20)
  maxGuests!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  bedrooms!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  bathrooms!: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  amenities?: string[];

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(100)
  pricePerNight!: number;

  @IsBoolean()
  @IsOptional()
  instantBook?: boolean;
}

export class UpdateListingDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(PropertyType)
  @IsOptional()
  propertyType?: PropertyType;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  area?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsLatitude()
  @IsOptional()
  lat?: number;

  @IsLongitude()
  @IsOptional()
  lng?: number;

  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  maxGuests?: number;

  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  bedrooms?: number;

  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  bathrooms?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  amenities?: string[];

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(100)
  @IsOptional()
  pricePerNight?: number;

  @IsBoolean()
  @IsOptional()
  instantBook?: boolean;

  @IsEnum(ListingStatus)
  @IsOptional()
  status?: ListingStatus;
}

export class ListingQueryDto {
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

  @IsString()
  @IsOptional()
  city?: string;

  @IsEnum(PropertyType)
  @IsOptional()
  propertyType?: PropertyType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Type(() => Number)
  minPrice?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Type(() => Number)
  maxPrice?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  minGuests?: number;

  @IsString()
  @IsOptional()
  checkIn?: string;

  @IsString()
  @IsOptional()
  checkOut?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  amenities?: string[];

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  instantBook?: boolean;

  @IsString()
  @IsOptional()
  sortBy?: string = 'createdAt';

  @IsEnum(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsEnum(ListingStatus)
  @IsOptional()
  status?: ListingStatus;
}

export class AvailabilityDto {
  @IsString()
  date!: string; // ISO date string

  @IsBoolean()
  @IsOptional()
  isBlocked?: boolean;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  overridePrice?: number;
}

export class AddPhotoDto {
  @IsString()
  s3Key!: string;

  @IsString()
  cdnUrl!: string;

  @IsBoolean()
  @IsOptional()
  isCover?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}
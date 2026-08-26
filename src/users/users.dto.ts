import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { Role, CnicStatus } from '../../prisma/generated/prisma/client';
import { Type } from 'class-transformer';

export class CreateUserDto {
  @IsEmail()
  email!: string;
  @IsString()
  @Matches(/^(\+92|0)\d{10}$/, {
    message: 'phone must be a valid Pakistani number e.g. 03001234567',
  })
  phone!: string;
  @IsString()
  @MinLength(8)
  password!: string;
  @IsString()
  @IsNotEmpty()
  fullName!: string;
  @IsEnum(Role)
  role!: Role;
  @IsString()
  @IsOptional()
  avatarUrl?: string;
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  fullName?: string;
  @IsString()
  @IsOptional()
  @Matches(/^(\+92|0)\d{10}$/, {
    message: 'phone must be a valid Pakistani number e.g. 03001234567',
  })
  phone?: string;
  @IsEnum(Role)
  @IsOptional()
  role?: Role;
  @IsEnum(CnicStatus)
  @IsOptional()
  cnicStatus?: CnicStatus;
  @IsString()
  @IsOptional()
  avatarUrl?: string;
  @IsString()
  @IsOptional()
  cnicNumber?: string;
  @IsString()
  @IsOptional()
  cnicDocUrl?: string;
}

export class CnicUploadDto {
  @IsString()
  @Matches(/^\d{5}-\d{7}-\d{1}$/, {
    message: 'CNIC must be in format 12345-1234567-1',
  })
  cnicNumber!: string;
}

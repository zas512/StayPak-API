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
}

import { IsEmail, IsString, MinLength, Matches } from 'class-validator';

export class RegisterDto {
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
  fullName!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;
  @IsString()
  password!: string;
}

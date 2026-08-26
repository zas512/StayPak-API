import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { RegisterDto, LoginDto } from './auth.dto';
import { hash, compare } from 'bcrypt';
import { randomBytes } from 'crypto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const existingPhone = await this.usersService.findByPhone(dto.phone);
    if (existingPhone) {
      throw new ConflictException('Phone number already in use');
    }

    const passwordHash = await hash(dto.password, 12);
    const user = await this.usersService.create({
      ...dto,
      passwordHash,
      role: 'guest',
    });

    return this.generateTokenPair(user.id, user.email, user.role);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokenPair(user.id, user.email, user.role);
  }

  async refreshToken(refreshToken: string): Promise<TokenPair> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const user = await this.usersService.findOne(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User no longer exists');
      }

      return this.generateTokenPair(user.id, user.email, user.role);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async validateGoogleUser(googleUser: {
    email: string;
    fullName: string;
    avatarUrl: string;
    googleId: string;
  }): Promise<TokenPair> {
    let user = await this.usersService.findByEmail(googleUser.email);

    if (!user) {
      // Create new user from Google profile
      const randomPassword = randomBytes(32).toString('hex');
      const passwordHash = await hash(randomPassword, 12);

      user = await this.usersService.create({
        email: googleUser.email,
        phone: `+92${randomBytes(5).toString('hex')}`, // Temporary phone, user should update
        passwordHash,
        fullName: googleUser.fullName,
        role: 'guest',
        avatarUrl: googleUser.avatarUrl,
      });
    } else if (!user.avatarUrl && googleUser.avatarUrl) {
      // Update avatar if not set
      await this.usersService.update(user.id, { avatarUrl: googleUser.avatarUrl });
    }

    return this.generateTokenPair(user.id, user.email, user.role);
  }

  private generateTokenPair(userId: string, email: string, role: string): TokenPair {
    const payload: JwtPayload = { sub: userId, email, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    });

    const expiresIn = this.parseExpiresIn(process.env.JWT_EXPIRES_IN ?? '15m');

    return { accessToken, refreshToken, expiresIn };
  }

  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // default 15 minutes

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 900;
    }
  }
}
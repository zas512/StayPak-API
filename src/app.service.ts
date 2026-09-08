import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'StayPak API is running';
  }

  async getHealth() {
    const dbStatus = await this.prisma.testConnection();
    return {
      status: dbStatus.connected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      database: {
        provider: 'postgresql',
        ...dbStatus,
      },
    };
  }
}

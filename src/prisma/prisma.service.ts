import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../prisma/generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    try {
      const start = Date.now();
      await this.$connect();
      await this.$queryRaw`SELECT 1`;
      const latency = Date.now() - start;
      this.logger.log(`Database connected successfully (Ping: ${latency}ms)`);
    } catch (error: unknown) {
      this.logger.error('Database connection failed', error);
      throw error;
    }
  }

  async testConnection(): Promise<{
    connected: boolean;
    latencyMs: number;
    timestamp: string;
    error?: string;
  }> {
    const start = Date.now();
    try {
      await this.$queryRaw`SELECT 1`;
      return {
        connected: true,
        latencyMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        connected: false,
        latencyMs: Date.now() - start,
        timestamp: new Date().toISOString(),
        error:
          error instanceof Error
            ? error.message
            : 'Unknown database connection error',
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }
}

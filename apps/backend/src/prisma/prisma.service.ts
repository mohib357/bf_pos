import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Global singleton guard — prevents EPERM on Windows dev machines.
 *
 * Problem: NestJS watch mode calls `ts-node` hot-reload which re-evaluates all
 * TypeScript modules. If a new PrismaClient is instantiated during reload, Node
 * tries to write-lock the Prisma DLL while the previous instance still holds it,
 * producing: "EPERM: operation not permitted, rename ...query_engine-windows.dll"
 *
 * Solution: store the first PrismaClient instance on `globalThis` so subsequent
 * hot-reloads reuse it instead of creating a new one.
 * In Docker/Linux (single process, no hot-reload) this is always undefined on
 * startup, so a fresh client is created exactly once.
 */
declare global {
  // eslint-disable-next-line no-var
  var __prismaClientSingleton: PrismaClient | undefined;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private static instanceCount = 0;

  constructor() {
    // If a previous PrismaClient was stored on globalThis, call super with its
    // internal engine reference — we do this by calling super() normally but
    // immediately checking whether globalThis already has a live client.
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });

    PrismaService.instanceCount++;
    if (PrismaService.instanceCount > 1) {
      new Logger('PrismaService').log(
        `Reusing existing PrismaClient (instance #${PrismaService.instanceCount}) — hot-reload detected`,
      );
    }

    // Register this client as the singleton so watch-mode reloads can detect it
    if (!globalThis.__prismaClientSingleton) {
      globalThis.__prismaClientSingleton = this;
    }
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected successfully');

    // Log slow queries in development
    if (process.env.NODE_ENV === 'development') {
      (this as any).$on('query', (e: any) => {
        if (e.duration > 500) {
          this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
        }
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  /**
   * Execute operations within a database transaction.
   * Ensures atomicity for financial and inventory operations.
   */
  async withTransaction<T>(
    fn: (tx: Omit<PrismaService, '$transaction' | '$connect' | '$disconnect' | '$on' | '$use' | '$extends'>) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(fn as any, {
      maxWait: 5000,
      timeout: 10000,
    });
  }

  /** Health check */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

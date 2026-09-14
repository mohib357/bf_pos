import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.module';
import { Public } from '../../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  @Public()
  @Get()
  async check() {
    const [dbOk, cacheOk] = await Promise.all([
      this.prisma.isHealthy(),
      this.cache.isHealthy(),
    ]);

    const status = dbOk ? 'ok' : 'degraded';
    return {
      status,
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? 'up' : 'down',
        cache: cacheOk
          ? this.cache.isRedisConnected
            ? 'redis'
            : 'memory-fallback'
          : 'down',
      },
    };
  }
}



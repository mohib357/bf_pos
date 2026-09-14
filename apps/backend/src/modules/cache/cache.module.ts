/**
 * Redis Cache Module
 *
 * Provides a CacheService backed by Redis (ioredis).
 * Falls back gracefully to a no-op in-memory store if Redis is unreachable
 * (so development without Redis still works).
 *
 * Usage:
 *   @Injectable() class MyService {
 *     constructor(private cache: CacheService) {}
 *     async getProduct(id: string) {
 *       return this.cache.getOrSet(`product:${id}`, () => this.prisma.product.findUnique(...), 300);
 *     }
 *   }
 */
import { Global, Module, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ─── Cache Service ────────────────────────────────────────────────────────────
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: any = null;          // ioredis instance or null
  private memoryStore = new Map<string, { value: string; expiresAt: number }>();
  private connected = false;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const host = this.config.get<string>('redis.host') || 'localhost';
    const port = this.config.get<number>('redis.port') || 6379;
    const password = this.config.get<string>('redis.password') || undefined;

    try {
      // Dynamic import — ioredis is optional dependency
      const { default: Redis } = await import('ioredis').catch(() => ({ default: null }));
      if (!Redis) {
        this.logger.warn('ioredis not installed — using in-memory fallback cache');
        return;
      }

      this.client = new Redis({
        host,
        port,
        password,
        lazyConnect: true,
        connectTimeout: 3000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });

      this.client.on('error', (err: Error) => {
        if (this.connected) {
          this.logger.warn(`Redis connection error: ${err.message} — falling back to memory`);
        }
        this.connected = false;
      });

      this.client.on('connect', () => {
        this.connected = true;
        this.logger.log(`Redis connected at ${host}:${port}`);
      });

      await this.client.connect().catch(() => {
        this.logger.warn(`Redis unavailable at ${host}:${port} — using in-memory fallback`);
      });

    } catch (err: any) {
      this.logger.warn(`Cache init failed: ${err.message} — using in-memory fallback`);
    }
  }

  async onModuleDestroy() {
    if (this.client && this.connected) {
      await this.client.quit().catch(() => {});
      this.logger.log('Redis disconnected');
    }
  }

  // ── Core Methods ─────────────────────────────────────────────────────────

  async get<T = any>(key: string): Promise<T | null> {
    try {
      if (this.connected && this.client) {
        const val = await this.client.get(key);
        return val ? JSON.parse(val) : null;
      }
      // Memory fallback
      const entry = this.memoryStore.get(key);
      if (!entry) return null;
      if (entry.expiresAt < Date.now()) {
        this.memoryStore.delete(key);
        return null;
      }
      return JSON.parse(entry.value);
    } catch {
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds = 300): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (this.connected && this.client) {
        await this.client.setex(key, ttlSeconds, serialized);
        return;
      }
      // Memory fallback
      this.memoryStore.set(key, {
        value: serialized,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
    } catch {
      // Cache failure is silent — app continues
    }
  }

  async del(key: string): Promise<void> {
    try {
      if (this.connected && this.client) {
        await this.client.del(key);
      } else {
        this.memoryStore.delete(key);
      }
    } catch {}
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      if (this.connected && this.client) {
        const keys: string[] = await this.client.keys(pattern);
        if (keys.length > 0) await this.client.del(...keys);
      } else {
        // Memory: iterate and delete matching
        for (const key of this.memoryStore.keys()) {
          if (key.startsWith(pattern.replace('*', ''))) {
            this.memoryStore.delete(key);
          }
        }
      }
    } catch {}
  }

  /**
   * Read-through cache helper.
   * Returns cached value if present, otherwise calls factory, caches result, returns it.
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds = 300,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const fresh = await factory();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  async isHealthy(): Promise<boolean> {
    if (this.connected && this.client) {
      try {
        const pong = await this.client.ping();
        return pong === 'PONG';
      } catch {
        return false;
      }
    }
    return true; // memory fallback is always "healthy"
  }

  get isRedisConnected(): boolean {
    return this.connected;
  }
}

// ─── Module ───────────────────────────────────────────────────────────────────
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class AppCacheModule {}

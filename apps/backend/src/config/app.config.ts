import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3001,
  name: process.env.APP_NAME || 'Barakah Finance POS',
  url: process.env.APP_URL || 'http://localhost:3001',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5242880,
  logLevel: process.env.LOG_LEVEL || 'debug',
  logDir: process.env.LOG_DIR || './logs',
  throttleTtl: parseInt(process.env.THROTTLE_TTL, 10) || 60,
  throttleLimit: parseInt(process.env.THROTTLE_LIMIT, 10) || 100,
}));

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL,
}));

export const jwtConfig = registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
}));

export const bcryptConfig = registerAs('bcrypt', () => ({
  rounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
}));

export const redisConfig = registerAs('redis', () => {
  // Priority: REDIS_URL (single DSN) > REDIS_HOST/PORT/PASSWORD (individual vars)
  // Docker compose sets REDIS_URL=redis://redis:6379
  // Local dev sets REDIS_URL=redis://localhost:6379
  const url = process.env.REDIS_URL;
  if (url) {
    const parsed = new URL(url);
    return {
      url,
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 6379,
      password: parsed.password || undefined,
      db: parseInt(parsed.pathname.replace('/', ''), 10) || 0,
    };
  }
  // Fallback to individual vars (backwards compat)
  return {
    url: undefined,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
  };
});

export const seedConfig = registerAs('seed', () => ({
  adminUsername: process.env.SEED_ADMIN_USERNAME || 'admin',
  adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@barakahfinance.com',
  adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@123456',
  adminPhone: process.env.SEED_ADMIN_PHONE || '01700000000',
}));

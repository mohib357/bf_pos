import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { globalValidationPipe } from './common/pipes/validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') || 3001;
  const frontendUrl = configService.get<string>('app.frontendUrl') || 'http://localhost:3000';
  const corsOrigins = configService.get<string[]>('app.corsOrigins') || [frontendUrl];
  const nodeEnv = configService.get<string>('app.nodeEnv') || 'development';

  // Security
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  // CORS
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Global validation pipe
  app.useGlobalPipes(globalValidationPipe);

  // Swagger documentation (dev only)
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Barakah Finance POS API')
      .setDescription('Business Management System API — Library & Stationery')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication')
      .addTag('users', 'User Management')
      .addTag('products', 'Product Catalog')
      .addTag('sales', 'Sales / POS')
      .addTag('purchases', 'Purchases')
      .addTag('suppliers', 'Suppliers')
      .addTag('customers', 'Customers')
      .addTag('inventory', 'Inventory')
      .addTag('accounting', 'Accounting')
      .addTag('settings', 'Settings')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });

    console.log(`📖 API Docs: http://localhost:${port}/api/docs`);
  }

  await app.listen(port, '0.0.0.0');

  console.log(`
╔═══════════════════════════════════════════════════╗
║     Barakah Finance POS — Backend API             ║
║     বারাকাহ ফাইন্যান্স POS — ব্যাকএন্ড API      ║
╠═══════════════════════════════════════════════════╣
║  Status  : Running ✓                             ║
║  Port    : ${port}                                    ║
║  Env     : ${nodeEnv.padEnd(10)}                        ║
║  API     : http://localhost:${port}/api/v1            ║
╚═══════════════════════════════════════════════════╝
  `);
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});

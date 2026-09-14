import { ValidationPipe as NestValidationPipe } from '@nestjs/common';

export const globalValidationPipe = new NestValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: false,
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
  validationError: {
    target: false,
    value: false,
  },
});

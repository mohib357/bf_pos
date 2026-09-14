import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiResponse } from '../dto/api-response.dto';
import { Prisma } from '@prisma/client';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let messageBn = 'সার্ভারে সমস্যা হয়েছে';
    let errors: any[] = [];

    // NestJS HTTP exceptions
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as any;
        message = resp.message || message;
        if (Array.isArray(resp.message)) {
          errors = resp.message.map((msg: string) => ({
            field: msg.split(' ')[0],
            message: msg,
          }));
          message = 'Validation failed';
          messageBn = 'তথ্য যাচাই ব্যর্থ হয়েছে';
        }
      }
    }

    // Prisma errors
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const prismaError = this.handlePrismaError(exception);
      status = prismaError.status;
      message = prismaError.message;
      messageBn = prismaError.messageBn;
    }

    else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid data provided';
      messageBn = 'ভুল তথ্য প্রদান করা হয়েছে';
    }

    // Log the error
    this.logger.error(
      `[${request.method}] ${request.url} - ${status}: ${message}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    const apiResponse = ApiResponse.error(message, messageBn, errors.length > 0 ? errors : undefined);
    apiResponse.path = request.url;

    response.status(status).json(apiResponse);
  }

  private handlePrismaError(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
    messageBn: string;
  } {
    switch (error.code) {
      case 'P2002': {
        const field = (error.meta?.target as string[])?.join(', ') || 'field';
        return {
          status: HttpStatus.CONFLICT,
          message: `A record with this ${field} already exists`,
          messageBn: `এই ${field} দিয়ে ইতিমধ্যে একটি রেকর্ড আছে`,
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          messageBn: 'রেকর্ড পাওয়া যায়নি',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid reference: related record not found',
          messageBn: 'সম্পর্কিত রেকর্ড পাওয়া যায়নি',
        };
      case 'P2014':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid relation data',
          messageBn: 'অবৈধ সম্পর্ক ডেটা',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database error occurred',
          messageBn: 'ডেটাবেসে সমস্যা হয়েছে',
        };
    }
  }
}

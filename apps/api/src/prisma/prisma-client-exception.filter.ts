import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Maps Prisma errors to HTTP responses so schema drift (missing columns) is actionable
 * instead of a generic 500.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaClientExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    this.logger.error(`${exception.code}: ${exception.message}`);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Database error';

    switch (exception.code) {
      case 'P2022':
      case 'P2010':
        status = HttpStatus.SERVICE_UNAVAILABLE;
        message =
          'Database schema is out of sync. From apps/api run: npx prisma db push — or baseline and run npx prisma migrate deploy.';
        break;
      case 'P2002':
        status = HttpStatus.CONFLICT;
        message = 'A record with this value already exists.';
        break;
      default:
        message = exception.message;
    }

    response.status(status).json({
      statusCode: status,
      message,
      code: exception.code,
    });
  }
}

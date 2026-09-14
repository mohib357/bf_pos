/**
 * Centralized API Response Format
 * All API responses follow this structure for consistency
 */
export class ApiResponse<T = any> {
  success: boolean;
  message: string;
  messagebn?: string;
  data?: T;
  meta?: PaginationMeta;
  errors?: ValidationErrorItem[];
  timestamp: string;
  path?: string;

  constructor(partial: Partial<ApiResponse<T>>) {
    Object.assign(this, partial);
    this.timestamp = new Date().toISOString();
  }

  static success<T>(
    data: T,
    message = 'Success',
    messageBn = 'সফল',
    meta?: PaginationMeta,
  ): ApiResponse<T> {
    return new ApiResponse<T>({
      success: true,
      message,
      messagebn: messageBn,
      data,
      meta,
    });
  }

  static error(
    message: string,
    messageBn?: string,
    errors?: ValidationErrorItem[],
  ): ApiResponse<null> {
    return new ApiResponse<null>({
      success: false,
      message,
      messagebn: messageBn,
      data: null,
      errors,
    });
  }

  static paginated<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
    message = 'Success',
    messageBn = 'সফল',
  ): ApiResponse<T[]> {
    const totalPages = Math.ceil(total / limit);
    return new ApiResponse<T[]>({
      success: true,
      message,
      messagebn: messageBn,
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  }
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ValidationErrorItem {
  field: string;
  message: string;
  messageBn?: string;
}

export class PaginationQueryDto {
  page?: number = 1;
  limit?: number = 20;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

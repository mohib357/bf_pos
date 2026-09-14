/**
 * Notifications Module
 *
 * Serves in-app notifications from the `notifications` table.
 * Notifications are created by other services (sales, inventory alerts, etc.).
 * For now this module provides: list, mark-read, and unread-count endpoints.
 */
import { Module, Injectable, Controller, Get, Post, Patch, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';
import { ApiExcludeController } from '@nestjs/swagger';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async getForUser(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [notifications, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);
    return { data: notifications, total, page, limit };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  /** Called by other services to create a notification */
  async create(userId: string, title: string, titleBn: string, body: string, type = 'INFO', data?: any) {
    return this.prisma.notification.create({
      data: { userId, title, titleBn, body, bodyBn: body, type, data: data ?? {} },
    });
  }
}

@ApiExcludeController()
@Controller('notifications')
class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  async list(
    @CurrentUser('id') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Number(limit) || 20);
    const result = await this.svc.getForUser(userId, p, l);
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser('id') userId: string) {
    const count = await this.svc.getUnreadCount(userId);
    return ApiResponse.success({ count });
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.svc.markRead(userId, id);
    return ApiResponse.success({ message: 'Marked as read' });
  }

  @Post('mark-all-read')
  @HttpCode(HttpStatus.OK)
  async markAllRead(@CurrentUser('id') userId: string) {
    await this.svc.markAllRead(userId);
    return ApiResponse.success({ message: 'All notifications marked as read' });
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

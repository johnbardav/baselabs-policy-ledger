import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../common/database/database.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  @ApiOperation({ summary: 'Check API and database readiness' })
  @ApiOkResponse({ description: 'API and database are ready.' })
  @ApiServiceUnavailableResponse({ description: 'Database is unavailable.' })
  async getHealth(): Promise<Record<string, unknown>> {
    try {
      await this.database.ping();
      return {
        status: 'ok',
        database: 'reachable',
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        message: 'Database is unavailable.',
        error: 'Service unavailable',
      });
    }
  }
}

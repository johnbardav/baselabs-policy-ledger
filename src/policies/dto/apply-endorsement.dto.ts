import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

export class ApplyEndorsementDto {
  @ApiPropertyOptional({
    example: 'END-2001',
    description: 'May be supplied here or in the Idempotency-Key header. If both are present, they must match.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  @Matches(IDEMPOTENCY_KEY_PATTERN)
  idempotency_key?: string;

  @ApiProperty({ example: '2026-07-01', format: 'date' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effective_date must use YYYY-MM-DD format',
  })
  effective_date!: string;

  @ApiProperty({ example: 144000, description: 'Annual premium in integer cents.' })
  @IsInt()
  @Min(0)
  @Max(9_000_000_000_000_000)
  new_annual_premium_cents!: number;

  @ApiProperty({ example: 'Water-shutoff discount removed' })
  @IsString()
  @Length(3, 500)
  @Matches(/\S/, { message: 'reason must contain at least one non-whitespace character' })
  reason!: string;
}

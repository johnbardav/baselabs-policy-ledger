import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

export class RecordPaymentDto {
  @ApiPropertyOptional({
    example: 'PAY-9001',
    description: 'May be supplied here or in the Idempotency-Key header. If both are present, they must match.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  @Matches(IDEMPOTENCY_KEY_PATTERN)
  idempotency_key?: string;

  @ApiProperty({ example: 'PAY-9001' })
  @IsString()
  @Length(1, 128)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  external_payment_id!: string;

  @ApiProperty({ example: 12099, description: 'Received amount in integer cents.' })
  @IsInt()
  @Min(1)
  @Max(9_000_000_000_000_000)
  amount_cents!: number;

  @ApiProperty({ example: 'USD', minLength: 3, maxLength: 3 })
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be an uppercase ISO-style three-letter code' })
  currency!: string;

  @ApiProperty({ example: '2026-07-03T18:30:00Z', format: 'date-time' })
  @IsISO8601({ strict: true })
  received_at!: string;
}

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ApplyEndorsementDto } from './dto/apply-endorsement.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { PoliciesService } from './policies.service';

@ApiTags('policies')
@Controller('policies')
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Post(':policyId/endorsements')
  @ApiOperation({
    summary: 'Apply a mid-term endorsement',
    description:
      'Validates the policy and dates, calculates deterministic proration, creates one billing document, posts balanced ledger entries, and appends a hash-chained policy event in one transaction.',
  })
  @ApiParam({ name: 'policyId', example: 'POL-1001' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Required unless idempotency_key is supplied in the JSON body.',
    example: 'END-2001',
  })
  @ApiCreatedResponse({ description: 'Endorsement applied or original result replayed.' })
  @ApiBadRequestResponse({ description: 'Malformed request or missing idempotency key.' })
  @ApiConflictResponse({ description: 'Idempotency key reused with a different payload.' })
  @ApiNotFoundResponse({ description: 'Policy not found.' })
  @ApiUnprocessableEntityResponse({ description: 'Invalid policy status, date, or zero-cent adjustment.' })
  async applyEndorsement(
    @Param('policyId') policyId: string,
    @Headers('idempotency-key') headerKey: string | undefined,
    @Body() body: ApplyEndorsementDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const key = this.policiesService.resolveIdempotencyKey(
      headerKey,
      body.idempotency_key,
    );
    const result = await this.policiesService.applyEndorsement(policyId, key, body);
    response.status(result.statusCode);
    if (result.replayed) {
      response.setHeader('Idempotency-Replayed', 'true');
    }
    return result.body;
  }

  @Post(':policyId/payments')
  @ApiOperation({
    summary: 'Record received payment data',
    description:
      'Ingests metadata for a payment already processed elsewhere. It does not contact a payment provider or process money.',
  })
  @ApiParam({ name: 'policyId', example: 'POL-1001' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Required unless idempotency_key is supplied in the JSON body.',
    example: 'PAY-9001',
  })
  @ApiCreatedResponse({ description: 'Payment data recorded or original result replayed.' })
  @ApiBadRequestResponse({ description: 'Malformed request or missing idempotency key.' })
  @ApiConflictResponse({ description: 'Idempotency or external payment conflict.' })
  @ApiNotFoundResponse({ description: 'Policy not found.' })
  @ApiUnprocessableEntityResponse({ description: 'Payment currency differs from policy currency.' })
  async recordPayment(
    @Param('policyId') policyId: string,
    @Headers('idempotency-key') headerKey: string | undefined,
    @Body() body: RecordPaymentDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const key = this.policiesService.resolveIdempotencyKey(
      headerKey,
      body.idempotency_key,
    );
    const result = await this.policiesService.recordPayment(policyId, key, body);
    response.status(result.statusCode);
    if (result.replayed) {
      response.setHeader('Idempotency-Replayed', 'true');
    }
    return result.body;
  }

  @Get(':policyId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get current policy state and operator summary' })
  @ApiParam({ name: 'policyId', example: 'POL-1001' })
  @ApiOkResponse({ description: 'Policy state, billing, payments, balance, ledger, history, and suggested action.' })
  @ApiNotFoundResponse({ description: 'Policy not found.' })
  getPolicyState(@Param('policyId') policyId: string): Promise<Record<string, unknown>> {
    return this.policiesService.getPolicyState(policyId);
  }

  @Get(':policyId/ledger')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get double-entry ledger details and balance proof' })
  @ApiParam({ name: 'policyId', example: 'POL-1001' })
  @ApiOkResponse({ description: 'Ledger transactions, entries, totals, and balanced status.' })
  @ApiNotFoundResponse({ description: 'Policy not found.' })
  getLedger(@Param('policyId') policyId: string): Promise<Record<string, unknown>> {
    return this.policiesService.getLedger(policyId);
  }

  @Get(':policyId/history/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify the append-only hash chain for policy events' })
  @ApiParam({ name: 'policyId', example: 'POL-1001' })
  @ApiOkResponse({ description: 'History verification result and event hashes.' })
  @ApiNotFoundResponse({ description: 'Policy not found.' })
  verifyHistory(@Param('policyId') policyId: string): Promise<Record<string, unknown>> {
    return this.policiesService.verifyHistory(policyId);
  }
}

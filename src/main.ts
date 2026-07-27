import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import path from 'node:path';
import { AppModule } from './app.module';
import { readEnvironment } from './common/config/env';
import { ApiExceptionFilter } from './common/exceptions/api-exception.filter';

async function bootstrap(): Promise<void> {
  const environment = readEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(new Logger());
  app.use(helmet({ contentSecurityPolicy: false }));
  if (environment.nodeEnv !== 'production') {
    app.enableCors({ origin: true, credentials: false });
  }
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
    }),
  );
  app.setGlobalPrefix('api');
  app.useStaticAssets(path.join(process.cwd(), 'public'));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Base Labs Policy Ledger API')
    .setDescription(
      'A focused homeowners-insurance policy administration workflow using raw SQL, deterministic proration, idempotent writes, double-entry accounting, and hash-chained policy history.',
    )
    .setVersion('1.0.0')
    .addTag('policies')
    .addTag('health')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument, {
    jsonDocumentUrl: 'docs-json',
  });

  await app.listen(environment.port, '0.0.0.0');
  Logger.log(`API: http://localhost:${environment.port}/api`, 'Bootstrap');
  Logger.log(`UI: http://localhost:${environment.port}`, 'Bootstrap');
  Logger.log(`OpenAPI: http://localhost:${environment.port}/docs`, 'Bootstrap');
}

void bootstrap();

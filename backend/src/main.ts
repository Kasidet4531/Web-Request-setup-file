import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import session from 'express-session';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: configService.get<string>(
      'FRONTEND_ORIGIN',
      'http://localhost:5173',
    ),
    credentials: true,
  });

  app.use(
    session({
      name: configService.get<string>('SESSION_COOKIE_NAME', 'psf.sid'),
      secret: configService.get<string>(
        'SESSION_SECRET',
        'dev-session-secret-change-me',
      ),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure:
          configService.get<string>('SESSION_COOKIE_SECURE', 'false') ===
          'true',
        maxAge: configService.get<number>(
          'SESSION_COOKIE_MAX_AGE_MS',
          1000 * 60 * 60 * 8,
        ),
      },
    }),
  );

  app.setGlobalPrefix('api');

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  Logger.log(`Backend listening on port ${port}`, 'Bootstrap');
}

void bootstrap();

import { plainToInstance, Type } from "class-transformer";
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync
} from "class-validator";

export enum Environment {
  Development = "development",
  Production = "production",
  Test = "test",
  Staging = "staging"
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT: number = 8000;

  @IsString()
  @IsNotEmpty()
  FRONTEND_URL!: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN: string = "15m";

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = "7d";

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_SECRET?: string;

  @IsString()
  @IsOptional()
  GOOGLE_CALLBACK_URL?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false
  });
  if (errors.length > 0) {
    const formattedErrors = errors
      .map((err) => {
        if (err.value === undefined || err.value === null) {
          return `  - ${err.property}: MISSING`;
        }
        const constraints = Object.values(err.constraints ?? {}).join(", ");
        return `  - ${err.property}: ${constraints}`;
      })
      .join("\n");
    throw new Error(`\n[Environment Validation Error]\n${formattedErrors}\n`);
  }
  return validatedConfig;
}

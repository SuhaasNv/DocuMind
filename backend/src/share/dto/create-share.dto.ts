import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** One citation as sent by the client. Global whitelist+forbidNonWhitelisted
 * ValidationPipe strips/rejects any other keys (mass-assignment safe); the
 * snapshot serializer whitelists again on top. */
export class ShareSourceDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  marker?: number;

  @IsOptional()
  @IsNumber()
  pageStart?: number;

  @IsOptional()
  @IsNumber()
  pageEnd?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  quote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  snippet?: string;
}

export class CreateShareDto {
  @IsString()
  @MinLength(1, { message: 'question must not be empty' })
  @MaxLength(4000, { message: 'question must be at most 4000 characters' })
  question!: string;

  @IsString()
  @MinLength(1, { message: 'answer must not be empty' })
  @MaxLength(20000, { message: 'answer must be at most 20000 characters' })
  answer!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ShareSourceDto)
  sources?: ShareSourceDto[];

  /** Optional expiry; link answers 410 Gone once past. */
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

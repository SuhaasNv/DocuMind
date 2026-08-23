import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Snapshot of one chat source at pin time (mirrors ChatSourceDto). */
export class InsightSourceDto {
  /** 1-based citation number matching [n] markers in the pinned answer. */
  @IsOptional()
  @IsInt()
  @Min(1)
  marker?: number;

  @IsInt()
  @Min(0)
  chunkIndex!: number;

  @IsNumber()
  score!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  snippet?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageStart?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageEnd?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  quote?: string;

  /** Collection chats: which document this source came from. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  documentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  documentName?: string;
}

export class CreateInsightDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  question!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  content!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => InsightSourceDto)
  sources!: InsightSourceDto[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  documentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  documentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  collectionId?: string;
}

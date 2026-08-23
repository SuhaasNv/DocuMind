import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';

export class ChatHistoryTurnDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string;
}

export class ChatRequestDto {
  @IsString()
  @MinLength(1, { message: 'question must not be empty' })
  @MaxLength(4000, { message: 'question must be at most 4000 characters' })
  question!: string;

  /** Recent conversation turns, oldest first. Token-capped server-side. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryTurnDto)
  history?: ChatHistoryTurnDto[];

  /** When true, the response includes a RagDebugDto (retrieval transparency). */
  @IsOptional()
  @IsBoolean()
  debug?: boolean;
}

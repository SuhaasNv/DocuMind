import { IsString, MinLength } from 'class-validator';

export class ChatRequestDto {
  @IsString()
  @MinLength(1, { message: 'question must not be empty' })
  question!: string;
}

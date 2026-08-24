import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateApiTokenDto {
  @IsString()
  @MinLength(1, { message: 'Token name is required' })
  @MaxLength(60)
  name: string;
}

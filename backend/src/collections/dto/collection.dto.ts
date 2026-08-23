import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCollectionDto {
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  @MaxLength(120, { message: 'Name must be at most 120 characters' })
  name!: string;
}

export class UpdateCollectionDto {
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  @MaxLength(120, { message: 'Name must be at most 120 characters' })
  name!: string;
}

export class AddCollectionDocumentDto {
  @IsString()
  @MinLength(1, { message: 'documentId is required' })
  documentId!: string;
}

import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PagePaginationDto } from '../../common/dto/pagination.dto.js';
import {
  DocumentStatus,
  EvalRunKind,
} from '../../../generated/prisma/client.js';

/** Users list: page/limit plus optional name/email substring search. */
export class AdminUsersQueryDto extends PagePaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

/** Eval runs list: page/limit plus optional kind filter. */
export class AdminEvalRunsQueryDto extends PagePaginationDto {
  @IsOptional()
  @IsEnum(EvalRunKind)
  kind?: EvalRunKind;
}

/** Documents list: page/limit plus status filter and name/owner-email search. */
export class AdminDocumentsQueryDto extends PagePaginationDto {
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

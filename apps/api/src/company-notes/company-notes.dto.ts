import { IsOptional, IsString, IsArray, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompanyNoteLinkDto {
  @ApiProperty() @IsString() @IsNotEmpty() label: string;
  @ApiProperty() @IsString() @IsNotEmpty() url: string;
}

export class CreateCompanyNoteDto {
  @ApiProperty() @IsString() @IsNotEmpty() companyName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string;

  @ApiPropertyOptional({ type: [CompanyNoteLinkDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompanyNoteLinkDto)
  links?: CompanyNoteLinkDto[];
}

export class UpdateCompanyNoteDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() companyName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string;

  @ApiPropertyOptional({ type: [CompanyNoteLinkDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompanyNoteLinkDto)
  links?: CompanyNoteLinkDto[];
}

export class CompanyNotesFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) limit?: number;
}

import {
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyTrackerStatus } from '@prisma/client';

export class CompanyNoteLinkDto {
  @ApiProperty() @IsString() @IsNotEmpty() label: string;
  @ApiProperty() @IsString() @IsNotEmpty() url: string;
}

export class CreateCompanyNoteDto {
  /** Required unless `sourceContactId` is set (company name is taken from the contact). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  companyName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() content?: string;

  @ApiPropertyOptional({ type: [CompanyNoteLinkDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompanyNoteLinkDto)
  links?: CompanyNoteLinkDto[];

  @ApiPropertyOptional({ enum: CompanyTrackerStatus })
  @IsOptional()
  @IsEnum(CompanyTrackerStatus)
  status?: CompanyTrackerStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sourceContactId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reminderAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reminderTimezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  reminderRecurrenceDays?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reminderStopOnApplied?: boolean;
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

  @ApiPropertyOptional({ enum: CompanyTrackerStatus })
  @IsOptional()
  @IsEnum(CompanyTrackerStatus)
  status?: CompanyTrackerStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  sourceContactId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  reminderAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reminderTimezone?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  reminderRecurrenceDays?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reminderStopOnApplied?: boolean;
}

export class CompanyNotesFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) limit?: number;

  @ApiPropertyOptional({ enum: CompanyTrackerStatus })
  @IsOptional()
  @IsEnum(CompanyTrackerStatus)
  status?: CompanyTrackerStatus;

  /** When true, rows with status ARCHIVED are omitted. */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  hideArchived?: boolean;
}

export class ContactCompanySuggestionsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) limit?: number;
}

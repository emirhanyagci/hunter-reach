import { IsString, IsArray, IsOptional, IsDateString, IsObject, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ContactTemplateAssignmentDto {
  @ApiProperty() @IsString() contactId: string;
  @ApiProperty() @IsString() templateId: string;
  @ApiProperty() @IsString() routingSource: 'auto' | 'manual' | 'unmatched';
}

export class CreateCampaignDto {
  @ApiProperty() @IsString() name: string;

  // Single-template mode: required when not using routing
  @ApiPropertyOptional() @IsOptional() @IsString() templateId?: string;

  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) contactIds: string[];

  // Optional per-campaign template overrides (does NOT modify original template)
  @ApiPropertyOptional() @IsOptional() @IsString() customSubject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customBodyHtml?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customBodyText?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;

  /**
   * Map of contactId → 'male' | 'female'. Contacts not present in this map
   * will receive the default template variant.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  contactGenders?: Record<string, 'male' | 'female'>;

  /**
   * Routing mode: per-contact template assignments produced by the routing preview.
   * When provided, each contact receives the template specified here instead of templateId.
   * templateId is used as the fallback for contacts with routingSource='unmatched'.
   */
  @ApiPropertyOptional({ type: [ContactTemplateAssignmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactTemplateAssignmentDto)
  contactTemplateAssignments?: ContactTemplateAssignmentDto[];
}

export class DetectGendersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  contactIds: string[];
}

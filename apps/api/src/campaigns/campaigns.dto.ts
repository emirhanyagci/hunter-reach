import { IsString, IsArray, IsOptional, IsDateString, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCampaignDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() templateId: string;
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
}

export class DetectGendersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  contactIds: string[];
}

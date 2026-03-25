import { IsString, IsOptional, IsUUID, IsBoolean, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTemplateDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() subject: string;
  @ApiProperty() @IsString() bodyHtml: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bodyText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;

  // Male variant
  @ApiPropertyOptional() @IsOptional() @IsString() maleSubject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() maleBodyHtml?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() maleBodyText?: string;

  // Female variant
  @ApiPropertyOptional() @IsOptional() @IsString() femaleSubject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() femaleBodyHtml?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() femaleBodyText?: string;
}

export class UpdateTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bodyHtml?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bodyText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;

  // Male variant
  @ApiPropertyOptional() @IsOptional() @IsString() maleSubject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() maleBodyHtml?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() maleBodyText?: string;

  // Female variant
  @ApiPropertyOptional() @IsOptional() @IsString() femaleSubject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() femaleBodyHtml?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() femaleBodyText?: string;
}

export class PreviewTemplateDto {
  @ApiProperty() @IsString() contactId: string;
}

export class CreateCategoryDto {
  @ApiProperty() @IsString() name: string;
}

export class SendTestEmailDto {
  @ApiProperty() @IsString() subject: string;
  @ApiProperty() @IsString() bodyHtml: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bodyText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() toEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() templateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() customData?: Record<string, string>;
}

export class SendToContactDto {
  @ApiProperty() @IsString() contactId: string;
  @ApiProperty() @IsString() templateId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gender?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customSubject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customBodyHtml?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customBodyText?: string;
}

import { IsString, IsArray, IsOptional, IsInt, Min, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoutingRuleDto {
  @ApiProperty() @IsString() categoryName: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) keywords: string[];
  @ApiPropertyOptional() @IsOptional() @IsUUID() templateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) priority?: number;
}

export class UpdateRoutingRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() categoryName?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) keywords?: string[];
  @ApiPropertyOptional() @IsOptional() @IsUUID() templateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) priority?: number;
}

export class PreviewRoutingDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) contactIds: string[];
  @ApiPropertyOptional() @IsOptional() @IsUUID() fallbackTemplateId?: string;
}

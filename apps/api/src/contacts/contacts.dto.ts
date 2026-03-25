import { IsOptional, IsString, IsNumber, IsArray, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ContactsFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() importId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jobTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() company?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() verificationStatus?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() scoreMin?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() scoreMax?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() tags?: string[];
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(1) limit?: number;
}

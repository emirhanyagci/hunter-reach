import { IsOptional, IsString, IsNumber, IsArray, Min, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

export class CreateContactDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() company?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jobTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gender?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() linkedin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phoneNumber?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() tags?: string[];
}

export class UpdateContactDto {
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() company?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jobTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gender?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() linkedin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phoneNumber?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() tags?: string[];
}

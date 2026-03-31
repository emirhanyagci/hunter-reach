import {
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  Min,
  Max,
  IsEmail,
  IsIn,
  IsBoolean,
  ArrayMaxSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
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
  /** Single tag: contact must include this tag (use for categories / labels). */
  @ApiPropertyOptional() @IsOptional() @IsString() tag?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gender?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  hasLinkedin?: boolean;
  @ApiPropertyOptional({
    enum: ['never_contacted', 'scheduled', 'sent', 'replied', 'not_replied'],
  })
  @IsOptional()
  @IsIn(['never_contacted', 'scheduled', 'sent', 'replied', 'not_replied'])
  emailStatus?: 'never_contacted' | 'scheduled' | 'sent' | 'replied' | 'not_replied';
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(250) limit?: number;
}

export class ContactIdsLookupDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5000)
  ids: string[];
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

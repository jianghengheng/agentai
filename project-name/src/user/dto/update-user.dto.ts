import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({
    type: String,
    format: 'email',
    maxLength: 254,
    example: 'alice@example.com',
    description: '新邮箱，必须唯一，不能为 null',
  })
  @ValidateIf((_object: UpdateUserDto, value: unknown) => value !== undefined)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    type: String,
    maxLength: 100,
    nullable: true,
    example: '张三',
    description: '姓名，传 null 可清空',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string | null;
}

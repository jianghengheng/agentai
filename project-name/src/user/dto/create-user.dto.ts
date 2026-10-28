import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    type: String,
    format: 'email',
    maxLength: 254,
    example: 'alice@example.com',
    description: '邮箱，必须唯一',
  })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({
    type: String,
    maxLength: 100,
    nullable: true,
    example: '张三',
    description: '姓名',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string | null;
}

import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: '用户 ID' })
  id!: string;

  @ApiProperty({
    type: String,
    format: 'email',
    example: 'alice@example.com',
    description: '邮箱',
  })
  email!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '张三',
    description: '姓名',
  })
  name!: string | null;

  @ApiProperty({ type: String, format: 'date-time', description: '创建时间' })
  createdAt!: string;
}

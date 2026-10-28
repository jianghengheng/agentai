import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UserService } from './user.service.js';

const validationOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
};

@Controller('user')
@ApiTags('用户管理')
@ApiBadRequestResponse({ description: '参数校验失败' })
export class UserController {
  constructor(@Inject(UserService) private readonly userService: UserService) {}

  @Post()
  @ApiOperation({ summary: '新增用户' })
  @ApiBody({
    type: CreateUserDto,
    required: true,
    examples: {
      createUser: {
        summary: '新增用户',
        value: { email: 'alice@example.com', name: '张三' },
      },
    },
  })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiConflictResponse({ description: '邮箱已存在' })
  create(
    @Body(
      new ValidationPipe({
        ...validationOptions,
        expectedType: CreateUserDto,
      }),
    )
    dto: CreateUserDto,
  ) {
    return this.userService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '分页查询用户' })
  @ApiOkResponse({ type: UserResponseDto, isArray: true })
  findAll(
    @Query(
      new ValidationPipe({
        ...validationOptions,
        expectedType: ListUsersQueryDto,
      }),
    )
    query: ListUsersQueryDto,
  ) {
    return this.userService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '查询用户详情' })
  @ApiParam({ name: 'id', format: 'uuid', description: '用户 ID' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: '用户不存在' })
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.userService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '修改用户' })
  @ApiParam({ name: 'id', format: 'uuid', description: '用户 ID' })
  @ApiBody({ type: UpdateUserDto, description: '至少提供 email 或 name' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: '用户不存在' })
  @ApiConflictResponse({ description: '邮箱已存在' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(
      new ValidationPipe({
        ...validationOptions,
        expectedType: UpdateUserDto,
      }),
    )
    dto: UpdateUserDto,
  ) {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除用户' })
  @ApiParam({ name: 'id', format: 'uuid', description: '用户 ID' })
  @ApiOkResponse({ description: '删除成功' })
  @ApiNotFoundResponse({ description: '用户不存在' })
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.userService.remove(id);
  }
}

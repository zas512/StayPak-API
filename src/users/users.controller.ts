import { Controller, Get, Injectable, Post } from '@nestjs/common';

@Injectable()
@Controller('users')
export class UsersController {
  @Get()
  findAll() {
    return 'This action returns all users';
  }
  @Post()
  create() {
    return 'This action adds a new user';
  }
}

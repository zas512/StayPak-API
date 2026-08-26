import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, ReviewQueryDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: Request, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(req.user['sub'], dto);
  }

  @Get()
  async findAll(@Query() query: ReviewQueryDto) {
    return this.reviewsService.findAll(query);
  }

  @Get('booking/:bookingId')
  async findByBooking(@Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.reviewsService.findByBooking(bookingId);
  }

  @Get('host/:hostId/rating')
  async getHostRating(@Param('hostId', ParseUUIDPipe) hostId: string) {
    return this.reviewsService.getHostRating(hostId);
  }

  @Get('listing/:listingId/rating')
  async getListingRating(@Param('listingId', ParseUUIDPipe) listingId: string) {
    return this.reviewsService.getListingRating(listingId);
  }
}
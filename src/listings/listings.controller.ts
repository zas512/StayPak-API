import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ListingsService } from './listings.service';
import {
  CreateListingDto,
  UpdateListingDto,
  ListingQueryDto,
  AvailabilityDto,
  AddPhotoDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: Request & { user: { sub: string } }, @Body() dto: CreateListingDto) {
    return this.listingsService.create(req.user.sub, dto);
  }

  @Get()
  async findAll(@Query() query: ListingQueryDto) {
    return this.listingsService.findAll(query);
  }

  @Get('cities')
  async getCities() {
    return this.listingsService.getCities();
  }

  @Get('property-types')
  async getPropertyTypes() {
    return this.listingsService.getPropertyTypes();
  }

  @Get('amenities')
  async getAmenities() {
    return this.listingsService.getAmenities();
  }

  @Get('host/mine')
  @UseGuards(JwtAuthGuard)
  async findByHost(@Req() req: Request & { user: { sub: string } }, @Query() query: ListingQueryDto) {
    return this.listingsService.findByHost(req.user.sub, query);
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.listingsService.findById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Req() req: Request & { user: { sub: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListingDto,
  ) {
    return this.listingsService.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(@Req() req: Request & { user: { sub: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.listingsService.delete(req.user.sub, id);
  }

  @Post(':id/photos')
  @UseGuards(JwtAuthGuard)
  async addPhoto(
    @Req() req: Request & { user: { sub: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPhotoDto,
  ) {
    return this.listingsService.addPhoto(id, req.user.sub, dto);
  }

  @Delete(':id/photos/:photoId')
  @UseGuards(JwtAuthGuard)
  async removePhoto(
    @Req() req: Request & { user: { sub: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ) {
    return this.listingsService.removePhoto(id, req.user.sub, photoId);
  }

  @Patch(':id/availability')
  @UseGuards(JwtAuthGuard)
  async updateAvailability(
    @Req() req: Request & { user: { sub: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AvailabilityDto[],
  ) {
    return this.listingsService.updateAvailability(id, req.user.sub, dto);
  }
}
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateListingDto,
  UpdateListingDto,
  ListingQueryDto,
} from './dto';
import { Prisma, ListingStatus, PropertyType } from '@prisma/client';

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(hostId: string, dto: CreateListingDto) {
    const listing = await this.prisma.listing.create({
      data: {
        hostId,
        title: dto.title,
        description: dto.description,
        propertyType: dto.propertyType,
        city: dto.city,
        area: dto.area,
        address: dto.address,
        lat: dto.lat ? new Prisma.Decimal(dto.lat) : null,
        lng: dto.lng ? new Prisma.Decimal(dto.lng) : null,
        maxGuests: dto.maxGuests,
        bedrooms: dto.bedrooms,
        bathrooms: dto.bathrooms,
        amenities: dto.amenities,
        pricePerNight: new Prisma.Decimal(dto.pricePerNight),
        instantBook: dto.instantBook ?? false,
        status: ListingStatus.draft,
      },
      include: {
        photos: true,
      },
    });

    this.logger.log(`Listing created: ${listing.id} by host: ${hostId}`);
    return listing;
  }

  async findAll(query: ListingQueryDto) {
    const {
      page = 1,
      limit = 20,
      city,
      propertyType,
      minPrice,
      maxPrice,
      minGuests,
      checkIn,
      checkOut,
      amenities,
      instantBook,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.ListingWhereInput = {
      status: ListingStatus.active,
    };

    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }

    if (propertyType) {
      where.propertyType = propertyType;
    }

    if (minPrice || maxPrice) {
      where.pricePerNight = {};
      if (minPrice) where.pricePerNight.gte = new Prisma.Decimal(minPrice);
      if (maxPrice) where.pricePerNight.lte = new Prisma.Decimal(maxPrice);
    }

    if (minGuests) {
      where.maxGuests = { gte: minGuests };
    }

    if (instantBook !== undefined) {
      where.instantBook = instantBook;
    }

    if (amenities && amenities.length > 0) {
      where.amenities = { hasEvery: amenities };
    }

    // Availability filter for dates
    if (checkIn && checkOut) {
      const checkInDate = new Date(checkIn);
      const checkOutDate = new Date(checkOut);

      // Get listing IDs that have availability for all dates in range
      const unavailableListingIds = await this.prisma.availability.findMany({
        where: {
          date: {
            gte: checkInDate,
            lt: checkOutDate,
          },
          isBlocked: true,
        },
        select: { listingId: true },
        distinct: ['listingId'],
      });

      const excludedIds = unavailableListingIds.map((a) => a.listingId);
      if (excludedIds.length > 0) {
        where.id = { notIn: excludedIds };
      }
    }

    const orderBy: Prisma.ListingOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [listings, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          photos: {
            where: { isCover: true },
            take: 1,
          },
          host: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.listing.count({ where }),
    ]);

    return {
      data: listings,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        host: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            phone: true,
            cnicStatus: true,
          },
        },
        availability: {
          where: {
            date: { gte: new Date() },
            isBlocked: false,
          },
          orderBy: { date: 'asc' },
          take: 90,
        },
      },
    });

    if (!listing) {
      throw new NotFoundException(`Listing ${id} not found`);
    }

    return listing;
  }

  async findByHost(hostId: string, query: ListingQueryDto) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ListingWhereInput = { hostId };

    if (query.status) {
      where.status = query.status;
    }

    const [listings, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          photos: { where: { isCover: true }, take: 1 },
          _count: { select: { bookings: true } },
        },
      }),
      this.prisma.listing.count({ where }),
    ]);

    return {
      data: listings,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async update(hostId: string, id: string, dto: UpdateListingDto) {
    const listing = await this.findById(id);

    if (listing.hostId !== hostId) {
      throw new BadRequestException('You can only update your own listings');
    }

    const updated = await this.prisma.listing.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        propertyType: dto.propertyType,
        city: dto.city,
        area: dto.area,
        address: dto.address,
        lat: dto.lat ? new Prisma.Decimal(dto.lat) : undefined,
        lng: dto.lng ? new Prisma.Decimal(dto.lng) : undefined,
        maxGuests: dto.maxGuests,
        bedrooms: dto.bedrooms,
        bathrooms: dto.bathrooms,
        amenities: dto.amenities,
        pricePerNight: dto.pricePerNight ? new Prisma.Decimal(dto.pricePerNight) : undefined,
        instantBook: dto.instantBook,
        status: dto.status,
      },
      include: { photos: true },
    });

    this.logger.log(`Listing updated: ${id}`);
    return updated;
  }

  async delete(hostId: string, id: string) {
    const listing = await this.findById(id);

    if (listing.hostId !== hostId) {
      throw new BadRequestException('You can only delete your own listings');
    }

    // Check for active bookings
    const activeBookings = await this.prisma.booking.count({
      where: {
        listingId: id,
        status: { in: ['pending', 'confirmed'] },
      },
    });

    if (activeBookings > 0) {
      throw new BadRequestException('Cannot delete listing with active bookings');
    }

    await this.prisma.listing.update({
      where: { id },
      data: { status: ListingStatus.deleted },
    });

    this.logger.log(`Listing deleted: ${id}`);
    return { message: 'Listing deleted successfully' };
  }

  async addPhoto(listingId: string, hostId: string, photo: { s3Key: string; cdnUrl: string; isCover?: boolean; sortOrder?: number }) {
    const listing = await this.findById(listingId);

    if (listing.hostId !== hostId) {
      throw new BadRequestException('You can only add photos to your own listings');
    }

    // If this is a cover photo, unset other cover photos
    if (photo.isCover) {
      await this.prisma.listingPhoto.updateMany({
        where: { listingId, isCover: true },
        data: { isCover: false },
      });
    }

    const newPhoto = await this.prisma.listingPhoto.create({
      data: {
        listingId,
        s3Key: photo.s3Key,
        cdnUrl: photo.cdnUrl,
        isCover: photo.isCover ?? false,
        sortOrder: photo.sortOrder ?? 0,
      },
    });

    return newPhoto;
  }

  async removePhoto(listingId: string, hostId: string, photoId: string) {
    const listing = await this.findById(listingId);

    if (listing.hostId !== hostId) {
      throw new BadRequestException('You can only remove photos from your own listings');
    }

    await this.prisma.listingPhoto.delete({
      where: { id: photoId, listingId },
    });

    return { message: 'Photo removed successfully' };
  }

  async updateAvailability(listingId: string, hostId: string, availability: { date: string; isBlocked?: boolean; overridePrice?: number }[]) {
    const listing = await this.findById(listingId);

    if (listing.hostId !== hostId) {
      throw new BadRequestException('You can only update availability for your own listings');
    }

    const results = await Promise.all(
      availability.map((avail) =>
        this.prisma.availability.upsert({
          where: {
            listingId_date: {
              listingId,
              date: new Date(avail.date),
            },
          },
          update: {
            isBlocked: avail.isBlocked ?? false,
            overridePrice: avail.overridePrice ? new Prisma.Decimal(avail.overridePrice) : null,
          },
          create: {
            listingId,
            date: new Date(avail.date),
            isBlocked: avail.isBlocked ?? false,
            overridePrice: avail.overridePrice ? new Prisma.Decimal(avail.overridePrice) : null,
          },
        }),
      ),
    );

    return results;
  }

  async getCities() {
    const cities = await this.prisma.listing.findMany({
      where: { status: ListingStatus.active },
      select: { city: true },
      distinct: ['city'],
      orderBy: { city: 'asc' },
    });
    return cities.map((c) => c.city);
  }

  async getPropertyTypes() {
    return Object.values(PropertyType);
  }

  async getAmenities() {
    // Return standard amenities list
    return [
      'wifi',
      'air_conditioning',
      'heating',
      'kitchen',
      'washer',
      'dryer',
      'tv',
      'parking',
      'pool',
      'gym',
      'elevator',
      'doorman',
      'balcony',
      'garden',
      'bbq',
      'fireplace',
      'hot_tub',
      'wheelchair_accessible',
    ];
  }
}
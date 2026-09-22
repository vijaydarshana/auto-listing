import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // =========================
  // GET ALL PROFILES
  // =========================

  async getProfiles() {
    const profiles =
      await this.prisma.profile.findMany({
        include: {
          fields: true,
        },

        orderBy: {
          createdAt: 'desc',
        },
      });

    return {
      success: true,
      profiles,
    };
  }

  // =========================
  // GET SINGLE PROFILE
  // =========================

  async getProfile(id: string) {
    const profile =
      await this.prisma.profile.findUnique({
        where: {
          id,
        },

        include: {
          fields: true,
        },
      });

    if (!profile) {
      throw new NotFoundException(
        'Profile not found',
      );
    }

    return {
      success: true,
      profile,
    };
  }

  // =========================
  // CREATE PROFILE
  // =========================

  async createProfile(body: any) {
    const profile =
      await this.prisma.profile.create({
        data: {
          name: body.name,
          platform:
            body.platform ?? 'unknown',

          fields: {
            create: (
              body.fields ?? []
            ).map((field: any) => ({
              name: field.name,
              value: field.value,
              selector: field.selector,
              tagName: field.tagName,
              type: field.type ?? '',
              placeholder:
                field.placeholder ?? '',
            })),
          },
        },

        include: {
          fields: true,
        },
      });

    return {
      success: true,
      message:
        'Profile created successfully',
      profile,
    };
  }

  // =========================
  // UPDATE PROFILE
  // =========================

  async updateProfile(
    id: string,
    body: any,
  ) {
    const existingProfile =
      await this.prisma.profile.findUnique({
        where: {
          id,
        },
      });

    if (!existingProfile) {
      throw new NotFoundException(
        'Profile not found',
      );
    }

    // Remove old recorded fields
    await this.prisma.profileField.deleteMany({
      where: {
        profileId: id,
      },
    });

    // Create new fields
    const profile =
      await this.prisma.profile.update({
        where: {
          id,
        },

        data: {
          name:
            body.name ??
            existingProfile.name,

          platform:
            body.platform ??
            existingProfile.platform,

          fields: {
            create: (
              body.fields ?? []
            ).map((field: any) => ({
              name: field.name,
              value: field.value,
              selector:
                field.selector,
              tagName:
                field.tagName,
              type:
                field.type ?? '',
              placeholder:
                field.placeholder ?? '',
            })),
          },
        },

        include: {
          fields: true,
        },
      });

    return {
      success: true,
      message:
        'Profile updated successfully',
      profile,
    };
  }
}
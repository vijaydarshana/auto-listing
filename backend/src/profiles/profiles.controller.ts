import {
  Controller,
  Get,
  Param,
  Post,
  Put,
  Body,
} from '@nestjs/common';

import { ProfilesService } from './profiles.service';

@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly profilesService: ProfilesService,
  ) {}

  @Get()
  getProfiles() {
    return this.profilesService.getProfiles();
  }

  @Get(':id')
  getProfile(@Param('id') id: string) {
    return this.profilesService.getProfile(id);
  }

  @Post()
  createProfile(@Body() body: any) {
    return this.profilesService.createProfile(body);
  }

  @Put(':id')
  updateProfile(
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.profilesService.updateProfile(id, body);
  }
}
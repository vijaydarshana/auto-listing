import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './create-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProducts() {
    const products = await this.prisma.product.findMany({
      include: {
        images: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      success: true,
      products,
    };
  }

  async createProduct(dto: CreateProductDto) {
    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        color: dto.color,
        material: dto.material,
        weight: dto.weight,
        length: dto.length,
        width: dto.width,
        height: dto.height,
      },
    });

    return {
      success: true,
      message: 'Product created successfully',
      product,
    };
  }
}
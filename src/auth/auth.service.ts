import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const validPassword = await bcrypt.compare(dto.password, user.password);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; type?: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.refreshSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.issueTokens(user);
  }

  private async issueTokens(user: {
    id: string;
    email: string;
    role: string;
    name: string;
    specialization: string | null;
    hospitalId?: string | null;
  }) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      hospitalId: user.hospitalId,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, type: 'refresh' },
      { secret: this.refreshSecret(), expiresIn: '30d' },
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        specialization: user.specialization,
        hospitalId: user.hospitalId,
      },
    };
  }

  private refreshSecret() {
    // Falls back to JWT_SECRET if a dedicated refresh secret isn't configured,
    // but a distinct REFRESH_TOKEN_SECRET is recommended in production so a
    // leaked access-token secret can't be used to mint new refresh tokens.
    return process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET;
  }

  async verify(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      specialization: user.specialization,
    };
  }

  async getDoctors(hospitalId?: string, search?: string) {
    return this.prisma.user.findMany({
      where: {
        role: 'doctor',
        ...(hospitalId ? { hospitalId } : {}),
        ...(search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { specialization: { contains: search, mode: 'insensitive' } },
          ],
        } : {}),
      },
      select: {
        id: true, name: true, specialization: true, hospitalId: true,
        hospital: { select: { id: true, name: true, city: true } },
        slots: { select: { id: true, label: true, startTime: true, endTime: true, days: true, maxTokens: true } },
      },
      orderBy: { name: 'asc' },
    });
  }
}

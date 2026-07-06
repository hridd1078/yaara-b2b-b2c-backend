import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class PatientAuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async register(data: { name: string; email: string; password: string; contact: string }) {
    const existing = await this.prisma.patient.findFirst({
      where: { OR: [{ email: data.email }, { contact: data.contact }] },
    });
    if (existing) throw new BadRequestException('Patient with this email or phone already exists');

    const patient = await this.prisma.patient.create({
      data: {
        name: data.name,
        email: data.email,
        contact: data.contact,
        password: await bcrypt.hash(data.password, 10),
        isAppUser: true,
      },
    });

    return this.issueToken(patient);
  }

  async login(email: string, password: string) {
    const patient = await this.prisma.patient.findFirst({ where: { email } });
    if (!patient?.password) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, patient.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.issueToken(patient);
  }

  async getProfile(patientId: string) {
    return this.prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true, name: true, email: true, contact: true,
        dateOfBirth: true, bloodGroup: true, emergencyContact: true,
        medicalHistory: true, createdAt: true,
      },
    });
  }

  async updateProfile(patientId: string, data: any) {
    return this.prisma.patient.update({
      where: { id: patientId },
      data: {
        name: data.name,
        dateOfBirth: data.dateOfBirth,
        bloodGroup: data.bloodGroup,
        emergencyContact: data.emergencyContact,
        address: data.address,
      },
      select: {
        id: true, name: true, email: true, contact: true,
        dateOfBirth: true, bloodGroup: true, emergencyContact: true,
      },
    });
  }

  private issueToken(patient: { id: string; email?: string | null }) {
    const token = this.jwt.sign(
      { sub: patient.id, email: patient.email, type: 'patient' },
      { expiresIn: '30d' },
    );
    return { accessToken: token };
  }
}

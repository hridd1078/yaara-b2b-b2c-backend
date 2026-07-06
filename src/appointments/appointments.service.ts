import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  async book(patientId: string, data: {
    doctorId: string;
    slotId: string;
    hospitalId: string;
    date: string;       // "YYYY-MM-DD"
    visitReason?: string;
  }) {
    // Validate doctor belongs to hospital
    const doctor = await this.prisma.user.findFirst({
      where: { id: data.doctorId, hospitalId: data.hospitalId, role: 'doctor' },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const slot = await this.prisma.doctorSlot.findUnique({ where: { id: data.slotId } });
    if (!slot) throw new NotFoundException('Slot not found');

    const appointmentDate = new Date(data.date + 'T00:00:00.000Z');

    // Check if patient already has appointment on same day with same doctor
    const duplicate = await this.prisma.appointment.findFirst({
      where: { patientId, doctorId: data.doctorId, date: appointmentDate, status: 'confirmed' },
    });
    if (duplicate) throw new BadRequestException('You already have an appointment with this doctor on this date');

    return this.prisma.appointment.create({
      data: {
        patientId,
        doctorId: data.doctorId,
        slotId: data.slotId,
        hospitalId: data.hospitalId,
        date: appointmentDate,
        visitReason: data.visitReason,
        status: 'confirmed',
      },
      include: {
        doctor: { select: { id: true, name: true, specialization: true } },
        slot: { select: { id: true, label: true, startTime: true, endTime: true } },
        hospital: { select: { id: true, name: true, address: true, city: true } },
      },
    });
  }

  async getMyAppointments(patientId: string, status?: string) {
    return this.prisma.appointment.findMany({
      where: {
        patientId,
        ...(status ? { status: status as any } : {}),
      },
      include: {
        doctor: { select: { id: true, name: true, specialization: true } },
        slot: { select: { id: true, label: true, startTime: true, endTime: true } },
        hospital: { select: { id: true, name: true, address: true, city: true } },
        queueEntry: { select: { id: true, tokenNumber: true, status: true, position: true, estimatedWaitMins: true } },
      },
      orderBy: { date: 'desc' },
    });
  }

  async cancel(appointmentId: string, patientId: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, patientId },
    });
    if (!appt) throw new NotFoundException('Appointment not found');
    if (appt.status !== 'confirmed') throw new BadRequestException('Cannot cancel this appointment');

    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'cancelled' },
    });
  }

  // Called by receptionist to check-in an app-booked patient
  // Creates QueueEntry from Appointment
  async checkInAppointment(appointmentId: string, hospitalId: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId },
      include: { patient: true, doctor: true, queueEntry: true },
    });
    if (!appt) throw new NotFoundException('Appointment not found');
    if (appt.queueEntry) throw new BadRequestException('Patient already checked in');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Next token number for this doctor+slot+today
    const lastToken = await this.prisma.queueEntry.findFirst({
      where: { doctorId: appt.doctorId, slotId: appt.slotId, date: today },
      orderBy: { tokenNumber: 'desc' },
    });
    const tokenNumber = (lastToken?.tokenNumber ?? 0) + 1;

    const lastPosition = await this.prisma.queueEntry.findFirst({
      where: { doctorId: appt.doctorId, date: today, status: { in: ['waiting', 'in_consultation'] as any } },
      orderBy: { position: 'desc' },
    });
    const position = (lastPosition?.position ?? 0) + 1;

    return this.prisma.queueEntry.create({
      data: {
        patientId: appt.patientId,
        patientName: appt.patient.name,
        patientContact: appt.patient.contact,
        doctorId: appt.doctorId,
        slotId: appt.slotId,
        hospitalId,
        appointmentId: appt.id,
        date: today,
        tokenNumber,
        position,
        bookingType: 'app_booked',
        visitReason: appt.visitReason,
      },
      include: { patient: true, doctor: true, slot: true },
    });
  }

  // For receptionist — list today's app-booked appointments that haven't been checked in yet
  async getPendingCheckIns(hospitalId: string) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86400000);

    return this.prisma.appointment.findMany({
      where: {
        hospitalId,
        date: { gte: today, lt: tomorrow },
        status: 'confirmed',
        queueEntry: null,
      },
      include: {
        patient: { select: { id: true, name: true, contact: true } },
        doctor: { select: { id: true, name: true, specialization: true } },
        slot: { select: { id: true, label: true, startTime: true, endTime: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Patient can get live queue status for their today's appointment
  async getLiveStatus(appointmentId: string, patientId: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, patientId },
      include: {
        queueEntry: {
          select: {
            id: true, tokenNumber: true, status: true,
            position: true, estimatedWaitMins: true, calledAt: true,
          },
        },
        doctor: { select: { id: true, name: true, specialization: true } },
        hospital: { select: { id: true, name: true } },
      },
    });
    if (!appt) throw new NotFoundException('Appointment not found');
    return appt;
  }
}

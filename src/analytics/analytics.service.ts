import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getDoctorAnalytics(doctorId: string, days: number) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const visits = await this.prisma.visit.findMany({
      where: {
        doctorId,
        createdAt: { gte: since },
        consultationSeconds: { not: null },
      },
      select: { createdAt: true, consultationSeconds: true },
    });

    // Average consultation time across the window — null (not 0) when there's
    // no data yet, so the frontend can render "No data" instead of "0 min avg".
    const avgConsultationSecs = visits.length
      ? Math.round(
          visits.reduce((sum, v) => sum + (v.consultationSeconds ?? 0), 0) / visits.length,
        )
      : null;

    // Daily patient volume (bucket by day)
    const dailyMap = new Map<string, number>();
    for (const v of visits) {
      const day = v.createdAt.toISOString().slice(0, 10);
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
    }

    const dailyVolume = Array.from({ length: days }).map((_, i) => {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      return { date: key, patientCount: dailyMap.get(key) ?? 0 };
    });

    // Weekly trend: group the daily buckets into ISO-week-ish 7-day chunks
    const weeklyTrend: { weekStart: string; patientCount: number; avgConsultationSecs: number | null }[] = [];
    for (let i = 0; i < dailyVolume.length; i += 7) {
      const chunk = dailyVolume.slice(i, i + 7);
      const chunkVisits = visits.filter((v) => {
        const day = v.createdAt.toISOString().slice(0, 10);
        return chunk.some((c) => c.date === day);
      });
      weeklyTrend.push({
        weekStart: chunk[0].date,
        patientCount: chunk.reduce((s, c) => s + c.patientCount, 0),
        avgConsultationSecs: chunkVisits.length
          ? Math.round(
              chunkVisits.reduce((s, v) => s + (v.consultationSeconds ?? 0), 0) /
                chunkVisits.length,
            )
          : null,
      });
    }

    const totalPatients = visits.length;

    return {
      doctorId,
      windowDays: days,
      totalPatients,
      avgConsultationSecs,
      avgConsultationMinutes: avgConsultationSecs === null ? null : Math.round(avgConsultationSecs / 60),
      dailyVolume,
      weeklyTrend,
    };
  }

  /** Clinic-wide rollup for receptionist/admin views. */
  async getClinicAnalytics(days: number) {
    const doctors = await this.prisma.user.findMany({ where: { role: 'doctor' } });
    const perDoctor = await Promise.all(
      doctors.map(async (doc) => ({
        doctorName: doc.name,
        ...(await this.getDoctorAnalytics(doc.id, days)),
      })),
    );

    const totalPatients = perDoctor.reduce((s, d) => s + d.totalPatients, 0);

    return { windowDays: days, totalPatients, perDoctor };
  }
}

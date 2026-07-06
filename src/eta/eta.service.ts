import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

// Specialization baseline consultation times (seconds)
const SPECIALIZATION_BASELINES: Record<string, number> = {
  'General Physician': 420,
  'Cardiology': 720,
  'Dermatology': 480,
  'Orthopedics': 600,
  'Pediatrics': 600,
  'ENT': 540,
  'Gynecology': 720,
  'Neurology': 720,
  'Psychiatry': 900,
  'Ophthalmology': 480,
};

const DEFAULT_SECS = 600; // 10 min fallback

// Time-of-day decay factors (doctors slow down as the day goes on)
const TIME_FACTORS = [
  { start: 8,    end: 9.5,  factor: 0.9  },
  { start: 9.5,  end: 11,   factor: 1.0  },
  { start: 11,   end: 12.5, factor: 1.15 },
  { start: 12.5, end: 14,   factor: 1.35 },
  { start: 14,   end: 16,   factor: 1.2  },
  { start: 16,   end: 17.5, factor: 0.95 },
  { start: 17.5, end: 19,   factor: 1.05 },
  { start: 19,   end: 22,   factor: 1.25 },
];

function getTimeFactor(): number {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  return TIME_FACTORS.find(t => h >= t.start && h < t.end)?.factor ?? 1.0;
}

export interface EtaResult {
  queueEntryId: string;
  patientId: string;
  positionAheadCount: number;
  estimatedWaitSeconds: number;
  estimatedWaitMinutes: number;
  estimatedCallTime: string;
  confidence: 'low' | 'medium' | 'high';
}

// In-memory session call timestamps per doctor (resets on restart — acceptable)
const sessionTaps = new Map<string, Date[]>();

@Injectable()
export class EtaService {
  private readonly logger = new Logger(EtaService.name);

  constructor(
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
  ) {}

  // Called externally when doctor clicks "Next" to record the tap timestamp
  recordTap(doctorId: string) {
    const taps = sessionTaps.get(doctorId) ?? [];
    taps.push(new Date());
    sessionTaps.set(doctorId, taps.slice(-10)); // keep last 10
  }

  // Rolling average of gaps between last N taps (RACT — Layer 5)
  private getRact(doctorId: string): { ract: number | null; confidence: 'low' | 'medium' | 'high' } {
    const taps = sessionTaps.get(doctorId) ?? [];
    if (taps.length < 3) return { ract: null, confidence: 'low' };
    const recent = taps.slice(-6);
    const gaps: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      gaps.push((recent[i].getTime() - recent[i - 1].getTime()) / 1000);
    }
    const ract = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    return {
      ract,
      confidence: taps.length >= 7 ? 'high' : 'medium',
    };
  }

  // Base consultation seconds from rolling avg or specialization baseline
  async getBaselineSecs(doctorId: string): Promise<number> {
    const profile = await this.prisma.doctorEtaProfile.findUnique({ where: { doctorId } });
    if (profile && profile.sampleCount > 0) return profile.avgConsultationSecs;

    // No real data yet — use specialization baseline
    const doctor = await this.prisma.user.findUnique({ where: { id: doctorId } });
    const spec = doctor?.specialization ?? '';
    return SPECIALIZATION_BASELINES[spec] ?? DEFAULT_SECS;
  }

  async recordConsultation(doctorId: string, durationSecs: number) {
    const existing = await this.prisma.doctorEtaProfile.findUnique({ where: { doctorId } });
    if (!existing) {
      await this.prisma.doctorEtaProfile.create({
        data: { doctorId, avgConsultationSecs: durationSecs, sampleCount: 1 },
      });
      return;
    }
    const newCount = existing.sampleCount + 1;
    const newAvg = Math.round(
      (existing.avgConsultationSecs * existing.sampleCount + durationSecs) / newCount,
    );
    await this.prisma.doctorEtaProfile.update({
      where: { doctorId },
      data: { avgConsultationSecs: newAvg, sampleCount: newCount },
    });
  }

  async computeEtasForDoctor(doctorId: string): Promise<EtaResult[]> {
    // Layer 1+2: base seconds (specialization OR rolling avg)
    const baseSecs = await this.getBaselineSecs(doctorId);

    // Layer 2: Doctor Velocity Coefficient — actual vs expected pace in last 60 min
    const sixtyAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentVisits = await this.prisma.visit.findMany({
      where: { doctorId, completedAt: { gte: sixtyAgo }, consultationSeconds: { not: null } },
      select: { consultationSeconds: true },
    });
    let dvc = 1.0;
    if (recentVisits.length >= 2) {
      const actualAvg = recentVisits.reduce((s, v) => s + (v.consultationSeconds ?? 0), 0) / recentVisits.length;
      dvc = actualAvg > 0 ? baseSecs / actualAvg : 1.0;
      dvc = Math.max(0.5, Math.min(2.0, dvc)); // clamp
    }
    const layer2Secs = baseSecs / dvc;

    // Layer 3: Time-of-day decay
    const layer3Secs = layer2Secs * getTimeFactor();

    // Layer 4: No-show correction from last 30 days
    const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const totalRecent = await this.prisma.queueEntry.count({
      where: { doctorId, checkedInAt: { gte: thirtyAgo } },
    });
    const noShows = await this.prisma.queueEntry.count({
      where: { doctorId, status: 'no_show' as any, checkedInAt: { gte: thirtyAgo } },
    });
    const noShowRate = totalRecent > 10 ? noShows / totalRecent : 0.12;

    // Layer 5: RACT
    const { ract, confidence } = this.getRact(doctorId);

    const BUFFER_SECS = 150; // 2.5 min buffer always added

    const waiting = await this.prisma.queueEntry.findMany({
      where: { doctorId, status: 'waiting' },
      orderBy: { position: 'asc' },
    });

    let cumulativeSecs = 0;
    const results: EtaResult[] = [];

    for (let i = 0; i < waiting.length; i++) {
      const entry = waiting[i];

      // No-show correction reduces cumulative time
      const nscBonus = i * noShowRate * layer3Secs;
      const formulaWait = Math.max(cumulativeSecs - nscBonus, 0);

      let waitSecs: number;
      if (ract !== null && i === 0) {
        // First patient: pure RACT-based (most accurate signal)
        const ractWeight = Math.min(0.8, 0.4 + (sessionTaps.get(doctorId)?.length ?? 0 - 3) * 0.08);
        waitSecs = ract * ractWeight + formulaWait * (1 - ractWeight);
      } else if (ract !== null) {
        const ractWeight = Math.min(0.8, 0.4 + (sessionTaps.get(doctorId)?.length ?? 0 - 3) * 0.08);
        const ractEstimate = ract * i;
        waitSecs = ractEstimate * ractWeight + formulaWait * (1 - ractWeight);
      } else {
        waitSecs = formulaWait;
      }

      waitSecs = Math.max(waitSecs + BUFFER_SECS, BUFFER_SECS);

      results.push({
        queueEntryId: entry.id,
        patientId: entry.patientId,
        positionAheadCount: i,
        estimatedWaitSeconds: Math.round(waitSecs),
        estimatedWaitMinutes: Math.round(waitSecs / 60),
        estimatedCallTime: new Date(Date.now() + waitSecs * 1000).toISOString(),
        confidence,
      });

      cumulativeSecs += layer3Secs;
    }

    return results;
  }

  async refreshAndBroadcast(doctorId: string) {
    const etas = await this.computeEtasForDoctor(doctorId);

    if (etas.length > 0) {
      await this.prisma.$transaction(
        etas.map(eta =>
          this.prisma.queueEntry.update({
            where: { id: eta.queueEntryId },
            data: { estimatedWaitMins: eta.estimatedWaitMinutes },
          }),
        ),
      );
    }

    this.eventsGateway.emitEtaUpdated({ doctorId, etas });
    return etas;
  }
}

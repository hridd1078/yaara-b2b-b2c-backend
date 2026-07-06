import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const hash = (pw: string) => bcrypt.hash(pw, 10);

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

async function main() {
  console.log('Seeding...');

  // ── Hospitals ──────────────────────────────────────────────────────────────
  const hospital1 = await prisma.hospital.upsert({
    where: { id: 'hospital-citycare' },
    update: {},
    create: {
      id: 'hospital-citycare',
      name: 'City Care Clinic',
      address: '12, MG Road, Mumbai',
      city: 'Mumbai',
      phone: '022-12345678',
      email: 'admin@citycare.in',
    },
  });

  const hospital2 = await prisma.hospital.upsert({
    where: { id: 'hospital-apollo' },
    update: {},
    create: {
      id: 'hospital-apollo',
      name: 'Apollo Plus',
      address: '5, Linking Road, Pune',
      city: 'Pune',
      phone: '020-98765432',
      email: 'admin@apolloplus.in',
    },
  });

  console.log('✓ Hospitals seeded');

  // ── Staff users ────────────────────────────────────────────────────────────
  const recep1 = await prisma.user.upsert({
    where: { email: 'receptionist@citycare.in' },
    update: {},
    create: { name: 'Meera Nair', email: 'receptionist@citycare.in', password: await hash('citycare123'), role: 'receptionist', hospitalId: hospital1.id },
  });

  const doc1 = await prisma.user.upsert({
    where: { email: 'sharma@citycare.in' },
    update: {},
    create: { name: 'Dr. Anjali Sharma', email: 'sharma@citycare.in', password: await hash('doctor123'), role: 'doctor', specialization: 'General Physician', hospitalId: hospital1.id },
  });

  const doc2 = await prisma.user.upsert({
    where: { email: 'mehta@citycare.in' },
    update: {},
    create: { name: 'Dr. Rohan Mehta', email: 'mehta@citycare.in', password: await hash('doctor123'), role: 'doctor', specialization: 'Cardiology', hospitalId: hospital1.id },
  });

  const doc3 = await prisma.user.upsert({
    where: { email: 'patel@citycare.in' },
    update: {},
    create: { name: 'Dr. Priya Patel', email: 'patel@citycare.in', password: await hash('doctor123'), role: 'doctor', specialization: 'Pediatrics', hospitalId: hospital1.id },
  });

  const recep2 = await prisma.user.upsert({
    where: { email: 'receptionist@apolloplus.in' },
    update: {},
    create: { name: 'Ritu Desai', email: 'receptionist@apolloplus.in', password: await hash('apollo123'), role: 'receptionist', hospitalId: hospital2.id },
  });

  const doc4 = await prisma.user.upsert({
    where: { email: 'joshi@apolloplus.in' },
    update: {},
    create: { name: 'Dr. Suresh Joshi', email: 'joshi@apolloplus.in', password: await hash('doctor123'), role: 'doctor', specialization: 'Orthopedics', hospitalId: hospital2.id },
  });

  console.log('✓ Staff users seeded');

  // ── Slots ──────────────────────────────────────────────────────────────────
  await prisma.doctorSlot.deleteMany({ where: { doctorId: { in: [doc1.id, doc2.id, doc3.id, doc4.id] } } });

  await prisma.doctorSlot.createMany({
    data: [
      { doctorId: doc1.id, label: 'Morning', startTime: '09:00', endTime: '13:00', days: ['MON','TUE','WED','THU','FRI','SAT'], maxTokens: 30 },
      { doctorId: doc1.id, label: 'Evening', startTime: '17:00', endTime: '20:00', days: ['MON','TUE','WED','THU','FRI'], maxTokens: 20 },
      { doctorId: doc2.id, label: 'Morning', startTime: '10:00', endTime: '14:00', days: ['MON','TUE','WED','THU','FRI'], maxTokens: 25 },
      { doctorId: doc3.id, label: 'Morning', startTime: '09:00', endTime: '13:00', days: ['MON','WED','FRI','SAT'], maxTokens: 25 },
      { doctorId: doc3.id, label: 'Evening', startTime: '16:00', endTime: '19:00', days: ['TUE','THU','SAT'], maxTokens: 20 },
      { doctorId: doc4.id, label: 'Morning', startTime: '09:00', endTime: '13:00', days: ['MON','TUE','WED','THU','FRI'], maxTokens: 30 },
    ],
  });

  console.log('✓ Slots seeded');

  // ── ETA profiles ───────────────────────────────────────────────────────────
  for (const doc of [doc1, doc2, doc3, doc4]) {
    const spec = doc.specialization ?? 'General Physician';
    const baseline = SPECIALIZATION_BASELINES[spec] ?? 600;
    await prisma.doctorEtaProfile.upsert({
      where: { doctorId: doc.id },
      update: {},
      create: { doctorId: doc.id, avgConsultationSecs: baseline, sampleCount: 0 },
    });
  }

  console.log('✓ ETA profiles seeded');

  // ── Demo app patient ───────────────────────────────────────────────────────
  await prisma.patient.upsert({
    where: { email: 'patient@demo.in' },
    update: {},
    create: {
      name: 'Demo Patient',
      email: 'patient@demo.in',
      contact: '9999999999',
      password: await hash('patient123'),
      isAppUser: true,
      bloodGroup: 'O+',
    },
  });

  console.log('✓ Demo patient seeded');
  console.log('\n── Credentials ──────────────────────────────');
  console.log('City Care Clinic:');
  console.log('  receptionist@citycare.in / citycare123');
  console.log('  sharma@citycare.in / doctor123');
  console.log('  mehta@citycare.in / doctor123');
  console.log('  patel@citycare.in / doctor123');
  console.log('Apollo Plus:');
  console.log('  receptionist@apolloplus.in / apollo123');
  console.log('  joshi@apolloplus.in / doctor123');
  console.log('Patient app:');
  console.log('  patient@demo.in / patient123');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

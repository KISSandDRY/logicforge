import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  PRESET_CIRCUITS,
  analyzeCircuitGraph,
  buildHalfAdderCustomIc,
} from '@logicforge/shared-types';
import { config, DEMO_USER_CONFIG } from '../src/config';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_USER_CONFIG.password, config.bcryptCost);

  const demoUser = await prisma.user.upsert({
    where: { email: DEMO_USER_CONFIG.email },
    update: {},
    create: {
      email: DEMO_USER_CONFIG.email,
      username: DEMO_USER_CONFIG.username,
      fullName: 'Студент Кафедри АСУ',
      passwordHash,
      role: DEMO_USER_CONFIG.role,
    },
  });

  for (const preset of PRESET_CIRCUITS) {
    const timing = analyzeCircuitGraph(preset.document);
    const existing = await prisma.circuit.findFirst({
      where: { title: preset.document.metadata.title, authorId: demoUser.id },
    });

    if (!existing) {
      const created = await prisma.circuit.create({
        data: {
          title: preset.document.metadata.title,
          description: preset.document.metadata.description,
          category: preset.document.metadata.category,
          isPublic: true,
          tags: preset.document.metadata.tags,
          schemaJson: JSON.parse(JSON.stringify(preset.document)),
          nodeCount: preset.document.nodes.length,
          edgeCount: preset.document.edges.length,
          criticalPathNs: timing.criticalPathDelayNs,
          maxClockMhz: timing.maxClockFrequencyMhz,
          authorId: demoUser.id,
        },
      });

      await prisma.circuitRevision.create({
        data: {
          circuitId: created.id,
          versionNumber: 1,
          commitMessage: 'Початкова еталонна реалізація схеми',
          schemaJson: JSON.parse(JSON.stringify(preset.document)),
          nodeCount: preset.document.nodes.length,
          edgeCount: preset.document.edges.length,
          createdById: demoUser.id,
        },
      });
    }
  }

  const halfAdderIc = buildHalfAdderCustomIc();

  const existingIc = await prisma.customComponent.findFirst({
    where: { code: 'HA_1BIT', authorId: demoUser.id },
  });
  if (!existingIc) {
    await prisma.customComponent.create({
      data: {
        name: halfAdderIc.name,
        code: halfAdderIc.code,
        description: halfAdderIc.description,
        propagationDelayNs: halfAdderIc.propagationDelayNs,
        definitionJson: JSON.parse(JSON.stringify(halfAdderIc)),
        isShared: true,
        authorId: demoUser.id,
      },
    });
  }

  console.log('Seed completed successfully.');
}

main()
  .catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

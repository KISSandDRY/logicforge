import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  PRESET_CIRCUITS,
  analyzeCircuitGraph,
  createNodeFromCatalog,
  type CustomICDefinition,
} from '@logicforge/shared-types';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash('DemoPass123!', 10);

  const demoUser = await prisma.user.upsert({
    where: { email: 'student@lpnu.ua' },
    update: {},
    create: {
      email: 'student@lpnu.ua',
      username: 'lpnu_engineer',
      fullName: 'Студент Кафедри АСУ',
      passwordHash,
      role: 'STUDENT',
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

  const halfA = createNodeFromCatalog('INPUT_SWITCH', 'ha_a', { x: 40, y: 40 }, 'A');
  const halfB = createNodeFromCatalog('INPUT_SWITCH', 'ha_b', { x: 40, y: 120 }, 'B');
  const halfXor = createNodeFromCatalog('XOR', 'ha_xor', { x: 200, y: 40 }, 'SUM_G');
  const halfAnd = createNodeFromCatalog('AND', 'ha_and', { x: 200, y: 120 }, 'CARRY_G');
  const halfOutS = createNodeFromCatalog('PROBE', 'ha_s', { x: 380, y: 45 }, 'S');
  const halfOutC = createNodeFromCatalog('PROBE', 'ha_c', { x: 380, y: 125 }, 'C');

  const halfAdderIc: CustomICDefinition = {
    id: 'ic-half-adder',
    name: 'Напівсуматор (Half Adder IC)',
    code: 'HA_1BIT',
    description: 'Інкапсульована ІМС однорозрядного напівсуматора (S = A XOR B, C = A AND B).',
    propagationDelayNs: 14,
    inputPins: [
      { id: 'A', name: 'A', mappedNodeId: 'ha_a' },
      { id: 'B', name: 'B', mappedNodeId: 'ha_b' },
    ],
    outputPins: [
      { id: 'S', name: 'S', mappedNodeId: 'ha_s' },
      { id: 'C', name: 'C', mappedNodeId: 'ha_c' },
    ],
    internalCircuit: {
      nodes: [halfA, halfB, halfXor, halfAnd, halfOutS, halfOutC],
      edges: [
        {
          id: 'h1',
          sourceNodeId: 'ha_a',
          sourcePinId: 'OUT',
          targetNodeId: 'ha_xor',
          targetPinId: 'A',
          signalState: '0',
        },
        {
          id: 'h2',
          sourceNodeId: 'ha_b',
          sourcePinId: 'OUT',
          targetNodeId: 'ha_xor',
          targetPinId: 'B',
          signalState: '0',
        },
        {
          id: 'h3',
          sourceNodeId: 'ha_a',
          sourcePinId: 'OUT',
          targetNodeId: 'ha_and',
          targetPinId: 'A',
          signalState: '0',
        },
        {
          id: 'h4',
          sourceNodeId: 'ha_b',
          sourcePinId: 'OUT',
          targetNodeId: 'ha_and',
          targetPinId: 'B',
          signalState: '0',
        },
        {
          id: 'h5',
          sourceNodeId: 'ha_xor',
          sourcePinId: 'Y',
          targetNodeId: 'ha_s',
          targetPinId: 'IN',
          signalState: '0',
        },
        {
          id: 'h6',
          sourceNodeId: 'ha_and',
          sourcePinId: 'Y',
          targetNodeId: 'ha_c',
          targetPinId: 'IN',
          signalState: '0',
        },
      ],
    },
  };

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

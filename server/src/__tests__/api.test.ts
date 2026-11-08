import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildFullAdderPreset, buildTriStateBusPreset } from '@logicforge/shared-types';
import { createApp } from '../app';
import { initializeRepository } from '../repositories';

describe('LogicForge REST API Integration Tests (Supertest)', () => {
  const app = createApp();
  let authToken = '';
  let createdCircuitId = '';

  beforeAll(async () => {
    await initializeRepository();
  });

  it('GET /api/health returns service status and storage driver', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toContain('LogicForge');
  });

  it('registers a new user, logs in, and validates /api/auth/me', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'ivan.petrenko@lpnu.ua',
      username: 'ivan_kn',
      fullName: 'Іван Петренко',
      password: 'SecurePassword123',
    });

    expect(reg.status).toBe(201);
    expect(reg.body.token).toBeDefined();
    expect(reg.body.user.email).toBe('ivan.petrenko@lpnu.ua');

    const login = await request(app).post('/api/auth/login').send({
      email: 'ivan.petrenko@lpnu.ua',
      password: 'SecurePassword123',
    });
    expect(login.status).toBe(200);
    authToken = login.body.token;

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${authToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe('ivan_kn');
  });

  it('lists seeded circuits, creates a circuit, updates revisions, and restores v1', async () => {
    const listRes = await request(app).get('/api/circuits');
    expect(listRes.status).toBe(200);
    expect(listRes.body.circuits.length).toBeGreaterThanOrEqual(6);

    const adderDoc = buildFullAdderPreset();
    const createRes = await request(app)
      .post('/api/circuits')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Тестовий повний суматор КР',
        description: 'Перевірка збереження та історії ревізій',
        category: 'Комбінаційні схеми',
        isPublic: true,
        tags: ['test', 'adder'],
        commitMessage: 'Ревізія 1: Базова схема',
        schemaJson: adderDoc,
      });

    expect(createRes.status).toBe(201);
    createdCircuitId = createRes.body.circuit.id;
    expect(createRes.body.circuit.criticalPathNs).toBe(37);

    // Update circuit -> creates revision #2
    const modifiedDoc = {
      ...adderDoc,
      nodes: adderDoc.nodes.map((n) =>
        n.id === 'n_sw_cin'
          ? { ...n, properties: { ...n.properties, switchState: '1' as const } }
          : n,
      ),
    };

    const updateRes = await request(app)
      .put(`/api/circuits/${createdCircuitId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Тестовий повний суматор КР (Оновлено)',
        description: 'Друга версія схеми',
        category: 'Комбінаційні схеми',
        isPublic: true,
        tags: ['test', 'adder', 'v2'],
        commitMessage: 'Ревізія 2: Змінено вхід переносу Cin=1',
        schemaJson: modifiedDoc,
      });
    expect(updateRes.status).toBe(200);

    const revsRes = await request(app).get(`/api/circuits/${createdCircuitId}/revisions`);
    expect(revsRes.status).toBe(200);
    expect(revsRes.body.revisions).toHaveLength(2);

    // Restore revision #1 -> creates revision #3
    const restoreRes = await request(app)
      .post(`/api/circuits/${createdCircuitId}/revisions/1/restore`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(restoreRes.status).toBe(200);

    const revsAfter = await request(app).get(`/api/circuits/${createdCircuitId}/revisions`);
    expect(revsAfter.body.revisions).toHaveLength(3);
  });

  it('executes server-side discrete-event simulation, truth-table synthesis, and engineering report', async () => {
    const busDoc = buildTriStateBusPreset();
    const simRes = await request(app)
      .post('/api/simulate/run')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        circuitId: createdCircuitId,
        document: busDoc,
        durationNs: 150,
      });

    expect(simRes.status).toBe(200);
    expect(simRes.body.snapshot.status).toBe('STABLE');
    expect(simRes.body.timing.isCombinationalAcyclic).toBe(true);

    const ttRes = await request(app).post('/api/simulate/truth-table').send({
      document: buildFullAdderPreset(),
      maxTruthTableInputs: 4,
    });
    expect(ttRes.status).toBe(200);
    expect(ttRes.body.truthTable.rows).toHaveLength(8);

    const reportRes = await request(app).get(`/api/circuits/${createdCircuitId}/report`);
    expect(reportRes.status).toBe(200);
    expect(reportRes.body.report.bom.length).toBeGreaterThan(0);
    expect(reportRes.body.runs.length).toBeGreaterThanOrEqual(1);
  });

  it('returns component catalog and manages custom IC subcircuits', async () => {
    const catRes = await request(app).get('/api/components/catalog');
    expect(catRes.status).toBe(200);
    expect(catRes.body.components.length).toBeGreaterThanOrEqual(20);

    const customList = await request(app).get('/api/components/custom');
    expect(customList.status).toBe(200);
    expect(customList.body.customComponents.length).toBeGreaterThanOrEqual(1);
  });
});

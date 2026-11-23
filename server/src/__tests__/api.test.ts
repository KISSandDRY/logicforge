import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildAddressDecoderComparatorPreset,
  buildFullAdderPreset,
  buildTriStateBusPreset,
} from '@logicforge/shared-types';
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
    expect(catRes.body.components).toHaveLength(38);
    expect(
      catRes.body.components.some((item: { type: string }) => item.type === 'FULL_ADDER'),
    ).toBe(true);
    expect(
      catRes.body.components.some((item: { type: string }) => item.type === 'PARITY_4BIT'),
    ).toBe(true);

    const customList = await request(app).get('/api/components/custom');
    expect(customList.status).toBe(200);
    expect(customList.body.customComponents.length).toBeGreaterThanOrEqual(1);

    // Create, update (edit), and delete a user Custom IC via REST API
    const haSeed = customList.body.customComponents[0];
    const createIcRes = await request(app)
      .post('/api/components/custom')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Користувацький напівсуматор Тест',
        code: 'HA_USR',
        description: 'Початковий опис ІМС',
        propagationDelayNs: 18,
        isShared: true,
        inputPins: haSeed.inputPins,
        outputPins: haSeed.outputPins,
        internalCircuit: haSeed.internalCircuit,
      });
    expect(createIcRes.status).toBe(201);
    const newIcId = createIcRes.body.customComponent.id as string;

    const editIcRes = await request(app)
      .put(`/api/components/custom/${newIcId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Оновлений напівсуматор v2',
        code: 'HA_V2',
        description: 'Оновлений опис після редагування',
        propagationDelayNs: 12,
      });
    expect(editIcRes.status).toBe(200);
    expect(editIcRes.body.customComponent.name).toBe('Оновлений напівсуматор v2');
    expect(editIcRes.body.customComponent.code).toBe('HA_V2');
    expect(editIcRes.body.customComponent.propagationDelayNs).toBe(12);

    const delIcRes = await request(app)
      .delete(`/api/components/custom/${newIcId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(delIcRes.status).toBe(200);

    // Validate saving and simulating circuit with new DIP_SWITCH_4, DECODER_2TO4, and COMPARATOR_2BIT components
    const decDoc = buildAddressDecoderComparatorPreset();
    const saveDecRes = await request(app)
      .post('/api/circuits')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: decDoc.metadata.title,
        description: decDoc.metadata.description,
        category: decDoc.metadata.category,
        isPublic: true,
        tags: decDoc.metadata.tags,
        commitMessage: 'Ревізія 1: Дешифратор та компаратор',
        schemaJson: decDoc,
      });
    expect(saveDecRes.status).toBe(201);
  });

  it('enforces security headers, CORS allowlist, input validation, HttpOnly cookies, rate limiting, and cross-user IDOR isolation', async () => {
    // 1. Security headers + health + disallowed CORS origin blocking
    const healthRes = await request(app).get('/api/health');
    expect(healthRes.headers['x-content-type-options']).toBe('nosniff');
    expect(healthRes.headers['x-frame-options']).toBe('DENY');
    expect(healthRes.headers['content-security-policy']).toBeDefined();
    expect(healthRes.headers['referrer-policy']).toBeDefined();

    const badCorsRes = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example.com');
    expect(badCorsRes.status).toBe(403);
    expect(badCorsRes.headers['access-control-allow-origin']).toBeUndefined();

    // 2. Malformed inputs & unauthenticated gates
    const unauthMe = await request(app).get('/api/auth/me');
    expect(unauthMe.status).toBe(401);

    const badIdRes = await request(app).get('/api/circuits/bad..id$space');
    expect(badIdRes.status).toBe(400);

    const malformedJsonRes = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(malformedJsonRes.status).toBe(400);

    const badRegRes = await request(app).post('/api/auth/register').send({
      email: 'not-an-email',
      username: 'x',
      fullName: 'A',
      password: '123',
    });
    expect(badRegRes.status).toBe(400);

    // 3. HttpOnly + SameSite=Strict cookie session & no passwordHash leakage
    const loginCookieRes = await request(app).post('/api/auth/login').send({
      email: 'ivan.petrenko@lpnu.ua',
      password: 'SecurePassword123',
    });
    expect(loginCookieRes.status).toBe(200);
    expect(loginCookieRes.body.user.passwordHash).toBeUndefined();
    const cookies = loginCookieRes.headers['set-cookie'] as unknown as string[] | undefined;
    expect(cookies && cookies.length > 0).toBe(true);
    expect(cookies![0]).toContain('HttpOnly');
    expect(cookies![0]).toContain('SameSite=Strict');

    const cookieMeRes = await request(app).get('/api/auth/me').set('Cookie', cookies!);
    expect(cookieMeRes.status).toBe(200);
    expect(cookieMeRes.body.user.passwordHash).toBeUndefined();

    const logoutRes = await request(app).post('/api/auth/logout');
    expect(logoutRes.status).toBe(200);

    // 4. Cross-user IDOR isolation across circuits, revisions, reports, simulation runs & custom ICs
    const ownerDoc = buildFullAdderPreset();
    const privCircuitRes = await request(app)
      .post('/api/circuits')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Приватна закрита схема Івана',
        description: 'Секретна архітектура АЛП',
        category: 'Комбінаційні схеми',
        isPublic: false,
        tags: ['private'],
        schemaJson: ownerDoc,
      });
    expect(privCircuitRes.status).toBe(201);
    const privId = privCircuitRes.body.circuit.id as string;

    const privIcRes = await request(app)
      .post('/api/components/custom')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Приватна ІМС Івана',
        code: 'PRIV_IC',
        description: 'Закритий компонент',
        propagationDelayNs: 15,
        isShared: false,
        inputPins: [{ id: 'A', name: 'A', mappedNodeId: 'n_sw_a' }],
        outputPins: [{ id: 'Y', name: 'Y', mappedNodeId: 'n_led_sum' }],
        internalCircuit: { nodes: [], edges: [] },
      });
    expect(privIcRes.status).toBe(201);
    const privIcId = privIcRes.body.customComponent.id as string;

    // Second user (Attacker / User B) registers
    const userBReg = await request(app).post('/api/auth/register').send({
      email: 'attacker@lpnu.ua',
      username: 'user_b',
      fullName: 'Користувач Б',
      password: 'OtherPassword123',
    });
    expect(userBReg.status).toBe(201);
    const tokenB = userBReg.body.token as string;

    // User B MUST be blocked on every IDOR vector
    expect(
      (await request(app).get(`/api/circuits/${privId}`).set('Authorization', `Bearer ${tokenB}`))
        .status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .put(`/api/circuits/${privId}`)
          .set('Authorization', `Bearer ${tokenB}`)
          .send({
            title: 'Перезаписано IDOR',
            description: 'hack',
            category: 'Комбінаційні схеми',
            isPublic: true,
            tags: [],
            schemaJson: ownerDoc,
          })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .put(`/api/circuits/${createdCircuitId}`)
          .set('Authorization', `Bearer ${tokenB}`)
          .send({
            title: 'Чужа публічна схема',
            description: 'idor edit',
            category: 'Комбінаційні схеми',
            isPublic: true,
            tags: [],
            schemaJson: ownerDoc,
          })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/circuits/${privId}/fork`)
          .set('Authorization', `Bearer ${tokenB}`)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .delete(`/api/circuits/${privId}`)
          .set('Authorization', `Bearer ${tokenB}`)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get(`/api/circuits/${privId}/revisions`)
          .set('Authorization', `Bearer ${tokenB}`)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/circuits/${privId}/revisions/1/restore`)
          .set('Authorization', `Bearer ${tokenB}`)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get(`/api/circuits/${privId}/report`)
          .set('Authorization', `Bearer ${tokenB}`)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/simulate/run')
          .set('Authorization', `Bearer ${tokenB}`)
          .send({ circuitId: privId, document: ownerDoc, durationNs: 100 })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .put(`/api/components/custom/${privIcId}`)
          .set('Authorization', `Bearer ${tokenB}`)
          .send({ name: 'Зламано ІМС' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete(`/api/components/custom/${privIcId}`)
          .set('Authorization', `Bearer ${tokenB}`)
      ).status,
    ).toBe(404);

    // 5. Rate limiting on /api/auth/login
    const strictApp = createApp({ authRateLimitMax: 2 });
    await request(strictApp).post('/api/auth/login').send({ email: 'a@b.ua', password: '123' });
    await request(strictApp).post('/api/auth/login').send({ email: 'a@b.ua', password: '123' });
    const throttled = await request(strictApp)
      .post('/api/auth/login')
      .send({ email: 'a@b.ua', password: '123' });
    expect(throttled.status).toBe(429);

    // 6. Auth cache headers, unknown-email timing defense, fail-closed ?mine=true,
    // simulation run ownership guard, and owner deletion lifecycle
    expect(loginCookieRes.headers['cache-control']).toBe('no-store');
    expect(cookieMeRes.headers['cache-control']).toBe('no-store');

    const unknownLogin = await request(app).post('/api/auth/login').send({
      email: 'nobody-here@lpnu.ua',
      password: 'WrongPassword123',
    });
    expect(unknownLogin.status).toBe(401);

    const mineUnauth = await request(app).get('/api/circuits?mine=true');
    expect(mineUnauth.status).toBe(200);
    expect(mineUnauth.body.circuits).toEqual([]);

    const reportBeforeRun = await request(app).get(`/api/circuits/${createdCircuitId}/report`);
    const initialRunCount = reportBeforeRun.body.runs.length as number;

    const foreignSimRun = await request(app)
      .post('/api/simulate/run')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ circuitId: createdCircuitId, document: ownerDoc, durationNs: 100 });
    expect(foreignSimRun.status).toBe(200);

    const reportAfterRun = await request(app).get(`/api/circuits/${createdCircuitId}/report`);
    expect(reportAfterRun.body.runs).toHaveLength(initialRunCount);

    const invalidSim = await request(app).post('/api/simulate/run').send({ durationNs: 100 });
    expect(invalidSim.status).toBe(400);

    const badRevRestore = await request(app)
      .post(`/api/circuits/${privId}/revisions/0/restore`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(badRevRestore.status).toBe(400);

    const ownerDelRes = await request(app)
      .delete(`/api/circuits/${privId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(ownerDelRes.status).toBe(200);
    expect(ownerDelRes.body.deleted).toBe(true);

    const afterDelGet = await request(app)
      .get(`/api/circuits/${privId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(afterDelGet.status).toBe(404);
  });
});

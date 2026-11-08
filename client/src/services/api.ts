import type {
  AuthResponseDTO,
  CircuitDetailDTO,
  CircuitDocument,
  CircuitRevisionDTO,
  CircuitSummaryDTO,
  CustomICDefinition,
  EngineeringReport,
  PresetCircuitTemplate,
  TruthTableResult,
  UserDTO,
} from '@logicforge/shared-types';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api';
const TOKEN_KEY = 'logicforge_jwt_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errMsg = typeof payload.error === 'string' ? payload.error : `HTTP Error ${res.status}`;
    throw new Error(errMsg);
  }
  return payload as T;
}

export const api = {
  health: () => apiRequest<{ status: string; storageDriver: string; timestamp: string }>('/health'),

  register: (data: { email: string; username: string; fullName: string; password: string }) =>
    apiRequest<AuthResponseDTO>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    apiRequest<AuthResponseDTO>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  demoLogin: () =>
    apiRequest<AuthResponseDTO>('/auth/demo', {
      method: 'POST',
    }),

  me: () => apiRequest<{ user: UserDTO }>('/auth/me'),

  listPresets: () => apiRequest<{ presets: PresetCircuitTemplate[] }>('/circuits/presets'),

  listCircuits: (params?: { search?: string; category?: string; mine?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.category) query.set('category', params.category);
    if (params?.mine) query.set('mine', 'true');
    const qs = query.toString();
    return apiRequest<{ circuits: CircuitSummaryDTO[] }>(`/circuits${qs ? `?${qs}` : ''}`);
  },

  getCircuit: (id: string) => apiRequest<{ circuit: CircuitDetailDTO }>(`/circuits/${id}`),

  createCircuit: (data: {
    title: string;
    description: string;
    category: string;
    isPublic: boolean;
    tags: string[];
    commitMessage?: string;
    schemaJson: CircuitDocument;
  }) =>
    apiRequest<{ circuit: CircuitDetailDTO }>('/circuits', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCircuit: (
    id: string,
    data: {
      title: string;
      description: string;
      category: string;
      isPublic: boolean;
      tags: string[];
      commitMessage?: string;
      schemaJson: CircuitDocument;
    },
  ) =>
    apiRequest<{ circuit: CircuitDetailDTO }>(`/circuits/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  forkCircuit: (id: string) =>
    apiRequest<{ circuit: CircuitDetailDTO }>(`/circuits/${id}/fork`, {
      method: 'POST',
    }),

  deleteCircuit: (id: string) =>
    apiRequest<{ deleted: boolean }>(`/circuits/${id}`, {
      method: 'DELETE',
    }),

  listRevisions: (circuitId: string) =>
    apiRequest<{ revisions: CircuitRevisionDTO[] }>(`/circuits/${circuitId}/revisions`),

  restoreRevision: (circuitId: string, versionNumber: number) =>
    apiRequest<{ circuit: CircuitDetailDTO }>(
      `/circuits/${circuitId}/revisions/${versionNumber}/restore`,
      { method: 'POST' },
    ),

  getCircuitReport: (circuitId: string) =>
    apiRequest<{
      circuit: CircuitDetailDTO;
      report: EngineeringReport;
      runs: Array<{
        id: string;
        durationSimNs: number;
        processedEvents: number;
        criticalPathNs: number;
        status: string;
        createdAt: string;
      }>;
    }>(`/circuits/${circuitId}/report`),

  listCustomComponents: () =>
    apiRequest<{ customComponents: CustomICDefinition[] }>('/components/custom'),

  createCustomComponent: (data: Omit<CustomICDefinition, 'id'> & { isShared?: boolean }) =>
    apiRequest<{ customComponent: CustomICDefinition }>('/components/custom', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteCustomComponent: (id: string) =>
    apiRequest<{ deleted: boolean }>(`/components/custom/${id}`, {
      method: 'DELETE',
    }),

  synthesizeTruthTable: (document: CircuitDocument, maxTruthTableInputs = 5) =>
    apiRequest<{ truthTable: TruthTableResult }>('/simulate/truth-table', {
      method: 'POST',
      body: JSON.stringify({ document, maxTruthTableInputs }),
    }),
};

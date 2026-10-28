import type {
  BOARD_PHRASES,
  ChildProfile,
  DraftFromDemoRequest,
  DraftFromTextRequest,
  DraftResponse,
  FindObjectResponse,
  FrameCheckResponse,
  Mission,
  MissionInput,
  Notification,
  ProgressResponse,
  TranscribeResponse,
  Zone,
} from '@bhavya/shared';

/** An error from the home hub with a message that is safe to show. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach the home hub. Check that it is running.', 0);
  }
  if (response.status === 204) return undefined as T;

  const data = (await response.json().catch(() => null)) as {
    error?: string;
    details?: string[];
  } | null;
  if (!response.ok) {
    throw new ApiError(
      data?.error ?? `Request failed (${response.status}).`,
      response.status,
      data?.details ?? [],
    );
  }
  return data as T;
}

export interface Settings {
  profile: ChildProfile;
  zones: Zone[];
}

export interface BoardResponse {
  phrases: typeof BOARD_PHRASES;
  icons: Record<string, string>;
}

const missionPath = (id: string) => `/api/missions/${encodeURIComponent(id)}`;
const stepCardPath = (id: string, stepId: string) =>
  `${missionPath(id)}/steps/${encodeURIComponent(stepId)}/card`;
const runPath = (runId: string) => `/api/runs/${encodeURIComponent(runId)}`;

export const api = {
  missions: () => request<Mission[]>('GET', '/api/missions'),
  mission: (id: string) => request<Mission>('GET', missionPath(id)),
  draftFromText: (body: DraftFromTextRequest) =>
    request<DraftResponse>('POST', '/api/missions/draft/text', body),
  draftFromDemo: (body: DraftFromDemoRequest) =>
    request<DraftResponse>('POST', '/api/missions/draft/demo', body),
  updateMission: (id: string, input: MissionInput) =>
    request<Mission>('PUT', missionPath(id), input),
  approveMission: (id: string) => request<Mission>('POST', `${missionPath(id)}/approve`),
  deleteMission: (id: string) => request<void>('DELETE', missionPath(id)),
  makeCard: (id: string, stepId: string) => request<Mission>('POST', stepCardPath(id, stepId)),
  uploadCard: (id: string, stepId: string, image: string) =>
    request<Mission>('PUT', stepCardPath(id, stepId), { image }),

  settings: () => request<Settings>('GET', '/api/settings'),
  saveProfile: (profile: ChildProfile) =>
    request<ChildProfile>('PUT', '/api/settings/profile', profile),
  saveZones: (zones: Zone[]) => request<Zone[]>('PUT', '/api/settings/zones', zones),
  board: () => request<BoardResponse>('GET', '/api/board'),
  makeBoardIcon: (phraseId: string) =>
    request<{ icons: Record<string, string> }>(
      'POST',
      `/api/board/${encodeURIComponent(phraseId)}/icon`,
    ),

  progress: () => request<ProgressResponse>('GET', '/api/progress'),
  notifications: () => request<Notification[]>('GET', '/api/notifications'),

  checkFrame: (runId: string, stepIndex: number, image: string) =>
    request<FrameCheckResponse>('POST', `${runPath(runId)}/frame`, { stepIndex, image }),
  findInRun: (runId: string, stepIndex: number, image: string) =>
    request<FindObjectResponse>('POST', `${runPath(runId)}/find`, { stepIndex, image }),
  findObject: (object: string, image: string) =>
    request<FindObjectResponse>('POST', '/api/vision/find', { object, image }),
  transcribe: (audio: string) =>
    request<TranscribeResponse>('POST', '/api/voice/transcribe', { audio }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

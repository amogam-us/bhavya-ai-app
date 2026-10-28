import type {
  DraftResponse,
  Mission,
  MissionInput,
  MissionSource,
  Step,
  Zone,
} from '@bhavya/shared';
import type { Repositories } from '../db/repositories';
import { HttpError } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';
import {
  decodeImageDataUrl,
  deleteCardFolder,
  deleteCardImage,
  saveCardImage,
} from '../lib/images';
import { cardPrompt } from '../muse/prompts';
import type { MuseService } from '../muse/service';
import { normalizeDraft } from './drafts';
import { missionProblems } from './rules';

export interface MissionServiceDeps {
  repos: Repositories;
  muse: MuseService;
  cardsDir: string;
}

export class MissionService {
  constructor(private readonly deps: MissionServiceDeps) {}

  list(): Mission[] {
    return this.deps.repos.missions.list();
  }

  get(id: string): Mission {
    const mission = this.deps.repos.missions.get(id);
    if (!mission) throw HttpError.notFound('Routine not found.');
    return mission;
  }

  async draftFromText(params: {
    zone: string;
    instructions: string;
    title?: string;
    source: 'text' | 'voice';
  }): Promise<DraftResponse> {
    const zone = this.requireZone(params.zone);
    const draft = await this.deps.muse.draftMission({
      profile: this.deps.repos.settings.getProfile(),
      zone,
      instructions: params.instructions,
    });
    return this.saveDraft(draft, zone, params.source, params.title);
  }

  async draftFromDemo(params: {
    zone: string;
    frames: string[];
    narration?: string;
    title?: string;
  }): Promise<DraftResponse> {
    const zone = this.requireZone(params.zone);
    if (zone.type === 'private') {
      throw HttpError.badRequest(
        `The ${zone.name} is private, so it cannot be taught with video. Use instructions instead.`,
      );
    }
    const draft = await this.deps.muse.draftMission({
      profile: this.deps.repos.settings.getProfile(),
      zone,
      frames: params.frames,
      narration: params.narration,
    });
    return this.saveDraft(draft, zone, 'demo', params.title);
  }

  /** Saves edits. Any edit sends the routine back to draft until the parent approves it again. */
  update(id: string, input: MissionInput): Mission {
    const existing = this.get(id);
    this.assertValid(input, id);
    const mission: Mission = { ...existing, ...input, status: 'draft', updatedAt: nowIso() };
    this.deps.repos.missions.update(mission);
    return mission;
  }

  approve(id: string): Mission {
    const existing = this.get(id);
    this.assertValid(existing, id);
    const mission: Mission = { ...existing, status: 'approved', updatedAt: nowIso() };
    this.deps.repos.missions.update(mission);
    return mission;
  }

  async delete(id: string): Promise<void> {
    if (!this.deps.repos.missions.delete(id)) throw HttpError.notFound('Routine not found.');
    await deleteCardFolder(this.deps.cardsDir, id);
  }

  /** Makes a picture card for one step with Muse Image. */
  async generateCard(id: string, stepId: string): Promise<Mission> {
    const step = this.findStep(this.get(id), stepId);
    const image = await this.deps.muse.makePicture(cardPrompt(step));
    const url = await saveCardImage(this.deps.cardsDir, id, image, 'png');
    return this.replaceCard(id, stepId, url);
  }

  /** Stores a card uploaded by the parent, such as a photo of the child's own object. */
  async uploadCard(id: string, stepId: string, dataUrl: string): Promise<Mission> {
    this.findStep(this.get(id), stepId);
    const { buffer, ext } = decodeImageDataUrl(dataUrl);
    const url = await saveCardImage(this.deps.cardsDir, id, buffer, ext);
    return this.replaceCard(id, stepId, url);
  }

  private async replaceCard(id: string, stepId: string, url: string): Promise<Mission> {
    // Re-read: the mission may have changed while the image was generated.
    const mission = this.deps.repos.missions.get(id);
    const step = mission?.steps.find((s) => s.id === stepId);
    if (!mission || !step) {
      await deleteCardImage(this.deps.cardsDir, url);
      throw HttpError.notFound('The routine or step was removed.');
    }
    const previous = step.card;
    const updated: Mission = {
      ...mission,
      steps: mission.steps.map((s) => (s.id === stepId ? { ...s, card: url } : s)),
      updatedAt: nowIso(),
    };
    this.deps.repos.missions.update(updated);
    await deleteCardImage(this.deps.cardsDir, previous);
    return updated;
  }

  private saveDraft(
    draft: Parameters<typeof normalizeDraft>[0],
    zone: Zone,
    source: MissionSource,
    title?: string,
  ): DraftResponse {
    const autoStart = zone.type === 'private' && !this.hasAutoStartMission(zone.id);
    const { input, keyFrames } = normalizeDraft(draft, { zone, title, autoStart });
    const now = nowIso();
    const mission: Mission = {
      ...input,
      id: newId(),
      status: 'draft',
      source,
      createdAt: now,
      updatedAt: now,
    };
    this.deps.repos.missions.insert(mission);
    return { mission, keyFrames };
  }

  private hasAutoStartMission(zoneId: string): boolean {
    return this.deps.repos.missions
      .list()
      .some((m) => m.status === 'approved' && m.trigger === 'zone_enter' && m.zone === zoneId);
  }

  private assertValid(input: MissionInput, missionId: string): void {
    const problems = missionProblems(input, {
      zones: this.deps.repos.settings.getZones(),
      missions: this.deps.repos.missions.list(),
      missionId,
    });
    if (problems.length > 0) throw HttpError.badRequest('This routine needs changes.', problems);
  }

  private requireZone(zoneId: string): Zone {
    const zone = this.deps.repos.settings.getZones().find((z) => z.id === zoneId);
    if (!zone) throw HttpError.badRequest('Choose a room that exists.');
    return zone;
  }

  private findStep(mission: Mission, stepId: string): Step {
    const step = mission.steps.find((s) => s.id === stepId);
    if (!step) throw HttpError.notFound('Step not found.');
    return step;
  }
}

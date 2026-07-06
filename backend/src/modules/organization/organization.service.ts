import { OrganizationRepository } from './organization.repository';
import { IOrganization } from './organization.model';
import { NotFoundError } from '../../shared/errors';

export class OrganizationService {
  constructor(private orgRepository: OrganizationRepository) {}

  async getOrganization(tenantId: string): Promise<IOrganization> {
    const org = await this.orgRepository.findById(tenantId);
    if (!org) throw new NotFoundError('Organization not found');
    return org;
  }

  async updateSettings(
    tenantId: string,
    settings: { defaultCurrency?: string }
  ): Promise<IOrganization> {
    const org = await this.orgRepository.findById(tenantId);
    if (!org) throw new NotFoundError('Organization not found');

    const updated = await this.orgRepository.updateSettings(tenantId, {
      ...org.settings,
      ...settings,
    });
    if (!updated) throw new NotFoundError('Organization not found');
    return updated;
  }
}

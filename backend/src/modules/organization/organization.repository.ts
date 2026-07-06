import { Organization, IOrganization } from './organization.model';
import { Types } from 'mongoose';

export class OrganizationRepository {
  async findById(id: string | Types.ObjectId): Promise<IOrganization | null> {
    return Organization.findById(id).exec();
  }

  async findBySlug(slug: string): Promise<IOrganization | null> {
    return Organization.findOne({ slug }).exec();
  }

  async updateSettings(
    id: string | Types.ObjectId,
    settings: Partial<IOrganization['settings']>
  ): Promise<IOrganization | null> {
    return Organization.findByIdAndUpdate(
      id,
      { $set: { settings } },
      { new: true, runValidators: true }
    ).exec();
  }

  async create(data: { name: string; slug: string; settings?: { defaultCurrency: string } }): Promise<IOrganization> {
    const org = new Organization(data);
    return org.save();
  }
}

import mongoose, { Document, Schema } from 'mongoose';

export interface IOrganizationSettings {
  defaultCurrency: string;
}

export interface IOrganization extends Document {
  name: string;
  slug: string;
  settings: IOrganizationSettings;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSettingsSchema = new Schema<IOrganizationSettings>(
  {
    defaultCurrency: { type: String, default: 'USD' },
  },
  { _id: false }
);

const OrganizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    settings: { type: OrganizationSettingsSchema, default: () => ({ defaultCurrency: 'USD' }) },
  },
  { timestamps: true }
);

export const Organization = mongoose.model<IOrganization>('Organization', OrganizationSchema);

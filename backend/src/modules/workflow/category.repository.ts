import { ExpenseCategory, IExpenseCategory } from './expense-category.model';
import { Types } from 'mongoose';

export class CategoryRepository {
  async findById(
    id: string | Types.ObjectId,
    tenantId: string | Types.ObjectId
  ): Promise<IExpenseCategory | null> {
    return ExpenseCategory.findOne({ _id: id, tenantId }).exec();
  }

  async findByTenant(
    tenantId: string | Types.ObjectId,
    page = 1,
    limit = 200,
    isActive?: boolean
  ): Promise<{ categories: IExpenseCategory[]; total: number }> {
    const query: Record<string, unknown> = { tenantId };
    if (isActive !== undefined) query.isActive = isActive;
    const skip = (page - 1) * limit;
    const [categories, total] = await Promise.all([
      ExpenseCategory.find(query).skip(skip).limit(limit).exec(),
      ExpenseCategory.countDocuments(query).exec(),
    ]);
    return { categories, total };
  }

  async create(data: Partial<IExpenseCategory>): Promise<IExpenseCategory> {
    const category = new ExpenseCategory(data);
    return category.save();
  }

  async update(
    id: string | Types.ObjectId,
    tenantId: string | Types.ObjectId,
    data: Partial<IExpenseCategory>
  ): Promise<IExpenseCategory | null> {
    return ExpenseCategory.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: data },
      { new: true, runValidators: true }
    ).exec();
  }

  async setActive(
    id: string | Types.ObjectId,
    tenantId: string | Types.ObjectId,
    isActive: boolean
  ): Promise<IExpenseCategory | null> {
    return ExpenseCategory.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: { isActive } },
      { new: true }
    ).exec();
  }
}

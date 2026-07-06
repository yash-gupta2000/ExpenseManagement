import { CategoryRepository } from './category.repository';
import { IExpenseCategory } from './expense-category.model';
import { NotFoundError } from '../../shared/errors';
import { CreateCategoryInput, UpdateCategoryInput } from './workflow.validators';

export class WorkflowService {
  constructor(private categoryRepository: CategoryRepository) {}

  async createCategory(
    tenantId: string,
    input: CreateCategoryInput
  ): Promise<IExpenseCategory> {
    return this.categoryRepository.create({
      tenantId: tenantId as unknown as IExpenseCategory['tenantId'],
      name: input.name,
      amountThreshold: input.amountThreshold,
      cfoId: input.cfoId ? (input.cfoId as unknown as IExpenseCategory['cfoId']) : null,
      isActive: true,
    });
  }

  async listCategories(
    tenantId: string,
    page: number,
    limit: number,
    isActive?: boolean
  ): Promise<{ categories: IExpenseCategory[]; total: number }> {
    return this.categoryRepository.findByTenant(tenantId, page, limit, isActive);
  }

  async getCategoryById(
    tenantId: string,
    categoryId: string
  ): Promise<IExpenseCategory> {
    const cat = await this.categoryRepository.findById(categoryId, tenantId);
    if (!cat) throw new NotFoundError('Category not found');
    return cat;
  }

  async updateCategory(
    tenantId: string,
    categoryId: string,
    input: UpdateCategoryInput
  ): Promise<IExpenseCategory> {
    const cat = await this.categoryRepository.findById(categoryId, tenantId);
    if (!cat) throw new NotFoundError('Category not found');

    const updated = await this.categoryRepository.update(categoryId, tenantId, input as Partial<IExpenseCategory>);
    if (!updated) throw new NotFoundError('Category not found');
    return updated;
  }

  async activateCategory(
    tenantId: string,
    categoryId: string
  ): Promise<IExpenseCategory> {
    const cat = await this.categoryRepository.findById(categoryId, tenantId);
    if (!cat) throw new NotFoundError('Category not found');

    const updated = await this.categoryRepository.setActive(categoryId, tenantId, true);
    if (!updated) throw new NotFoundError('Category not found');
    return updated;
  }

  async deactivateCategory(
    tenantId: string,
    categoryId: string
  ): Promise<IExpenseCategory> {
    const cat = await this.categoryRepository.findById(categoryId, tenantId);
    if (!cat) throw new NotFoundError('Category not found');

    const updated = await this.categoryRepository.setActive(categoryId, tenantId, false);
    if (!updated) throw new NotFoundError('Category not found');
    return updated;
  }
}

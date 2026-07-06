import { AppError } from './AppError';

export class ConflictError extends AppError {
  constructor(message: string = 'Conflict') {
    super(message, 409, 'WORKFLOW_CONFLICT');
    this.name = 'ConflictError';
  }
}

import { AppError } from './AppError';

export class WorkflowError extends AppError {
  constructor(code: string, message: string, statusCode: number = 400) {
    super(message, statusCode, code);
    this.name = 'WorkflowError';
  }
}

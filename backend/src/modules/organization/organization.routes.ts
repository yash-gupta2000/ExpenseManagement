import { Router } from 'express';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { OrganizationRepository } from './organization.repository';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';

const router = Router();

const orgRepository = new OrganizationRepository();
const orgService = new OrganizationService(orgRepository);
const orgController = new OrganizationController(orgService);

router.use(authenticate);

// GET /organization
router.get('/', orgController.get);

// PUT /organization/settings
router.put('/settings', authorize('orgAdmin'), orgController.updateSettings);

export default router;

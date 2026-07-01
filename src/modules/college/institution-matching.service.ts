import * as repo from "./college.repository";
import { logger } from "../../lib/logger";

export class InstitutionMatchingService {
  async linkUserToInstitution(userId: string, email: string): Promise<void> {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) return;

    const institution = await repo.findInstitutionByDomain(domain);
    if (!institution) return;

    await repo.setUserInstitution(userId, institution.id);
    logger.info({ userId, institutionId: institution.id, domain }, "User linked to institution via domain match");
  }

  async autoLinkBatch(userId: string): Promise<void> {
    const user = await repo.getUserInstitutionInfo(userId);
    if (!user?.institution_id || !user.degree || !user.graduation_year) return;

    const batch = await repo.findBatchByInstitutionDegreeYear(
      user.institution_id,
      user.degree,
      user.graduation_year
    );
    if (!batch) return;

    await repo.setUserBatch(userId, batch.id);
    logger.info({ userId, batchId: batch.id }, "User auto-linked to batch at onboarding completion");
  }
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import { InstitutionMatchingService } from "../src/modules/college/institution-matching.service";

vi.mock("../src/modules/college/college.repository", () => ({
  findInstitutionByDomain: vi.fn(),
  setUserInstitution: vi.fn(),
  getUserInstitutionInfo: vi.fn(),
  findBatchByInstitutionDegreeYear: vi.fn(),
  setUserBatch: vi.fn(),
}));

import * as collegeRepo from "../src/modules/college/college.repository";

const matchingService = new InstitutionMatchingService();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InstitutionMatchingService — linkUserToInstitution", () => {
  it("should set institution_id when email domain matches an institution", async () => {
    vi.mocked(collegeRepo.findInstitutionByDomain).mockResolvedValue({
      id: "inst-uuid",
      name: "Test University",
      domain: "testuniv.edu",
      contact_email: "admin@testuniv.edu",
      created_at: new Date().toISOString(),
    });

    await matchingService.linkUserToInstitution("user-uuid", "student@testuniv.edu");

    expect(collegeRepo.findInstitutionByDomain).toHaveBeenCalledWith("testuniv.edu");
    expect(collegeRepo.setUserInstitution).toHaveBeenCalledWith("user-uuid", "inst-uuid");
  });

  it("should not set institution_id for non-matching domain (e.g. gmail.com)", async () => {
    vi.mocked(collegeRepo.findInstitutionByDomain).mockResolvedValue(null);

    await matchingService.linkUserToInstitution("user-uuid", "student@gmail.com");

    expect(collegeRepo.setUserInstitution).not.toHaveBeenCalled();
  });

  it("should handle email with no domain gracefully", async () => {
    await matchingService.linkUserToInstitution("user-uuid", "invalid");
    expect(collegeRepo.findInstitutionByDomain).not.toHaveBeenCalled();
  });
});

describe("InstitutionMatchingService — autoLinkBatch", () => {
  it("should set batch_id when a matching batch exists", async () => {
    vi.mocked(collegeRepo.getUserInstitutionInfo).mockResolvedValue({
      institution_id: "inst-uuid",
      degree: "B.Tech",
      graduation_year: 2027,
    });
    vi.mocked(collegeRepo.findBatchByInstitutionDegreeYear).mockResolvedValue({
      id: "batch-uuid",
      institution_id: "inst-uuid",
      degree: "B.Tech",
      graduation_year: 2027,
      label: "B.Tech 2024-2027",
      created_at: new Date().toISOString(),
    });

    await matchingService.autoLinkBatch("user-uuid");

    expect(collegeRepo.setUserBatch).toHaveBeenCalledWith("user-uuid", "batch-uuid");
  });

  it("should leave batch_id null when no matching batch exists (no error)", async () => {
    vi.mocked(collegeRepo.getUserInstitutionInfo).mockResolvedValue({
      institution_id: "inst-uuid",
      degree: "B.Tech",
      graduation_year: 2027,
    });
    vi.mocked(collegeRepo.findBatchByInstitutionDegreeYear).mockResolvedValue(null);

    await matchingService.autoLinkBatch("user-uuid");

    expect(collegeRepo.setUserBatch).not.toHaveBeenCalled();
  });

  it("should do nothing if user has no institution_id", async () => {
    vi.mocked(collegeRepo.getUserInstitutionInfo).mockResolvedValue({
      institution_id: null,
      degree: null,
      graduation_year: null,
    });

    await matchingService.autoLinkBatch("user-uuid");

    expect(collegeRepo.findBatchByInstitutionDegreeYear).not.toHaveBeenCalled();
  });
});

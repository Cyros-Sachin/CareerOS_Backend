import * as repo from "./skills.repository";

export class SkillsService {
  async browse(category?: string, search?: string) {
    return repo.searchSkills(category, search);
  }

  async getCategories() {
    return repo.getCategoryCounts();
  }
}

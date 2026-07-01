import { HttpError } from "../../middleware/errorHandler";
import { logger } from "../../lib/logger";
import * as repo from "./interview.repository";
import * as userRepo from "../auth/auth.repository";
import type { InterviewAIService } from "../../lib/ai/interview-question-gen.interface";
import type { DimensionScores } from "../../lib/ai/interview-scoring";
import { aggregateSessionScores } from "../../lib/ai/interview-scoring";
import { syncInterviewReadiness } from "./dimension-score-sync.service";

const TIME_LIMITS: Record<string, number> = {
  technical: 2700,
  system_design: 2700,
  hr: 1800,
};

export class InterviewService {
  constructor(private interviewAI: InterviewAIService) {}

  async startSession(
    userId: string,
    data: {
      mode: "technical" | "system_design" | "hr";
      difficulty?: "easy" | "medium" | "hard";
      topic?: string;
      language?: string;
    }
  ) {
    const user = await userRepo.findById(userId);
    if (!user) {
      throw new HttpError(404, "USER_NOT_FOUND", "User not found");
    }

    if (user.subscription_tier !== "pro") {
      throw new HttpError(403, "UPGRADE_REQUIRED", "Mock interviews are available on the Pro plan");
    }

    const targetRole = user.career_goals?.[0] || "Software Engineer";
    const skillLevel = user.skill_level || "beginner";

    const questionSet = await this.interviewAI.generateQuestions({
      mode: data.mode,
      difficulty: data.difficulty,
      topic: data.topic,
      targetRole,
      skillLevel,
      language: data.language,
    });

    const session = await repo.createSession({
      userId,
      mode: data.mode,
      difficulty: data.difficulty || null,
      topic: data.topic || null,
      targetRole,
      timeLimitSeconds: TIME_LIMITS[data.mode] || 2700,
    });

    const questionsWithLang = questionSet.questions.map((q) => ({
      sessionId: session.id,
      questionOrder: q.questionOrder,
      questionText: q.questionText,
      language: data.mode === "technical" ? (data.language || q.language || null) : null,
    }));

    await repo.insertQuestions(questionsWithLang);

    const questions = await repo.getQuestionsBySession(session.id);

    logger.info(
      { userId, sessionId: session.id, mode: data.mode },
      "Interview session started"
    );

    return {
      session: {
        id: session.id,
        mode: session.mode,
        difficulty: session.difficulty,
        topic: session.topic,
        targetRole: session.target_role,
        status: session.status,
        timeLimitSeconds: session.time_limit_seconds,
        startedAt: session.started_at,
      },
      questions: questions.map((q) => ({
        id: q.id,
        questionOrder: q.question_order,
        questionText: q.question_text,
        language: q.language,
      })),
    };
  }

  async getSessionDetail(sessionId: string, userId: string) {
    const session = await repo.findSessionForUser(sessionId, userId);
    if (!session) {
      throw new HttpError(404, "SESSION_NOT_FOUND", "Interview session not found");
    }

    const questions = await repo.getQuestionsBySession(sessionId);
    const answers = await repo.getAnswersBySession(sessionId);

    const answerMap = new Map(answers.map((a) => [a.question_id, a]));

    return {
      session: {
        id: session.id,
        mode: session.mode,
        difficulty: session.difficulty,
        topic: session.topic,
        targetRole: session.target_role,
        status: session.status,
        timeLimitSeconds: session.time_limit_seconds,
        totalScore: session.total_score,
        startedAt: session.started_at,
        completedAt: session.completed_at,
      },
      questions: questions.map((q) => {
        const answer = answerMap.get(q.id);
        return {
          id: q.id,
          questionOrder: q.question_order,
          questionText: q.question_text,
          language: q.language,
          answer: answer
            ? {
                answerText: answer.answer_text,
                submittedAt: answer.submitted_at,
                submittedLate: answer.submitted_late,
                lastAutosavedAt: answer.last_autosaved_at,
                score: answer.score,
                feedback: answer.feedback,
              }
            : null,
        };
      }),
    };
  }

  async autosaveAnswer(questionId: string, sessionId: string, userId: string, answerText: string) {
    const session = await repo.findSessionForUser(sessionId, userId);
    if (!session) {
      throw new HttpError(404, "SESSION_NOT_FOUND", "Interview session not found");
    }
    if (session.status !== "in_progress") {
      throw new HttpError(400, "SESSION_NOT_ACTIVE", "Session is no longer in progress");
    }

    const question = await repo.findQuestionById(questionId);
    if (!question || question.session_id !== sessionId) {
      throw new HttpError(404, "QUESTION_NOT_FOUND", "Question not found in this session");
    }

    await repo.autosaveAnswer(questionId, answerText);

    logger.debug({ sessionId, questionId }, "Answer auto-saved");

    return { saved: true };
  }

  async submitAnswer(
    questionId: string,
    sessionId: string,
    userId: string,
    answerText: string
  ) {
    const session = await repo.findSessionForUser(sessionId, userId);
    if (!session) {
      throw new HttpError(404, "SESSION_NOT_FOUND", "Interview session not found");
    }
    if (session.status !== "in_progress") {
      throw new HttpError(400, "SESSION_NOT_ACTIVE", "Session is no longer in progress");
    }

    const question = await repo.findQuestionById(questionId);
    if (!question || question.session_id !== sessionId) {
      throw new HttpError(404, "QUESTION_NOT_FOUND", "Question not found in this session");
    }

    const startedAt = new Date(session.started_at).getTime();
    const timeLimitMs = session.time_limit_seconds * 1000;
    const now = Date.now();
    const submittedLate = now > startedAt + timeLimitMs;

    const evaluation = await this.interviewAI.evaluateAnswer({
      questionText: question.question_text,
      answerText,
      mode: session.mode as "technical" | "system_design" | "hr",
      language: question.language || undefined,
    });

    const answer = await repo.submitAnswer({
      questionId,
      answerText,
      submittedLate,
      score: evaluation.score,
      feedback: evaluation.feedback,
      modelAnswer: evaluation.modelAnswer,
    });

    logger.info(
      { sessionId, questionId, submittedLate },
      "Answer submitted and evaluated"
    );

    return {
      submitted: true,
      submittedLate,
      score: answer.score,
      feedback: answer.feedback,
      modelAnswer: answer.model_answer,
    };
  }

  async completeSession(sessionId: string, userId: string) {
    const session = await repo.findSessionForUser(sessionId, userId);
    if (!session) {
      throw new HttpError(404, "SESSION_NOT_FOUND", "Interview session not found");
    }
    if (session.status !== "in_progress") {
      throw new HttpError(400, "SESSION_NOT_ACTIVE", "Session is already completed or abandoned");
    }

    const submittedCount = await repo.countSubmittedAnswers(sessionId);
    const questions = await repo.getQuestionsBySession(sessionId);

    if (submittedCount < questions.length) {
      throw new HttpError(
        409,
        "SESSION_INCOMPLETE",
        `Only ${submittedCount}/${questions.length} questions answered. All questions must be submitted before completing.`
      );
    }

    const answers = await repo.getAnswersBySession(sessionId);
    const allScores: DimensionScores[] = [];

    for (const answer of answers) {
      if (answer.score) {
        allScores.push(answer.score as unknown as DimensionScores);
      }
    }

    const { totalScore, averageScores, improvementAreas } = aggregateSessionScores(allScores);

    await repo.completeSession(sessionId, totalScore);

    await syncInterviewReadiness(userId, totalScore);

    logger.info(
      { sessionId, userId, totalScore },
      "Interview session completed"
    );

    return this.buildReport(
      session,
      questions,
      answers,
      totalScore,
      averageScores,
      improvementAreas
    );
  }

  async getReport(sessionId: string, userId: string) {
    const session = await repo.findSessionForUser(sessionId, userId);
    if (!session) {
      throw new HttpError(404, "SESSION_NOT_FOUND", "Interview session not found");
    }

    const questions = await repo.getQuestionsBySession(sessionId);
    const answers = await repo.getAnswersBySession(sessionId);

    if (session.status === "in_progress" || !session.total_score) {
      throw new HttpError(400, "SESSION_NOT_COMPLETED", "Report is only available after session completion");
    }

    const allScores: DimensionScores[] = [];
    for (const answer of answers) {
      if (answer.score) {
        allScores.push(answer.score as unknown as DimensionScores);
      }
    }

    const { averageScores, improvementAreas } = aggregateSessionScores(allScores);

    return this.buildReport(
      session,
      questions,
      answers,
      session.total_score,
      averageScores,
      improvementAreas
    );
  }

  async getHistory(userId: string, limit: number = 20) {
    const sessions = await repo.getUserSessions(userId, limit);

    return Promise.all(
      sessions.map(async (s) => {
        const questions = await repo.getQuestionsBySession(s.id);
        const answers = await repo.getAnswersBySession(s.id);
        const submittedCount = answers.filter((a) => a.submitted_at).length;

        return {
          id: s.id,
          mode: s.mode,
          difficulty: s.difficulty,
          topic: s.topic,
          targetRole: s.target_role,
          status: s.status,
          totalScore: s.total_score,
          timeLimitSeconds: s.time_limit_seconds,
          questionCount: questions.length,
          answeredCount: submittedCount,
          startedAt: s.started_at,
          completedAt: s.completed_at,
        };
      })
    );
  }

  async abandonSession(sessionId: string, userId: string) {
    const session = await repo.findSessionForUser(sessionId, userId);
    if (!session) {
      throw new HttpError(404, "SESSION_NOT_FOUND", "Interview session not found");
    }
    if (session.status !== "in_progress") {
      throw new HttpError(400, "SESSION_NOT_ACTIVE", "Session is already completed or abandoned");
    }

    await repo.abandonSession(sessionId);

    logger.info({ sessionId, userId }, "Interview session abandoned");

    return { abandoned: true };
  }

  private buildReport(
    session: repo.InterviewSessionRow,
    questions: repo.InterviewQuestionRow[],
    answers: repo.InterviewAnswerRow[],
    totalScore: number,
    averageScores: DimensionScores,
    improvementAreas: Array<{ dimension: string; score: number }>
  ) {
    const answerMap = new Map(answers.map((a) => [a.question_id, a]));

    const questionReports = questions.map((q) => {
      const answer = answerMap.get(q.id);
      return {
        questionOrder: q.question_order,
        questionText: q.question_text,
        language: q.language,
        answer: answer
          ? {
              answerText: answer.answer_text,
              submittedAt: answer.submitted_at,
              submittedLate: answer.submitted_late,
              score: answer.score,
              feedback: answer.feedback,
              modelAnswer: answer.model_answer,
            }
          : null,
      };
    });

    return {
      session: {
        id: session.id,
        mode: session.mode,
        difficulty: session.difficulty,
        topic: session.topic,
        targetRole: session.target_role,
        status: session.status,
        totalScore,
        timeLimitSeconds: session.time_limit_seconds,
        startedAt: session.started_at,
        completedAt: session.completed_at,
      },
      averageScores,
      improvementAreas,
      questions: questionReports,
    };
  }
}

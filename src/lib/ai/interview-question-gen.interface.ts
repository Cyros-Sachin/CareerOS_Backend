export interface InterviewQuestion {
  questionOrder: number;
  questionText: string;
  language?: string;
}

export interface InterviewQuestionSet {
  questions: InterviewQuestion[];
}

export interface AnswerEvaluation {
  score: {
    correctness_soundness: number;
    complexity_tradeoff_awareness: number;
    communication_clarity: number;
    best_practices: number;
    completeness: number;
  };
  feedback: string;
  modelAnswer: string;
}

export interface QuestionGenerationParams {
  mode: "technical" | "system_design" | "hr";
  difficulty?: "easy" | "medium" | "hard";
  topic?: string;
  targetRole: string;
  skillLevel: string;
  language?: string;
}

export interface AnswerEvaluationParams {
  questionText: string;
  answerText: string;
  mode: "technical" | "system_design" | "hr";
  language?: string;
}

export interface InterviewAIService {
  generateQuestions(params: QuestionGenerationParams): Promise<InterviewQuestionSet>;
  evaluateAnswer(params: AnswerEvaluationParams): Promise<AnswerEvaluation>;
}

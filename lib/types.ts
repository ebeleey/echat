export interface QAPair {
  question: string;
  answer: string;
}

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: {
    question: string;
    answer: string;
  };
}

export interface SearchResult {
  id: string;
  score: number;
  payload: {
    question: string;
    answer: string;
  };
}

export interface AskRequest {
  question: string;
}

export interface AskResponse {
  answer: string;
  found: boolean;
  similarity?: number;
}



export enum ProcessingState {
  IDLE = 'IDLE',
  QUEUED = 'QUEUED',
  READING = 'READING',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface PaperMetadata {
  title: string;
  authorsFull: string[]; 
  seniorAuthorFull?: string; 
  authorsAbbrev: string[]; 
  seniorAuthorAbbrev?: string; 
  year: string;
  debugYearSource?: string;
  category: string; 
  journal: string; 
  summary: string;
  suggestedFilename: string; 
}

export interface FileItem {
  id: string;
  file: File;
  originalName: string;
  sourcePath?: string;
  relativePath?: string;
  state: ProcessingState;
  metadata?: PaperMetadata;
  error?: string;
  textPreview?: string;
}

export interface Stats {
  total: number;
  processed: number;
  categories: Record<string, number>;
}

export type LLMProvider = 'google' | 'openai' | 'deepseek' | 'ollama' | 'azure';

export interface AppSettings {
  provider: LLMProvider;
  apiKey: string;
  baseUrl: string; // Used as Endpoint for Azure
  apiVersion?: string; // Specific for Azure
  model: string; // Used as Deployment Name for Azure
  azureCustomHeaders?: string; // JSON string for custom headers
}

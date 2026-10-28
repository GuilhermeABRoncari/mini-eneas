export type Provider = 'demo' | 'local' | 'ollama' | 'openai';
export type Temperament = 'calmo' | 'dramatico' | 'impaciente';
export interface AiConfig { provider: Provider; model: string; ollamaUrl: string; temperament: Temperament }
export interface AiSettings extends AiConfig { hasKey: boolean; rememberKey: boolean; storageNotice: string }
export interface AiSave extends AiConfig { key?: string; rememberKey: boolean; forgetKey?: boolean }
export type AiEvent = { id: string; type: 'thinking' | 'delta' | 'done' | 'error' | 'cancelled'; text?: string; message?: string };
export interface AiBridge {
  settings(): Promise<AiSettings>;
  save(settings: AiSave): Promise<AiSettings>;
  models(): Promise<string[]>;
  start(id: string, text: string): Promise<void>;
  cancel(id: string): Promise<void>;
  clear(): Promise<void>;
  onEvent(callback: (event: AiEvent) => void): () => void;
}

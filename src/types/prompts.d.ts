declare module "prompts" {
  export interface PromptChoice {
    title: string;
    value: string;
    description?: string;
  }

  export interface PromptQuestion {
    type: string;
    name: string;
    message: string;
    initial?: boolean | number | string;
    choices?: PromptChoice[];
  }

  export interface PromptOptions {
    onCancel?: () => boolean | undefined;
  }

  export default function prompts<T extends Record<string, unknown>>(
    question: PromptQuestion | PromptQuestion[],
    options?: PromptOptions,
  ): Promise<T>;
}

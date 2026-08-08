// =============================================================================
// Azure OpenAI Service - GPT-4o Integration
// =============================================================================

import axios from 'axios';
import { config } from '../config';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: string };
}

interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

export class AzureOpenAIService {
  private endpoint: string;
  private apiKey: string;
  private deploymentName: string;
  private apiVersion: string;

  constructor() {
    this.endpoint = config.azure.openai.endpoint;
    this.apiKey = config.azure.openai.apiKey;
    this.deploymentName = config.azure.openai.deploymentName;
    this.apiVersion = config.azure.openai.apiVersion;
  }

  // ─── Chat Completion ───────────────────────────────────────────────────────
  async chatCompletion(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<string> {
    if (!this.endpoint || !this.apiKey) {
      // Only fabricate a response when explicitly asked to. Silently returning
      // invented content when credentials are absent means production — where
      // AZURE_OPENAI_* is currently unset — feeds made-up data into the
      // accounting flow as if the model had produced it.
      if (process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV === 'true') {
        console.warn('⚠️ Azure OpenAI not configured - using mock response (WHATSAPP_AI_ALLOW_INSECURE_DEV=true)');
        return this.getMockResponse(messages);
      }
      throw new Error('Azure OpenAI is not configured (AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY)');
    }

    const url = `${this.endpoint}/openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`;

    const body: Record<string, unknown> = {
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 2000,
    };

    if (options.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    try {
      const response = await axios.post(url, body, {
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      return response.data.choices[0].message.content;
    } catch (error: any) {
      console.error('Azure OpenAI error:', error.response?.data || error.message);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  // ─── Chat Completion with Vision ───────────────────────────────────────────
  async chatCompletionWithVision(prompt: string, imageUrl: string): Promise<string> {
    if (!this.endpoint || !this.apiKey) {
      // This was the most dangerous fallback in the service: every bill photo
      // came back as a ₹10,000 purchase from "Sample Vendor", and the document
      // flow then asks the user to confirm and post it — turning invented OCR
      // into a real financial record. Fail loudly instead.
      if (process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV === 'true') {
        console.warn('⚠️ Azure OpenAI not configured - using mock vision response (WHATSAPP_AI_ALLOW_INSECURE_DEV=true)');
        return JSON.stringify({
          partyName: 'Sample Vendor',
          billNumber: 'INV-001',
          totalAmount: 10000,
          date: '03/07/2026',
        });
      }
      throw new Error('Azure OpenAI vision is not configured (AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY) — cannot read documents');
    }

    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
        ],
      },
    ];

    return this.chatCompletion(messages, { responseFormat: 'json', maxTokens: 4000 });
  }

  // ─── Function Calling ──────────────────────────────────────────────────────
  async chatCompletionWithFunctions(
    messages: ChatMessage[],
    functions: any[],
    options: CompletionOptions = {}
  ): Promise<{ content?: string; functionCall?: { name: string; arguments: string } }> {
    if (!this.endpoint || !this.apiKey) {
      return { content: 'Function calling not available without Azure credentials' };
    }

    const url = `${this.endpoint}/openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`;

    const body = {
      messages,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 2000,
      tools: functions.map(fn => ({ type: 'function', function: fn })),
      tool_choice: 'auto',
    };

    try {
      const response = await axios.post(url, body, {
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      const choice = response.data.choices[0];
      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        const toolCall = choice.message.tool_calls[0];
        return {
          functionCall: {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          },
        };
      }

      return { content: choice.message.content };
    } catch (error: any) {
      console.error('Azure OpenAI function calling error:', error.response?.data || error.message);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  // ─── Mock Response (Development) ───────────────────────────────────────────
  private getMockResponse(messages: ChatMessage[]): string {
    const lastMessage = messages[messages.length - 1];
    const content = typeof lastMessage.content === 'string'
      ? lastMessage.content
      : (lastMessage.content.find(p => p.type === 'text')?.text || '');

    // Check if JSON response is expected
    const systemMessage = messages.find(m => m.role === 'system');
    const systemContent = typeof systemMessage?.content === 'string' ? systemMessage.content : '';

    if (systemContent.includes('JSON') || systemContent.includes('json')) {
      return JSON.stringify({
        intent: 'UNKNOWN',
        confidence: 0.5,
        language: 'hinglish',
        entities: [],
      });
    }

    return `[Mock Response] Query understood: "${content.substring(0, 50)}..."`;
  }
}

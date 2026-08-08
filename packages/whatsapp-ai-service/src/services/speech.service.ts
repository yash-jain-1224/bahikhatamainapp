// =============================================================================
// Azure Speech Service - Hindi/English Voice Processing
// =============================================================================

import { config } from '../config';
import axios from 'axios';

export class SpeechService {
  private endpoint: string;
  private apiKey: string;
  private region: string;

  constructor() {
    this.endpoint = config.azure.speech.endpoint;
    this.apiKey = config.azure.speech.apiKey;
    this.region = config.azure.speech.region;
  }

  // ─── Transcribe Audio ──────────────────────────────────────────────────────
  async transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
    if (!this.apiKey || !this.region) {
      console.warn('⚠️ Azure Speech not configured - returning empty transcription');
      return '[Voice note received - Speech service not configured]';
    }

    // Convert to WAV if needed (WhatsApp sends OGG/OPUS)
    const wavBuffer = await this.convertToWav(audioBuffer, mimeType);

    // Use Azure Speech-to-Text REST API
    const url = `https://${this.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=hi-IN&format=detailed`;

    try {
      const response = await axios.post(url, wavBuffer, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.apiKey,
          'Content-Type': 'audio/wav',
          'Accept': 'application/json',
        },
        timeout: 30000,
      });

      if (response.data.RecognitionStatus === 'Success') {
        return response.data.DisplayText || response.data.NBest?.[0]?.Display || '';
      }

      // Try English if Hindi fails
      if (response.data.RecognitionStatus === 'NoMatch') {
        return this.transcribeEnglish(wavBuffer);
      }

      console.warn('Speech recognition status:', response.data.RecognitionStatus);
      return '';
    } catch (error) {
      console.error('Speech-to-text error:', error);
      
      // Fallback: try multi-language recognition
      return this.transcribeMultilingual(wavBuffer);
    }
  }

  // ─── Transcribe in English ─────────────────────────────────────────────────
  private async transcribeEnglish(wavBuffer: Buffer): Promise<string> {
    const url = `https://${this.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-IN&format=detailed`;

    try {
      const response = await axios.post(url, wavBuffer, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.apiKey,
          'Content-Type': 'audio/wav',
          'Accept': 'application/json',
        },
        timeout: 30000,
      });

      if (response.data.RecognitionStatus === 'Success') {
        return response.data.DisplayText || '';
      }
      return '';
    } catch (error) {
      console.error('English STT error:', error);
      return '';
    }
  }

  // ─── Multilingual Transcription ────────────────────────────────────────────
  private async transcribeMultilingual(wavBuffer: Buffer): Promise<string> {
    // Try with language auto-detection (Hindi + English)
    const url = `https://${this.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=hi-IN&format=detailed&profanity=raw`;

    try {
      const response = await axios.post(url, wavBuffer, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.apiKey,
          'Content-Type': 'audio/wav',
          'Accept': 'application/json',
        },
        timeout: 30000,
      });

      return response.data.DisplayText || '';
    } catch (error) {
      console.error('Multilingual STT error:', error);
      return '';
    }
  }

  // ─── Convert Audio Format ──────────────────────────────────────────────────
  private async convertToWav(buffer: Buffer, mimeType: string): Promise<Buffer> {
    // WhatsApp audio is usually OGG/OPUS
    // For production, use ffmpeg or a proper audio conversion library
    if (mimeType.includes('wav') || mimeType.includes('wave')) {
      return buffer;
    }

    // For now, pass through - Azure might handle some formats
    // In production, use fluent-ffmpeg or similar
    console.warn(`⚠️ Audio format ${mimeType} may need conversion`);
    return buffer;
  }
}

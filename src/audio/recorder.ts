const TARGET_SAMPLE_RATE = 16000;

export class AudioRecorder {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private mute: GainNode | null = null;
  private chunks: Float32Array[] = [];
  private startTime = 0;
  private sampleRate = TARGET_SAMPLE_RATE;
  private active = false;
  private onLevelUpdate?: (level: number) => void;
  private onPcmChunk?: (pcm16: ArrayBuffer) => void;
  private onStreamEnded?: () => void;

  constructor(
    onLevelUpdate?: (level: number) => void,
    onPcmChunk?: (pcm16: ArrayBuffer) => void,
    onStreamEnded?: () => void
  ) {
    this.onLevelUpdate = onLevelUpdate;
    this.onPcmChunk = onPcmChunk;
    this.onStreamEnded = onStreamEnded;
  }

  public isActive(): boolean {
    return this.active;
  }

  public async start(): Promise<void> {
    if (this.active) return;
    this.chunks = [];
    this.startTime = Date.now();

    try {
      await this.openStream();
    } catch (err) {
      this.cleanup();
      throw err;
    }
  }

  private async openStream(): Promise<void> {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: TARGET_SAMPLE_RATE,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const audioContext = await this.ensureContext();
    const source = audioContext.createMediaStreamSource(this.mediaStream);

    // ScriptProcessor only runs when connected to the destination.
    // A zero-gain node keeps the graph alive without playing the mic back.
    const bufferSize = this.sampleRate <= 16000 ? 2048 : 4096;
    this.processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
    this.processor.onaudioprocess = (event) => {
      if (!this.active) return;
      const channel = event.inputBuffer.getChannelData(0);
      const resampled =
        this.sampleRate === TARGET_SAMPLE_RATE
          ? new Float32Array(channel)
          : downsampleBuffer(channel, this.sampleRate, TARGET_SAMPLE_RATE);
      this.chunks.push(resampled);
      this.publishLevel(resampled);
      if (this.onPcmChunk && resampled.length > 0) {
        this.onPcmChunk(floatTo16BitPCM(resampled));
      }
    };
    this.mute = audioContext.createGain();
    this.mute.gain.value = 0;
    this.active = true;
    source.connect(this.processor);
    this.processor.connect(this.mute);
    this.mute.connect(audioContext.destination);
  }

  public async stop(): Promise<{ arrayBuffer: ArrayBuffer; mimeType: string; durationSeconds: number }> {
    const durationSeconds = (Date.now() - this.startTime) / 1000;
    const samples = this.mergeChunks();
    this.cleanup();
    // Let a live transcription session finalize while the WAV fallback is encoded.
    this.onStreamEnded?.();
    return {
      arrayBuffer: encodeWav(samples, TARGET_SAMPLE_RATE),
      mimeType: 'audio/wav',
      durationSeconds,
    };
  }

  public discard(): void {
    this.cleanup();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
  }

  private mergeChunks(): Float32Array {
    const length = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Float32Array(length);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    return merged;
  }

  private async ensureContext(): Promise<AudioContext> {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      if (this.audioContext.state !== 'running') {
        await this.audioContext.resume();
      }
      this.sampleRate = this.audioContext.sampleRate;
      return this.audioContext;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    try {
      this.audioContext = new AudioCtx({ sampleRate: TARGET_SAMPLE_RATE });
    } catch {
      this.audioContext = new AudioCtx();
    }
    this.sampleRate = this.audioContext.sampleRate;
    if (this.audioContext.state !== 'running') {
      await this.audioContext.resume();
    }
    return this.audioContext;
  }

  private publishLevel(samples: Float32Array) {
    if (!this.onLevelUpdate || samples.length === 0) return;
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / samples.length);
    this.onLevelUpdate(Math.min(1, rms * 5));
  }

  private cleanup() {
    this.active = false;
    try { this.processor?.disconnect(); } catch { /* already disconnected */ }
    try { this.mute?.disconnect(); } catch { /* already disconnected */ }
    this.processor = null;
    this.mute = null;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.chunks = [];
    if (this.audioContext && this.audioContext.state === 'running') {
      this.audioContext.suspend().catch(() => {});
    }
  }
}

function downsampleBuffer(buffer: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (outputRate >= inputRate) return new Float32Array(buffer);
  const ratio = inputRate / outputRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function quantize(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}

function floatTo16BitPCM(samples: Float32Array): ArrayBuffer {
  // A freshly allocated Int16Array owns an ArrayBuffer; the lib type is ArrayBufferLike.
  return quantize(samples).buffer as ArrayBuffer;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const pcm = quantize(samples);
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(buffer).set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 44);
  return buffer;
}

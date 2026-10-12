const TARGET_SAMPLE_RATE = 16000;

export class AudioRecorder {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private mute: GainNode | null = null;
  private animFrameId: number | null = null;
  private chunks: Float32Array[] = [];
  private startTime = 0;
  private sampleRate = TARGET_SAMPLE_RATE;
  private active = false;
  private onLevelUpdate?: (level: number) => void;
  private onPcmChunk?: (pcm16: ArrayBuffer) => void;

  constructor(
    onLevelUpdate?: (level: number) => void,
    onPcmChunk?: (pcm16: ArrayBuffer) => void
  ) {
    this.onLevelUpdate = onLevelUpdate;
    this.onPcmChunk = onPcmChunk;
  }

  public isActive(): boolean {
    return this.active;
  }

  public async start(): Promise<void> {
    if (this.active) return;
    this.chunks = [];
    this.startTime = Date.now();

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: TARGET_SAMPLE_RATE,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    try {
      this.audioContext = new AudioCtx({ sampleRate: TARGET_SAMPLE_RATE });
    } catch {
      this.audioContext = new AudioCtx();
    }
    this.sampleRate = this.audioContext.sampleRate;
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 64;
    this.analyser.smoothingTimeConstant = 0.8;
    source.connect(this.analyser);

    // ScriptProcessor only runs when connected to the destination.
    // A zero-gain node keeps the graph alive without playing the mic back.
    const bufferSize = this.sampleRate <= 16000 ? 2048 : 4096;
    this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
    this.processor.onaudioprocess = (event) => {
      if (!this.active) return;
      const channel = event.inputBuffer.getChannelData(0);
      const resampled =
        this.sampleRate === TARGET_SAMPLE_RATE
          ? new Float32Array(channel)
          : downsampleBuffer(channel, this.sampleRate, TARGET_SAMPLE_RATE);
      this.chunks.push(resampled);
      if (this.onPcmChunk && resampled.length > 0) {
        this.onPcmChunk(floatTo16BitPCM(resampled));
      }
    };
    this.mute = this.audioContext.createGain();
    this.mute.gain.value = 0;
    source.connect(this.processor);
    this.processor.connect(this.mute);
    this.mute.connect(this.audioContext.destination);

    this.active = true;
    this.monitorAudioLevel();
  }

  public async stop(): Promise<{ arrayBuffer: ArrayBuffer; mimeType: string; durationSeconds: number }> {
    const durationSeconds = (Date.now() - this.startTime) / 1000;
    const samples = this.mergeChunks();
    this.cleanup();
    return {
      arrayBuffer: encodeWav(samples, TARGET_SAMPLE_RATE),
      mimeType: 'audio/wav',
      durationSeconds,
    };
  }

  public discard(): void {
    this.cleanup();
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

  private monitorAudioLevel() {
    if (!this.analyser) return;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const update = () => {
      if (!this.analyser || !this.active) return;
      this.analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const normalized = Math.min(1, Math.max(0, sum / dataArray.length / 128));
      this.onLevelUpdate?.(normalized);
      this.animFrameId = requestAnimationFrame(update);
    };

    update();
  }

  private cleanup() {
    this.active = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    try { this.processor?.disconnect(); } catch { /* already disconnected */ }
    try { this.mute?.disconnect(); } catch { /* already disconnected */ }
    this.processor = null;
    this.mute = null;
    this.analyser = null;
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.chunks = [];
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

function floatTo16BitPCM(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
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
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

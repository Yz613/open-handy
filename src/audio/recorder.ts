export class AudioRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private startTime: number = 0;
  private onLevelUpdate?: (level: number) => void;

  constructor(onLevelUpdate?: (level: number) => void) {
    this.onLevelUpdate = onLevelUpdate;
  }

  public async start(): Promise<void> {
    this.audioChunks = [];
    this.startTime = Date.now();

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });

      // Set up Analyser for visualizer levels
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);

      // Start level monitoring loop
      this.monitorAudioLevel();

      // Setup MediaRecorder
      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100); // 100ms timeslice
    } catch (err) {
      console.error('Failed to access microphone:', err);
      throw err;
    }
  }

  public async stop(): Promise<{ arrayBuffer: ArrayBuffer; mimeType: string; durationSeconds: number }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('MediaRecorder was not initialized.'));
        return;
      }

      this.stopMonitoring();

      const durationSeconds = (Date.now() - this.startTime) / 1000;

      this.mediaRecorder.onstop = async () => {
        try {
          const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          const arrayBuffer = await audioBlob.arrayBuffer();

          this.cleanup();
          resolve({ arrayBuffer, mimeType, durationSeconds });
        } catch (e) {
          this.cleanup();
          reject(e);
        }
      };

      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    });
  }

  private monitorAudioLevel() {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const update = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);

      // Compute average volume level normalized between 0.0 and 1.0
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      const normalized = Math.min(1.0, Math.max(0.0, avg / 128));

      if (this.onLevelUpdate) {
        this.onLevelUpdate(normalized);
      }

      this.animFrameId = requestAnimationFrame(update);
    };

    update();
  }

  private stopMonitoring() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    this.audioContext = null;
    this.analyser = null;
  }

  private cleanup() {
    this.stopMonitoring();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }

  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }
}

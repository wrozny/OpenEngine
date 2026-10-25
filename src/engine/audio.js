/** Asset-free effects plus optional file playback; audio unlocks on a user gesture. */
export class AudioService {
  constructor() {
    this.context = null;
    this.Volume = 0.35;
    this.playing = new Set();
  }
  unlock() {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (AudioContext && !this.context) this.context = new AudioContext();
    this.context?.resume().catch(() => {});
  }
  Tone(frequency = 440, duration = 0.1, volume = 1, type = 'sine') {
    if (!this.context || this.context.state !== 'running') return;
    const ctx = this.context;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = ['sine', 'square', 'sawtooth', 'triangle'].includes(type) ? type : 'sine';
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, frequency * 0.35),
      ctx.currentTime + duration,
    );
    gain.gain.setValueAtTime(Math.max(0.0001, Math.min(1, volume * this.Volume)), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
  }
  Play(name) {
    const effects = {
      shoot: [170, 0.09, 0.35, 'sawtooth'],
      hit: [90, 0.08, 0.25, 'square'],
      hurt: [65, 0.22, 0.45, 'triangle'],
      upgrade: [700, 0.22, 0.3, 'sine'],
      wave: [360, 0.4, 0.3, 'triangle'],
    };
    if (!effects[name]) throw new Error(`Unknown sound: ${name}`);
    this.Tone(...effects[name]);
  }
  PlayFile(url, volume = 1, loop = false) {
    if (typeof globalThis.Audio === 'undefined') return;
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume * this.Volume));
    audio.loop = loop;
    this.playing.add(audio);
    audio.addEventListener('ended', () => this.playing.delete(audio), { once: true });
    audio.play().catch(() => this.playing.delete(audio));
    return {
      Stop: () => {
        audio.pause();
        this.playing.delete(audio);
      },
    };
  }
  dispose() {
    for (const audio of this.playing) audio.pause();
    this.playing.clear();
    this.context?.close();
  }
}

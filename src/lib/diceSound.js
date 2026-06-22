import { soundEnabled } from "@/lib/soundSettings.js";

let sharedCtx = null;

function getCtx() {
  if (!sharedCtx) {
    const Ctx = window.AudioContext || window["webkitAudioContext"];
    sharedCtx = new Ctx();
  }
  // A context created (or auto-suspended by the browser) while the tab is in
  // the background starts suspended; resuming lets queued sounds play even when
  // the tab is out of focus.
  if (sharedCtx.state === "suspended") sharedCtx.resume();
  return sharedCtx;
}

export function playChatSound() {
  if (!soundEnabled.value) return;
  try {
    const ctx = getCtx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);

    const osc1 = ctx.createOscillator();
    osc1.connect(gain);
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.13);

    const osc2 = ctx.createOscillator();
    osc2.connect(gain);
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1108, ctx.currentTime + 0.1);
    osc2.start(ctx.currentTime + 0.1);
    osc2.stop(ctx.currentTime + 0.28);
  } catch {}
}

export function playLuckSound() {
  if (!soundEnabled.value) return;
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;

    const notes = [
      { freq: 523, start: 0, stop: 0.18 },
      { freq: 659, start: 0.12, stop: 0.3 },
      { freq: 784, start: 0.24, stop: 0.55 },
    ];

    notes.forEach(({ freq, start, stop }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t + start);
      gain.gain.setValueAtTime(0, t + start);
      gain.gain.linearRampToValueAtTime(0.13, t + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + stop);
      osc.start(t + start);
      osc.stop(t + stop);
    });
  } catch {}
}

export function playDiceSound() {
  if (!soundEnabled.value) return;
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(380, ctx.currentTime + 0.13);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.18);
  } catch {}
}

import assert from "node:assert/strict";
import { convertRealtimeAudioToTwilioPcmu, muLawDecodeSample } from "../src/audio.js";

const makePcm16SineBase64 = (sampleRate: number, frequencyHz: number, durationMs: number) => {
  const totalSamples = Math.floor((sampleRate * durationMs) / 1000);
  const buffer = Buffer.alloc(totalSamples * 2);
  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / sampleRate;
    const sample = Math.round(Math.sin(2 * Math.PI * frequencyHz * t) * 12000);
    buffer.writeInt16LE(sample, i * 2);
  }
  return buffer.toString("base64");
};

(() => {
  const pcmuInput = Buffer.from([0xff, 0x7f, 0x55, 0x00]).toString("base64");
  const pcmuOutput = convertRealtimeAudioToTwilioPcmu(pcmuInput, "pcmu", 1);
  assert.ok(pcmuOutput);
  assert.equal(Buffer.from(pcmuOutput!, "base64").byteLength, 4);

  const pcm16Base64 = makePcm16SineBase64(24000, 440, 200);
  const twilioBase64 = convertRealtimeAudioToTwilioPcmu(pcm16Base64, "pcm16", 3);
  assert.ok(twilioBase64);
  const twilioBytes = Buffer.from(twilioBase64!, "base64");
  // 24kHz 200ms -> 4800 samples. Downsample x3 -> 1600 u-law bytes at 8kHz.
  assert.equal(twilioBytes.byteLength, 1600);
  const decoded = muLawDecodeSample(twilioBytes[0]);
  assert.ok(Number.isFinite(decoded));

  const invalid = convertRealtimeAudioToTwilioPcmu("", "pcm16", 3);
  assert.equal(invalid, null);

  console.log("All audio format tests passed");
})();

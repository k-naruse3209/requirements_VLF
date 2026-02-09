export const TWILIO_SAMPLE_RATE = 8000;

export type RealtimeAudioEncoding = "pcmu" | "pcm16";

export const muLawDecodeSample = (value: number) => {
  const muLaw = (~value) & 0xff;
  const sign = muLaw & 0x80 ? -1 : 1;
  const exponent = (muLaw >> 4) & 0x07;
  const mantissa = muLaw & 0x0f;
  const sample = ((mantissa << 3) + 0x84) << exponent;
  return sign * (sample - 0x84);
};

export const muLawEncodeSample = (sample: number) => {
  const bias = 0x84;
  const max = 0x1fff;
  let pcm = sample;
  let sign = 0;
  if (pcm < 0) {
    sign = 0x80;
    pcm = -pcm;
  }
  if (pcm > max) pcm = max;
  pcm += bias;
  let exponent = 7;
  for (let expMask = 0x4000; (pcm & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent -= 1;
  }
  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
};

export const generateBeepPcmu = (frequencyHz: number, durationMs: number) => {
  const totalSamples = Math.floor((durationMs / 1000) * TWILIO_SAMPLE_RATE);
  const buffer = Buffer.alloc(totalSamples);
  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / TWILIO_SAMPLE_RATE;
    const sample = Math.round(Math.sin(2 * Math.PI * frequencyHz * t) * 12000);
    buffer[i] = muLawEncodeSample(sample);
  }
  return buffer;
};

export const decodePcmuToPcm16 = (input: Buffer) => {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    output[i] = muLawDecodeSample(input[i]);
  }
  return output;
};

export const encodePcm16ToPcmu = (input: Int16Array) => {
  const output = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i += 1) {
    output[i] = muLawEncodeSample(input[i]);
  }
  return output;
};

export const upsample = (input: Int16Array, factor: number) => {
  if (factor <= 1) return input;
  const output = new Int16Array(input.length * factor);
  let idx = 0;
  for (let i = 0; i < input.length; i += 1) {
    const sample = input[i];
    for (let f = 0; f < factor; f += 1) {
      output[idx++] = sample;
    }
  }
  return output;
};

export const downsample = (input: Int16Array, factor: number) => {
  if (factor <= 1) return input;
  const length = Math.floor(input.length / factor);
  const output = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    output[i] = input[i * factor];
  }
  return output;
};

const parsePcm16Buffer = (pcmBuffer: Buffer): Int16Array | null => {
  const alignedBytes = pcmBuffer.byteLength - (pcmBuffer.byteLength % 2);
  if (alignedBytes <= 0) return null;
  return new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, alignedBytes / 2);
};

export const convertRealtimeAudioToTwilioPcmu = (
  audioBase64: string,
  sourceEncoding: RealtimeAudioEncoding,
  resampleFactor: number
) => {
  if (!audioBase64) return null;
  const audioBuffer = Buffer.from(audioBase64, "base64");
  if (audioBuffer.byteLength === 0) return null;
  if (sourceEncoding === "pcmu") {
    return audioBuffer.toString("base64");
  }
  const pcm16 = parsePcm16Buffer(audioBuffer);
  if (!pcm16) return null;
  const downsampled = downsample(pcm16, Math.max(1, resampleFactor));
  if (downsampled.length === 0) return null;
  return encodePcm16ToPcmu(downsampled).toString("base64");
};

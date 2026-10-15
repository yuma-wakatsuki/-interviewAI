declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(inputs: Float32Array[][]): boolean;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class PcmProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]) {
    const channel = inputs[0]?.[0];
    if (channel) {
      const copy = channel.slice();
      this.port.postMessage(copy.buffer, [copy.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-processor', PcmProcessor);

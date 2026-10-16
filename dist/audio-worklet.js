"use strict";
(() => {
  // src/audio-worklet.ts
  var PcmProcessor = class extends AudioWorkletProcessor {
    process(inputs) {
      const channel = inputs[0]?.[0];
      if (channel) {
        const copy = channel.slice();
        this.port.postMessage(copy.buffer, [copy.buffer]);
      }
      return true;
    }
  };
  registerProcessor("pcm-processor", PcmProcessor);
})();

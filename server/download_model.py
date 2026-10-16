"""Download the approved Japanese ReazonSpeech model into server/models."""
from pathlib import Path
from urllib.request import urlretrieve
import tarfile

ROOT = Path(__file__).resolve().parent / "models"
NAME = "sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01"
URL = f"https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/{NAME}.tar.bz2"

def main() -> None:
    model = ROOT / NAME
    if (model / "encoder-epoch-99-avg-1.int8.onnx").exists():
        print(f"Model ready: {model}")
        return
    ROOT.mkdir(parents=True, exist_ok=True)
    archive = ROOT / f"{NAME}.tar.bz2"
    print("Downloading approved Japanese ASR model…")
    urlretrieve(URL, archive)
    with tarfile.open(archive, "r:bz2") as bundle:
        bundle.extractall(ROOT, filter="data")
    archive.unlink()
    print(f"Model ready: {model}")

if __name__ == "__main__": main()

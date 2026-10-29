from pathlib import Path
import io, wave, zipfile
root = Path(__file__).resolve().parents[1]
output = root / 'output' / 'readme-demo.zip'
output.parent.mkdir(exist_ok=True)
audio = io.BytesIO()
with wave.open(audio, 'wb') as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(8000)
    wav.writeframes(b'\0\0' * 8000 * 180)
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_STORED) as pack:
    pack.writestr('Demo/data.csv', 'No,title,subtitle,artist,translated,animation,music,image\n1,夏日的风,界面展示 · 合成静音音频,KarutaPlayer,,示例曲包,demo.wav,cover.png\n')
    pack.writestr('Demo/demo.wav', audio.getvalue())
    pack.write(root / 'docs/media/demo-cover.png', 'Demo/cover.png')
print(output)

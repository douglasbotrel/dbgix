"""
Remove fundo branco/cinza claro do logo Ecdise e gera PNG transparente.
Uso:  python remove-bg.py
Requer: pip install Pillow
"""
from PIL import Image
import os

INPUT  = os.path.join(os.path.dirname(__file__), "public", "logo.png")
OUTPUT = os.path.join(os.path.dirname(__file__), "public", "logo.png")
BACKUP = os.path.join(os.path.dirname(__file__), "public", "logo-original.png")

THRESHOLD = 240   # pixels com R,G,B >= este valor são considerados "fundo branco"
FEATHER    = 10   # pixels de borda recebem alfa gradual (suaviza bordas)

def remove_white_background(img: Image.Image, threshold: int, feather: int) -> Image.Image:
    img = img.convert("RGBA")
    data = img.load()
    width, height = img.size

    for y in range(height):
        for x in range(width):
            r, g, b, a = data[x, y]
            brightness = (r + g + b) / 3
            if brightness >= threshold:
                # completamente transparente
                data[x, y] = (r, g, b, 0)
            elif brightness >= threshold - feather:
                # zona de transição – alfa proporcional
                ratio = (brightness - (threshold - feather)) / feather
                new_a = int(a * (1 - ratio))
                data[x, y] = (r, g, b, new_a)
    return img

def main():
    if not os.path.exists(INPUT):
        print(f"Arquivo não encontrado: {INPUT}")
        return

    # backup do original
    if not os.path.exists(BACKUP):
        import shutil
        shutil.copy(INPUT, BACKUP)
        print(f"Backup salvo em: {BACKUP}")

    img = Image.open(INPUT)
    result = remove_white_background(img, THRESHOLD, FEATHER)
    result.save(OUTPUT, "PNG")
    print(f"Logo com fundo transparente salvo em: {OUTPUT}")

if __name__ == "__main__":
    main()

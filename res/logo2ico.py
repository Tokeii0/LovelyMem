from PIL import Image

def png_to_ico(input_file, output_file):
    image = Image.open(input_file)
    image.save(output_file, format='ICO')

# Example usage
input_file = r'D:\pythonconda\Lovelymemprocfs\res\logo.png'
output_file = r'res\logo.ico'
png_to_ico(input_file, output_file)
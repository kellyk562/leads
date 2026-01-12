const { Jimp } = require('jimp');
const path = require('path');

async function generateIcons() {
  const sizes = [192, 512];
  const outputDir = path.join(__dirname, '../client/public');

  // Green color matching the app theme
  const bgColor = 0x2d5a27ff; // #2d5a27 with full opacity

  for (const size of sizes) {
    // Create a new image with the background color
    const image = new Jimp({ width: size, height: size, color: bgColor });

    // Save the image
    const filename = `logo${size}.png`;
    await image.write(path.join(outputDir, filename));
    console.log(`Created ${filename}`);
  }

  console.log('PWA icons generated successfully!');
}

generateIcons().catch(console.error);

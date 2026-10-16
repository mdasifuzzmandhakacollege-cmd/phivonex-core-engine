const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function generatePNGs() {
  const brandDir = path.join(__dirname, '../public/brand');
  if (!fs.existsSync(brandDir)) {
    fs.mkdirSync(brandDir, { recursive: true });
  }

  const svgContent = fs.readFileSync(path.join(brandDir, 'phivonex-favicon.svg'));

  // 512x512 App Icon
  await sharp(svgContent)
    .resize(512, 512)
    .png()
    .toFile(path.join(brandDir, 'phivonex-app-icon-512.png'));

  // Default app icon
  await sharp(svgContent)
    .resize(512, 512)
    .png()
    .toFile(path.join(brandDir, 'phivonex-app-icon.png'));

  // 192x192 App Icon
  await sharp(svgContent)
    .resize(192, 192)
    .png()
    .toFile(path.join(brandDir, 'phivonex-app-icon-192.png'));

  console.log('Brand PNG icons generated successfully in /public/brand/');
}

generatePNGs().catch(console.error);

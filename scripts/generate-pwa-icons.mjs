import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, '..', 'public', 'icons');

mkdirSync(publicDir, { recursive: true });

const icons = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'maskable-192.png', size: 192, maskable: true },
  { name: 'maskable-512.png', size: 512, maskable: true }
];

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawLogo(ctx, size, maskable) {
  const center = size / 2;
  const scale = maskable ? 0.35 : 0.42;
  const logoSize = size * scale;

  const green = '#28a745';
  const darkGreen = '#1e7e34';

  const barWidth = logoSize * 0.18;
  const barGap = logoSize * 0.06;
  const totalWidth = (barWidth * 3) + (barGap * 2);
  const startX = center - totalWidth / 2;

  const bars = [
    { height: logoSize * 0.45, color: green },
    { height: logoSize * 0.70, color: green },
    { height: logoSize * 0.95, color: darkGreen }
  ];

  bars.forEach((bar, index) => {
    const x = startX + (index * (barWidth + barGap));
    const y = center + (logoSize / 2) - bar.height;

    const gradient = ctx.createLinearGradient(x, y, x, y + bar.height);
    gradient.addColorStop(0, bar.color);
    gradient.addColorStop(1, index === 2 ? '#155724' : '#1e7e34');

    ctx.fillStyle = gradient;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = size * 0.01;
    ctx.shadowOffsetY = size * 0.005;

    const cornerRadius = barWidth * 0.15;
    roundRect(ctx, x, y, barWidth, bar.height, cornerRadius);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  });

  const baseY = center + (logoSize / 2) + (size * 0.01);
  ctx.fillStyle = '#6c757d';
  ctx.fillRect(startX - (barGap / 2), baseY, totalWidth + barGap, size * 0.008);
}

function generateIcon(size, maskable) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);

  drawLogo(ctx, size, maskable);

  return canvas;
}

icons.forEach(icon => {
  const canvas = generateIcon(icon.size, icon.maskable);
  const buffer = canvas.toBuffer('image/png');
  const filepath = join(publicDir, icon.name);
  writeFileSync(filepath, buffer);
});

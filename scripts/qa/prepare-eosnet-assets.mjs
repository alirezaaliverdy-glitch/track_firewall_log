// Deterministic pixel extraction, explicitly requested by the operator.
// Keep the supplied JPEG intact; only remove its background from new PNG assets.
import { readFileSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const source = readFileSync("/assets/eosnet-logo-source.jpg");
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const page = await browser.newPage();
  const assets = await page.evaluate(async (base64) => {
    const image = new Image(); image.src = `data:image/jpeg;base64,${base64}`; await image.decode();
    if (image.naturalWidth !== 844 || image.naturalHeight !== 1500) throw new Error("Unexpected reference dimensions");
    const width = 354, height = 280;
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 244, 204, width, height, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height), data = pixels.data;
    const alpha = new Float32Array(width * height), backgrounds = [];
    for (let y = 0; y < height; y++) {
      const background = [0, 1, 2].map(channel => {
        const samples = [];
        for (const x of [0, 1, 2, 3, width - 4, width - 3, width - 2, width - 1]) samples.push(data[(y * width + x) * 4 + channel]);
        samples.sort((a, b) => a - b); return (samples[3] + samples[4]) / 2;
      });
      backgrounds.push(background);
      for (let x = 0; x < width; x++) {
        const index = y * width + x, offset = index * 4;
        const contrast = Math.max(data[offset] - background[0], (data[offset + 1] - background[1]) * .85, (data[offset + 2] - background[2]) * .8);
        const value = Math.max(0, Math.min(1, (contrast - 4) / 14));
        alpha[index] = value * value * (3 - 2 * value);
      }
    }
    // Discard isolated JPEG/background noise and the unrelated shield line
    // reaching the crop boundary; retain the actual ribbon, dots and letters.
    const visited = new Uint8Array(alpha.length);
    for (let start = 0; start < alpha.length; start++) {
      if (visited[start] || alpha[start] < .04) continue;
      const queue = [start]; visited[start] = 1;
      let touchesBoundary = false, strong = 0;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const index = queue[cursor], x = index % width, y = Math.floor(index / width);
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBoundary = true;
        if (alpha[index] > .7) strong++;
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const neighbor = ny * width + nx;
          if (!visited[neighbor] && alpha[neighbor] >= .04) { visited[neighbor] = 1; queue.push(neighbor); }
        }
      }
      if (touchesBoundary || strong < 4 || queue.length < 9) for (const index of queue) alpha[index] = 0;
    }
    let transparent = 0;
    for (let index = 0; index < alpha.length; index++) {
      const opacity = alpha[index] < .04 ? 0 : alpha[index], offset = index * 4, background = backgrounds[Math.floor(index / width)];
      for (let channel = 0; channel < 3; channel++) data[offset + channel] = opacity ? Math.max(0, Math.min(255, (data[offset + channel] - (1 - opacity) * background[channel]) / opacity)) : 0;
      data[offset + 3] = Math.round(opacity * 255); if (!opacity) transparent++;
    }
    context.putImageData(pixels, 0, 0);
    const symbol = document.createElement("canvas"); symbol.width = 266; symbol.height = 220;
    symbol.getContext("2d").drawImage(canvas, 60, 0, 266, 220, 0, 0, 266, 220);
    return { lockup: canvas.toDataURL("image/png"), symbol: symbol.toDataURL("image/png"), transparent, total: alpha.length };
  }, source.toString("base64"));
  for (const name of ["lockup", "symbol"]) writeFileSync(`/assets/eosnet-${name}.png`, Buffer.from(assets[name].split(",")[1], "base64"));
  process.stdout.write(JSON.stringify({ ok: true, files: ["eosnet-lockup.png", "eosnet-symbol.png"], transparentPixels: assets.transparent, totalPixels: assets.total }));
} finally { await browser.close(); }

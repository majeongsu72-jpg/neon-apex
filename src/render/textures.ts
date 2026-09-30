import * as THREE from 'three';
import { seededRandom } from '../game/math';

export function textureFromCanvas(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  paint(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createAsphalt() {
  const random = seededRandom(334);
  const texture = textureFromCanvas(512, 512, ctx => {
    ctx.fillStyle = '#30353d'; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 36000; i++) {
      const light = Math.floor(32 + random() * 40);
      ctx.fillStyle = `rgba(${light},${light + 3},${light + 9},${.1 + random() * .3})`;
      ctx.fillRect(random() * 512, random() * 512, 1 + random(), 1 + random());
    }
    ctx.strokeStyle = '#1c2027'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(40, 0); ctx.lineTo(52, 180); ctx.lineTo(45, 360); ctx.lineTo(63, 512); ctx.stroke();
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function createFacade(seed: number, rows: number, color: string) {
  const random = seededRandom(seed);
  return textureFromCanvas(256, 512, ctx => {
    ctx.fillStyle = '#101723'; ctx.fillRect(0, 0, 256, 512);
    const rowH = 512 / rows;
    for (let row = 0; row < rows; row++) for (let col = 0; col < 9; col++) {
      const lit = random() > .42;
      ctx.fillStyle = lit ? (random() > .35 ? color : '#9b8b67') : '#1a2430';
      ctx.globalAlpha = lit ? .3 + random() * .7 : 1;
      ctx.fillRect(col * 28 + 5, row * rowH + 5, 12 + random() * 7, Math.max(3, rowH - 9));
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#080f19';
    for (let col = 0; col < 9; col++) ctx.fillRect(col * 28, 0, 2, 512);
  });
}

export function createGlowTexture() {
  return textureFromCanvas(128, 128, ctx => {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,.9)');
    gradient.addColorStop(.25, 'rgba(255,255,255,.5)');
    gradient.addColorStop(.7, 'rgba(255,255,255,.1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  });
}

export function createEnvironment(renderer: THREE.WebGLRenderer) {
  const texture = textureFromCanvas(1024, 512, ctx => {
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, '#102238'); gradient.addColorStop(.3, '#344957');
    gradient.addColorStop(.52, '#060b14'); gradient.addColorStop(1, '#060910');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1024, 512);
    ctx.fillStyle = '#c8e5f8'; ctx.fillRect(60, 105, 190, 38);
    ctx.fillStyle = '#f36aba'; ctx.fillRect(660, 195, 190, 48);
    ctx.fillStyle = '#42e7ed'; ctx.fillRect(320, 190, 75, 80);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(810, 95, 28, 140);
    ctx.fillStyle = '#648397'; ctx.fillRect(0, 320, 1024, 4);
  });
  texture.mapping = THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromEquirectangular(texture);
  generator.dispose(); texture.dispose();
  return target;
}

export function signTexture(text: string, subtitle = '', color = '#c5f83a', width = 1024, height = 256) {
  return textureFromCanvas(width, height, ctx => {
    ctx.fillStyle = '#060c18'; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.strokeRect(5, 5, width - 10, height - 10);
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `italic 800 ${Math.floor(height * .40)}px Rajdhani, Arial`;
    ctx.fillText(text, width / 2, height * (subtitle ? .42 : .5), width * .92);
    if (subtitle) {
      ctx.font = `${Math.floor(height * .09)}px Arial`; ctx.fillStyle = '#b5c4d5';
      ctx.fillText(subtitle, width / 2, height * .79, width * .9);
    }
  });
}

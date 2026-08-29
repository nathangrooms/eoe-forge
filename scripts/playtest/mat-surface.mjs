/**
 * IS THE MAT A SURFACE, OR A FLAT FIELD?
 *
 * The Playmat draws eight procedural layers and its own header records the
 * complaint that started them: "THE MAT IS A FLAT COLOUR ... no art, no texture
 * and no seat identity", measured then at a standard deviation of 6.56
 * luminance levels. This re-measures the SHIPPED pixels, off a real screenshot,
 * on patches of bare mat with no card on them.
 *
 * Standard deviation of luminance is the number: a printed cloth mat photographs
 * around 12 to 20, a flat fill is under 3, and a weave nobody can see is what
 * the last measurement called 6.5.
 */
import sharp from 'sharp';

const [, , file, ...patches] = process.argv;
const img = sharp(file);
const meta = await img.metadata();

/* Default patches: bare mat on each seat, chosen to miss cards and chrome. */
const boxes = patches.length
  ? patches.map(p => p.split(',').map(Number))
  : [[1100, 150, 300, 160], [1100, 520, 300, 160], [700, 620, 260, 140]];

console.log(`${file}  ${meta.width}x${meta.height}`);
for (const [left, top, width, height] of boxes) {
  const raw = await sharp(file).extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true });
  const { data, info } = raw;
  const ch = info.channels;
  const lums = [];
  for (let i = 0; i < data.length; i += ch) {
    lums.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
  }
  const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
  const sd = Math.sqrt(lums.reduce((a, b) => a + (b - mean) ** 2, 0) / lums.length);
  const min = Math.min(...lums), max = Math.max(...lums);
  console.log(`  patch ${left},${top} ${width}x${height}  mean L ${mean.toFixed(1)}  SD ${sd.toFixed(2)}  range ${min.toFixed(0)}..${max.toFixed(0)}`);
}

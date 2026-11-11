// Build light copies of the showcase models into site/lite/: fewer faces, smaller textures.
// The originals stay untouched; the page loads them with ?hq=1.
// Usage: node build-lite.mjs [carRatio]     (run from mars-car/tools)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptDecoder } from 'meshoptimizer';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, 'site');
const PY = 'E:/ClaudeCodeProject/.venv/Scripts/python.exe';
const CLI = path.join(import.meta.dirname, 'node_modules', '.bin', process.platform === 'win32' ? 'gltf-transform.cmd' : 'gltf-transform');
const carRatio = Number(process.argv[2] || 0.2);

// targets mirror the in-page tables (PART_TRIS/PART_TEX, SCENE_*, LINE_*)
const PART_TRIS = { battery:200000, castF:200000, castR:200000, cabin:200000, thermal:150000, du:150000, roof:120000, thruster:90000, susp:90000, vcu:80000, pdu:80000, bms:50000, harness:60000 };
const PART_TEX = { battery:2048, castF:2048, castR:2048, cabin:2048 };
const SCENE_TRIS = { lander:200000, astronaut:120000, mecha:250000 }, SCENE_TEX = { lander:2048, astronaut:1024, mecha:2048 };
const LINE_TRIS = { carrier:80000, agv:30000, rack:40000, worker:30000, gantry:60000, lift:50000, filler:50000, tunnel:80000 };
const LINE_TEX = { carrier:1024, agv:512, rack:512, worker:512, gantry:1024, lift:1024, filler:1024, tunnel:1024 };

const jobs = [];
const carSrc = fs.readdirSync(path.join(ROOT, 'model')).find(f => /^Hi3D_.*\.glb$/.test(f));
jobs.push({ src: path.join(ROOT, 'model', carSrc), out: path.join(SITE, 'lite', 'model', 'ares1.glb'), ratio: carRatio, tex: 4096 });
const addDir = (dir, tris, tex, def) => {
  const mf = JSON.parse(fs.readFileSync(path.join(SITE, dir, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
  const out = {};
  for (const [key, e] of Object.entries(mf)) {
    if (!e.file) continue;
    jobs.push({ src: path.join(SITE, dir, e.file), out: path.join(SITE, 'lite', dir, e.file), tris: tris[key] || def, tex: tex[key] || 1024 });
    out[key] = { file: e.file };
  }
  fs.mkdirSync(path.join(SITE, 'lite', dir), { recursive: true });
  fs.writeFileSync(path.join(SITE, 'lite', dir, 'manifest.json'), JSON.stringify(out));
};
addDir('parts', PART_TRIS, PART_TEX, 120000);
addDir('scene', SCENE_TRIS, SCENE_TEX, 120000);
addDir('line', LINE_TRIS, LINE_TEX, 40000);
const G1_TRIS = { interior:250000, door:100000, hood:100000, deck:60000, headlamp:60000, tailbar:40000 }, G1_TEX = { interior:2048, door:2048, hood:2048, deck:1024, headlamp:1024, tailbar:1024 };
if (fs.existsSync(path.join(SITE, 'g1', 'manifest.json'))) addDir('g1', G1_TRIS, G1_TEX, 80000);

const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
await MeshoptSimplifier.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lite-'));
const tris = doc => doc.getRoot().listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getIndices() ? p.getIndices().getCount() / 3 : 0), 0), 0);

for (const j of jobs) {
  if (only && !only.test(j.out)) continue;
  const t0 = Date.now();
  const doc = await io.read(j.src);
  // gltfpack inputs store quantized integer positions; turn them back into floats before simplifying,
  // otherwise the re-quantization step collapses every vertex to zero
  await doc.transform(dequantize());
  for (const ext of doc.getRoot().listExtensionsUsed()) if (/meshopt_compression|mesh_quantization/i.test(ext.extensionName)) ext.dispose();
  const before = tris(doc);
  const ratio = j.ratio ?? Math.min(1, j.tris / before);
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.03, lockBorder: true }));
  for (const tex of doc.getRoot().listTextures()) {
    const img = tex.getImage(); if (!img) continue;
    const a = path.join(tmp, 'in'), b = path.join(tmp, 'out.jpg');
    fs.writeFileSync(a, img);
    const r = spawnSync(PY, ['-I', path.join(import.meta.dirname, 'resize_tex.py'), a, b, String(j.tex)], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('resize failed: ' + r.stderr);
    tex.setImage(new Uint8Array(fs.readFileSync(b))).setMimeType('image/jpeg');
  }
  fs.mkdirSync(path.dirname(j.out), { recursive: true });
  const raw = j.out.replace(/\.glb$/, '.raw.glb');
  await io.write(raw, doc);
  const c = spawnSync(CLI, ['meshopt', raw, j.out, '--level', 'medium'], { encoding: 'utf8', shell: true });
  if (c.status !== 0) throw new Error('meshopt failed: ' + c.stderr);
  fs.unlinkSync(raw);
  const mb = s => (fs.statSync(s).size / 1048576).toFixed(1);
  console.log(`${path.relative(SITE, j.out)}  ${before} -> ${tris(doc)} faces, tex ${j.tex}, ${mb(j.src)} MB -> ${mb(j.out)} MB, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
fs.rmSync(tmp, { recursive: true, force: true });

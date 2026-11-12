// ARES-1 experience mode: the viewer turns on the camera, is dressed in a racing helmet and suit (drawn over the
// camera picture from body landmarks), then drives the rover across Mars by holding an imaginary steering wheel.
// Hands level = straight ahead, tilt them like a wheel = turn, hands down = stop. Arrow keys work without a camera.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MP = new URL('./vendor/mediapipe/', import.meta.url).href;   // pose library, wasm and model are served locally
const DEBUG = new URLSearchParams(location.search).has('seek');

const CSS = `
.xp{position:fixed;inset:0;z-index:80;background:#11151a;color:#e8ecef;font-family:var(--f-body,system-ui,sans-serif);overflow:hidden;user-select:none}
.xp canvas.xp-gl{position:absolute;inset:0;width:100%;height:100%;display:block}
.xp-top{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:12px;padding:12px 16px;background:linear-gradient(#0b0e12cc,#0b0e1200)}
.xp-title{font-family:var(--f-display,sans-serif);font-size:24px;font-weight:700;letter-spacing:.04em}
.xp-title b{color:#ee8743}
.xp-title span{font-family:var(--f-body,sans-serif);font-size:13px;font-weight:400;color:#c3ccd4;margin-left:10px;letter-spacing:0}
.xp-btns{margin-left:auto;display:flex;gap:8px}
.xp button{font:inherit;color:#e8ecef;background:#1f262ecc;border:1px solid #ffffff33;border-radius:3px;padding:6px 14px;cursor:pointer}
.xp button:hover{border-color:#ee8743}
.xp button.go{background:#ee8743;border-color:#ee8743;color:#14181d;font-weight:700;font-size:15px;padding:9px 22px}
.xp-hud{position:absolute;left:16px;top:64px;display:grid;gap:6px;min-width:170px;background:#11151ab8;border:1px solid #ffffff22;border-left:3px solid #ee8743;border-radius:4px;padding:10px 14px}
.xp-hud .big{font-family:var(--f-display,sans-serif);font-size:44px;font-weight:600;line-height:1}
.xp-hud .big small{font-size:14px;color:#aab4bd;margin-left:6px;font-family:var(--f-body,sans-serif);font-weight:400}
.xp-hud .row{display:flex;justify-content:space-between;gap:16px;font-size:13px;color:#aab4bd}
.xp-hud .row b{color:#e8ecef;font-family:var(--f-mono,monospace);font-weight:600}
.xp-cam{position:absolute;left:16px;top:calc(100% - 16px);transform:translate(0,-100%);width:min(30vw,380px);border:1px solid #ffffff44;border-radius:6px;overflow:hidden;background:#0b0e12;transition:left .6s,top .6s,width .6s,transform .6s;box-shadow:0 10px 30px #0008}
.xp-cam canvas{display:block;width:100%;height:auto}
.xp-cam .cap{position:absolute;left:0;right:0;bottom:0;padding:5px 10px;font-size:12px;background:#0b0e12b0;display:flex;justify-content:space-between;gap:8px}
.xp-cam .cap b{color:#4db3da}
.xp--suit .xp-cam{left:50%;top:44%;transform:translate(-50%,-50%);width:min(70vw,96vh,820px)}
.xp-start{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);width:min(680px,calc(100% - 32px));text-align:center;display:grid;gap:10px;justify-items:center}
.xp-start p{margin:0;font-size:14px;color:#d5dce2;text-shadow:0 1px 4px #000}
.xp-start .hold{width:220px;height:4px;background:#ffffff2a;border-radius:2px;overflow:hidden}
.xp-start .hold i{display:block;height:100%;width:0;background:#4db3da}
.xp-steer{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);width:min(460px,calc(100% - 32px));text-align:center;font-size:13px;color:#d5dce2;background:#11151ac8;border:1px solid #ffffff22;border-radius:6px;padding:8px 16px 10px}
.xp-steer .bar{position:relative;height:8px;border-radius:4px;background:#ffffff2a;margin:8px auto 10px}
.xp-steer .bar::after{content:"";position:absolute;left:50%;top:-4px;width:1px;height:16px;background:#ffffff88}
.xp-steer .bar i{position:absolute;top:-5px;width:18px;height:18px;margin-left:-9px;border-radius:50%;background:#ee8743;border:2px solid #fff;left:50%}
.xp-steer .st{font-family:var(--f-display,sans-serif);font-size:26px;font-weight:600;letter-spacing:.08em;color:#fff}
.xp-msg{position:absolute;left:50%;top:76px;transform:translateX(-50%);background:#11151ad0;border:1px solid #4db3da;border-radius:4px;padding:8px 16px;font-size:14px;opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap}
.xp-msg.on{opacity:1}
.xp--suit .xp-hud,.xp--suit .xp-steer,.xp--suit [data-xp=view],.xp--suit [data-xp=jump]{display:none}
.xp:not(.xp--suit) .xp-start{display:none}
.xp video{position:absolute;width:2px;height:2px;opacity:0;pointer-events:none}
@media (max-width:700px){.xp-cam{width:42vw}.xp-hud .big{font-size:32px}.xp-title span{display:none}}
`;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hash = (i, j, k = 0) => { const s = Math.sin(i*127.1 + j*311.7 + k*74.7)*43758.5453; return s - Math.floor(s); };
// terrain height = long gentle dunes + impact craters on two scales (bowl with a raised rim, slopes stay drivable)
const dunes = (x, z) => 1.6*Math.sin(x*.021 + 1.3)*Math.cos(z*.017) + .9*Math.sin(x*.05 + z*.043) + .35*Math.sin(x*.13 - .7)*Math.sin(z*.11 + 2);
const CRATERS = [[130, .62, 13, 30, .2, 1], [520, .55, 55, 95, .14, 2]];   // grid, chance, r min, r max, depth / r, seed
function craters(x, z){
  let h = 0;
  for (const [G, pr, r0, r1, dk, k] of CRATERS) { const ci = Math.floor(x/G), cj = Math.floor(z/G);
    for (let i=ci-1;i<=ci+1;i++) for (let j=cj-1;j<=cj+1;j++){ if (hash(i, j, 10 + k) > pr) continue;
      const cx = (i + .25 + hash(i, j, 20 + k)*.5)*G, cz = (j + .25 + hash(i, j, 30 + k)*.5)*G, r = r0 + hash(i, j, 40 + k)*(r1 - r0);
      if (Math.hypot(cx, cz) < r + 25) continue;                      // keep the start area flat
      const d = Math.hypot(x - cx, z - cz)/r; if (d > 1.7) continue;
      const dep = r*dk, q = 1 - d*d, e = (d - 1)/.22; h += (d < 1 ? -dep*q*q : 0) + dep*.28*Math.exp(-e*e); } }
  return h;
}
const H = (x, z) => dunes(x, z) + craters(x, z);

let active = null;
export async function openExperience(opts = {}){
  if (active) return; active = {};
  if (!document.getElementById('xp-css')) { const s = document.createElement('style'); s.id = 'xp-css'; s.textContent = CSS; document.head.appendChild(s); }
  const root = document.createElement('div'); root.className = 'xp xp--suit';
  root.innerHTML = `<canvas class="xp-gl"></canvas>
    <div class="xp-top"><div class="xp-title">ARES<b>-1</b><span>体验模式 · 摄像头驾驶</span></div>
      <div class="xp-btns"><button type="button" data-xp="jump">跳跃 ⤒</button><button type="button" data-xp="view">切换视角</button><button type="button" data-xp="exit">退出体验</button></div></div>
    <div class="xp-hud"><div class="big"><span data-v="kmh">0</span><small>km/h</small></div>
      <div class="row"><span>航向</span><b data-v="hdg">000°</b></div><div class="row"><span>里程</span><b data-v="odo">0 m</b></div>
      <div class="row"><span>离地高度</span><b data-v="alt">0.0 m</b></div><div class="row"><span>推进剂</span><b data-v="fuel">180 kg</b></div>
      <div class="row"><span>能量信标</span><b data-v="bc">0</b></div><div class="row"><span>最近信标</span><b data-v="near">—</b></div></div>
    <div class="xp-cam"><canvas width="640" height="480"></canvas><div class="cap"><span data-v="camst">正在打开摄像头…</span><b data-v="camhint"></b></div></div>
    <div class="xp-start"><p data-v="tip">允许使用摄像头后，你会戴上头盔、穿上赛车服。</p><div class="hold"><i></i></div>
      <button type="button" class="go" data-xp="enter">进入火星车</button></div>
    <div class="xp-steer"><div class="st" data-v="st">停车</div><div class="bar"><i></i></div>
      <div data-v="help">双手抬平 = 直行 · 倾斜双手 = 转向 · 双手举过头顶 = 跳跃 · 放下双手 = 停车</div></div>
    <div class="xp-msg"></div><video playsinline muted></video>`;
  document.body.appendChild(root); window.__xpActive = true;
  const $v = k => root.querySelector(`[data-v="${k}"]`), glCanvas = root.querySelector('.xp-gl'), camCanvas = root.querySelector('.xp-cam canvas'), video = root.querySelector('video');
  const cctx = camCanvas.getContext('2d');
  const S = { stage:'suit', view:'cockpit', x:0, z:0, th:0, speed:0, steer:0, steerT:0, odo:0, beacons:0, hold:0, t:0, y:0, vy:0, alt:0, fuel:10, jet:0, jetCd:0, shake:0, jumpReq:false, high:false, scr:0, keys:{}, pose:null, handsUp:false, camOk:false, raf:0, lastVt:-1, lastDet:0 };

  /* ------------------------------------------------------------ world */
  const renderer = new THREE.WebGLRenderer({ canvas:glCanvas, antialias:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(), HAZE = 0xd3a17e;
  scene.background = new THREE.Color(HAZE); scene.fog = new THREE.Fog(HAZE, 70, 300);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(renderer), .04).texture;
  scene.add(new THREE.HemisphereLight(0xffe6d0, 0x6b3a22, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2e2, 2.2); sun.position.set(-40, 60, -30); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(60, 1, .1, 1600);
  const tex = (w, h, draw, rep) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; } return t; };
  // sky dome, small bluish sun, far mesas: all follow the rover so the horizon never gets closer
  const far = new THREE.Group(); scene.add(far);
  far.add(new THREE.Mesh(new THREE.SphereGeometry(1200, 24, 12), new THREE.MeshBasicMaterial({ side:THREE.BackSide, fog:false, depthWrite:false,
    map:tex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7d5644'); gr.addColorStop(.38, '#b98263'); gr.addColorStop(.5, '#dcae8a'); gr.addColorStop(1, '#dcae8a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }) })));
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(16, 24), new THREE.MeshBasicMaterial({ color:0xf4fbff, fog:false, transparent:true, opacity:.95 })); sunDisc.position.set(-520, 300, -760); sunDisc.lookAt(0, 0, 0); far.add(sunDisc);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(70, 24), new THREE.MeshBasicMaterial({ color:0xbfe0ff, fog:false, transparent:true, opacity:.16, depthWrite:false })); glow.position.copy(sunDisc.position).multiplyScalar(.99); glow.lookAt(0, 0, 0); far.add(glow);
  [[300, 520, 640, 5], [-640, 380, 300, 3]].forEach(([mx, my, mz, r]) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 16), new THREE.MeshBasicMaterial({ color:0xe9d9cc, fog:false, transparent:true, opacity:.8 })); m.position.set(mx, my, mz); m.lookAt(0, 0, 0); far.add(m); });   // Phobos, Deimos
  const devil = new THREE.Mesh(new THREE.CylinderGeometry(7, 1.2, 46, 14, 6, true).translate(0, 23, 0), new THREE.MeshBasicMaterial({ color:0xc99a78, transparent:true, opacity:.28, depthWrite:false, side:THREE.DoubleSide })); scene.add(devil);
  const mesaM = new THREE.MeshBasicMaterial({ color:0xb07a5c, fog:false });
  for (let i=0;i<18;i++){ const a = i/18*Math.PI*2 + hash(i,1)*.3, r = 640 + hash(i,2)*160, w = 60 + hash(i,3)*150, hgt = 18 + hash(i,4)*55;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(w*.55, w, hgt, 7, 1), mesaM); m.position.set(Math.cos(a)*r, hgt/2 - 6, Math.sin(a)*r); m.rotation.y = hash(i,5)*3; far.add(m); }
  // ground: a grid patch that re-centres under the rover; vertices stay on a fixed world lattice so nothing swims
  const CELL = 4, SEG = 150, groundGeo = new THREE.PlaneGeometry(CELL*SEG, CELL*SEG, SEG, SEG).rotateX(-Math.PI/2);
  const base = groundGeo.attributes.position.array.slice();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color:0xffffff, roughness:.96, metalness:0, vertexColors:true,
    map:tex(512, 512, (g, w, h) => { g.fillStyle = '#a8603a'; g.fillRect(0, 0, w, h);
      for (let i=0;i<9000;i++){ const v = Math.random(); g.fillStyle = v < .5 ? `rgba(70,32,18,${.05 + Math.random()*.12})` : `rgba(226,160,110,${.05 + Math.random()*.1})`; const s = 1 + Math.random()*5; g.fillRect(Math.random()*w, Math.random()*h, s, s*(.5 + Math.random())); }
      for (let i=0;i<60;i++){ g.fillStyle = `rgba(60,28,16,${.08 + Math.random()*.1})`; g.beginPath(); g.ellipse(Math.random()*w, Math.random()*h, 6 + Math.random()*22, 3 + Math.random()*10, Math.random()*3, 0, 7); g.fill(); } }, true) }));
  groundGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(base.length).fill(1), 3));
  scene.add(ground);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0), RC = 16, RR = 14;
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color:0x7d4a33, roughness:.95, flatShading:true }), (2*RR+1)*(2*RR+1)); rocks.frustumCulled = false; scene.add(rocks);
  // energy beacons to drive to
  const BC = 70, beaconPool = [], taken = new Set();
  for (let i=0;i<10;i++){ const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(.22, .3, 3.2, 10).translate(0, 1.6, 0), new THREE.MeshStandardMaterial({ color:0x2a6fd6, emissive:0x2f9bff, emissiveIntensity:2.2, roughness:.3 })));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, 60, 12, 1, true).translate(0, 30, 0), new THREE.MeshBasicMaterial({ color:0x6fd3ff, transparent:true, opacity:.12, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, fog:false })));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3, .08, 6, 40).rotateX(Math.PI/2), new THREE.MeshBasicMaterial({ color:0x6fd3ff })); ring.position.y = .25; g.add(ring); g.userData.ring = ring;
    g.visible = false; scene.add(g); beaconPool.push(g); }
  const beaconAt = (i, j) => hash(i, j, 9) < .55 && (i || j) ? { key:i+','+j, x:(i + .2 + hash(i,j,3)*.6)*BC, z:(j + .2 + hash(i,j,4)*.6)*BC } : null;
  let gcx = 1e9, gcz = 1e9;
  function recenter(force){
    const cx = Math.round(S.x/CELL)*CELL, cz = Math.round(S.z/CELL)*CELL;
    if (!force && Math.abs(cx - gcx) < 12 && Math.abs(cz - gcz) < 12) return; gcx = cx; gcz = cz;
    const P = groundGeo.attributes.position.array, U = groundGeo.attributes.uv.array, Cc = groundGeo.attributes.color.array;
    for (let i=0, n=P.length/3; i<n; i++){ const wx = base[i*3] + cx, wz = base[i*3+2] + cz; const dh = craters(wx, wz); P[i*3+1] = dunes(wx, wz) + dh; U[i*2] = wx/13; U[i*2+1] = wz/13;
      const sh = clamp(1 + dh*.045, .55, 1.22); Cc[i*3] = sh; Cc[i*3+1] = sh*(dh < 0 ? .93 : 1); Cc[i*3+2] = sh*(dh < 0 ? .88 : 1); }   // darker crater floors, pale rims
    ground.position.set(cx, 0, cz); groundGeo.attributes.position.needsUpdate = true; groundGeo.attributes.uv.needsUpdate = true; groundGeo.attributes.color.needsUpdate = true; groundGeo.computeVertexNormals();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(); let n = 0;
    const ci = Math.round(S.x/RC), cj = Math.round(S.z/RC);
    for (let i=ci-RR;i<=ci+RR;i++) for (let j=cj-RR;j<=cj+RR;j++){ if (hash(i,j) > .55 || (Math.abs(i) < 1 && Math.abs(j) < 1)) continue;
      const x = (i + hash(i,j,1))*RC, z = (j + hash(i,j,2))*RC, s = .15 + Math.pow(hash(i,j,5), 4)*2.8;
      p.set(x, H(x, z) + s*.25, z); e.set(hash(i,j,6)*6, hash(i,j,7)*6, 0); q.setFromEuler(e); sc.set(s*(1 + hash(i,j,8)*.8), s*.7, s); m.compose(p, q, sc); rocks.setMatrixAt(n++, m); }
    rocks.count = n; rocks.instanceMatrix.needsUpdate = true;
    const bi = Math.round(S.x/BC), bj = Math.round(S.z/BC); let k = 0;
    for (let i=bi-2;i<=bi+2;i++) for (let j=bj-2;j<=bj+2;j++){ const b = beaconAt(i, j); if (!b || taken.has(b.key) || k >= beaconPool.length) continue;
      const g = beaconPool[k++]; g.position.set(b.x, H(b.x, b.z), b.z); g.visible = true; g.userData.b = b; }
    for (; k<beaconPool.length; k++) { beaconPool[k].visible = false; beaconPool[k].userData.b = null; }
  }

  /* ------------------------------------------------------------ rover */
  // yaw -> tilt -> (car model | cockpit). Local +x is forward, +z is the driver's right.
  const yaw = new THREE.Group(), tilt = new THREE.Group(); yaw.add(tilt); scene.add(yaw);
  let car = null; try { car = opts.buildCar ? opts.buildCar() : null; } catch (e) { console.warn('experience: car model unavailable', e); }
  if (!car) { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.3, 2.3), new THREE.MeshStandardMaterial({ color:0xc9ced3, metalness:.9, roughness:.35 })); m.position.y = 1.4; g.add(m); car = { group:g, wheels:[] }; }
  tilt.add(car.group);
  // Cockpit in the vehicle's own language: brushed stainless, graphite hex armour, orange accents, blue LED lines, faceted shapes.
  const cockpit = new THREE.Group(); tilt.add(cockpit);
  const brushedT = tex(256, 256, (g, w, h) => { g.fillStyle = '#c4c8cc'; g.fillRect(0, 0, w, h); for (let i=0;i<1600;i++){ const y = Math.random()*h, xx = Math.random()*w, l = 20 + Math.random()*140, v = 175 + Math.random()*60|0; g.strokeStyle = 'rgba(' + v + ',' + (v+2) + ',' + (v+5) + ',.35)'; g.lineWidth = Math.random() < .85 ? 1 : 2; g.beginPath(); g.moveTo(xx, y); g.lineTo(xx + l, y); g.stroke(); } }, true);
  const hexT = tex(256, 256, (g, w, h) => { g.fillStyle = '#30353a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#1b1e22'; g.lineWidth = 3; const r = 16, dx = r*Math.sqrt(3);
    for (let row=-1; row<h/(r*1.5)+1; row++) for (let col=-1; col<w/dx+1; col++){ const cx = col*dx + (row%2 ? dx/2 : 0), cy = row*r*1.5; g.beginPath(); for (let k=0;k<6;k++){ const a = Math.PI/3*k + Math.PI/6; g.lineTo(cx + r*Math.cos(a), cy + r*Math.sin(a)); } g.closePath(); g.stroke(); } }, true); hexT.repeat.set(3, 1.2);
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color:c, roughness:.6, metalness:.3, ...o });
  const st = mat(0xdadee2, { map:brushedT, metalness:.92, roughness:.32 }), dk = mat(0x2c3136, { metalness:.4, roughness:.6 }), hx = mat(0xffffff, { map:hexT, metalness:.3, roughness:.7 }),
    or = mat(0xe2701c, { emissive:0x3a1400, roughness:.45 }), led = new THREE.MeshBasicMaterial({ color:0x4db3ff }), fab = mat(0xe9e7e1, { roughness:.9, metalness:0 });
  const bx = (w, h, d, m, px, py, pz, par = cockpit) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(px, py, pz); par.add(o); return o; };
  const wedge = (pts, depth, m) => { const s = new THREE.Shape(); pts.forEach(([a, b], i) => i ? s.lineTo(a, b) : s.moveTo(a, b)); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled:false }); g.translate(0, 0, -depth/2); const o = new THREE.Mesh(g, m); cockpit.add(o); return o; };
  wedge([[1.95,1.2],[4.1,1.08],[4.15,1.2],[2.0,1.42]], 2.34, st);                                   // faceted bonnet
  wedge([[2.2,1.4],[3.9,1.21],[3.9,1.24],[2.2,1.45]], .8, hx);                                       // hex armour spine
  [-1, 1].forEach(s => { bx(.5, .05, .06, or, 3.95, 1.24, s*.95); const mast = bx(.03, .22, .03, dk, 3.7, 1.36, s*1.05); bx(.05, .05, .05, led, 3.7, 1.48, s*1.05); });   // tow hooks, marker lamps
  wedge([[1.22,1.02],[2.15,1.02],[2.15,1.5],[1.78,1.58],[1.3,1.4]], 2.4, st);                        // dashboard block
  wedge([[1.3,1.4],[1.78,1.58],[1.8,1.6],[1.29,1.425]], 2.3, hx);                                    // armour pad on top
  bx(.012, .016, 2.3, led, 1.292, 1.392, 0); bx(.012, .03, 1.0, or, 1.24, 1.1, 0);
  // two live screens: instrument strip ahead of the driver, navigation radar to the right
  const mkScreen = (w, h, pw, ph) => { const c = document.createElement('canvas'); c.width = pw; c.height = ph; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map:t, toneMapped:false })); m.rotation.y = -Math.PI/2; cockpit.add(m); return { c, g:c.getContext('2d'), t, m }; };
  const strip = mkScreen(.74, .1, 592, 80); strip.m.position.set(1.5, 1.545, 0); strip.m.rotateX(-.5); bx(.03, .13, .8, dk, 1.52, 1.54, 0).rotation.z = .5;
  const radar = mkScreen(.42, .3, 336, 240); radar.m.position.set(1.262, 1.22, .62); radar.m.rotateX(-.12); bx(.03, .34, .46, dk, 1.28, 1.22, .62);
  function drawScreens(near, nd){
    let g = strip.g; g.fillStyle = '#06131d'; g.fillRect(0, 0, 592, 80); g.textBaseline = 'middle'; g.font = '600 46px "Barlow Condensed",sans-serif'; g.fillStyle = '#e8f4ff'; g.textAlign = 'right'; g.fillText(String(Math.round(S.speed*3.6)), 150, 42);
    g.font = '18px "JetBrains Mono",monospace'; g.fillStyle = '#6fb6e6'; g.textAlign = 'left'; g.fillText('km/h', 158, 50);
    g.fillText('HDG ' + String(Math.round(((90 - S.th*180/Math.PI) % 360 + 360) % 360)).padStart(3, '0'), 250, 28); g.fillText('ALT ' + S.alt.toFixed(1) + ' m', 250, 56);
    g.fillStyle = '#ee8743'; g.fillText('PROP', 410, 28); for (let i=0;i<10;i++){ g.fillStyle = i < S.fuel ? '#ee8743' : '#1d3346'; g.fillRect(410 + i*17, 44, 13, 20); }
    strip.t.needsUpdate = true;
    g = radar.g; g.fillStyle = '#06131d'; g.fillRect(0, 0, 336, 240); g.strokeStyle = '#1d4a68'; g.lineWidth = 1; [40, 80, 115].forEach(r => { g.beginPath(); g.arc(168, 130, r, 0, 7); g.stroke(); });
    g.beginPath(); g.moveTo(168, 10); g.lineTo(168, 236); g.moveTo(40, 130); g.lineTo(296, 130); g.stroke();
    const c = Math.cos(S.th), s = Math.sin(S.th), SC = 115/160;     // 160 m radius, forward is up
    const plot = (wx, wz, col, r) => { const dx = wx - S.x, dz = wz - S.z, f = dx*c - dz*s, rt = dx*s + dz*c; if (f*f + rt*rt > 160*160) return; g.fillStyle = col; g.beginPath(); g.arc(168 + rt*SC, 130 - f*SC, r, 0, 7); g.fill(); };
    for (const [G, pr, r0, r1, , k] of CRATERS) { const ci = Math.floor(S.x/G), cj = Math.floor(S.z/G); for (let i=ci-2;i<=ci+2;i++) for (let j=cj-2;j<=cj+2;j++){ if (hash(i, j, 10 + k) > pr) continue;
      const cx = (i + .25 + hash(i, j, 20 + k)*.5)*G, cz = (j + .25 + hash(i, j, 30 + k)*.5)*G, r = r0 + hash(i, j, 40 + k)*(r1 - r0); if (Math.hypot(cx, cz) < r + 25) continue;
      const dx = cx - S.x, dz = cz - S.z, f = dx*c - dz*s, rt = dx*s + dz*c; if (Math.hypot(f, rt) > 160 + r) continue; g.strokeStyle = '#a8603a'; g.lineWidth = 2; g.beginPath(); g.arc(168 + rt*SC, 130 - f*SC, r*SC, 0, 7); g.stroke(); } }
    beaconPool.forEach(b => { if (b.visible && b.userData.b) plot(b.userData.b.x, b.userData.b.z, '#6fd3ff', 5); });
    g.fillStyle = '#ee8743'; g.beginPath(); g.moveTo(168, 120); g.lineTo(175, 138); g.lineTo(161, 138); g.closePath(); g.fill();
    g.font = '14px "JetBrains Mono",monospace'; g.fillStyle = '#6fb6e6'; g.textAlign = 'left'; g.fillText('NAV 160 m', 10, 18); g.textAlign = 'right'; g.fillText(near ? 'BEACON ' + Math.round(nd) + ' m' : 'NO BEACON', 326, 18);
    radar.t.needsUpdate = true;
  }
  [-1, 1].forEach(s => { const p = bx(.15, 1.3, .13, st, 1.72, 2.04, s*1.1); p.rotation.z = .52; p.rotation.x = -s*.1; bx(1.7, .09, .1, st, .85, 1.44, s*1.17); bx(.3, .02, .02, led, 1.2, 1.5, s*1.12); });   // A pillars, door tops
  bx(.6, .1, 2.34, dk, 1.2, 2.6, 0); bx(.012, .014, 1.6, led, 1.49, 2.555, 0); bx(.3, .06, .5, hx, 1.2, 2.53, 0); [-1, 1].forEach(s => bx(.05, .05, .22, or, 1.28, 2.5, s*.75));   // roof header, console, grab handles
  // yoke with suit gloves on the grips
  const wheelG = new THREE.Group(); wheelG.position.set(1.42, 1.4, 0); wheelG.rotation.set(0, -Math.PI/2, 0); wheelG.rotateX(-.42); cockpit.add(wheelG);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(.03, .04, .3, 12).rotateX(Math.PI/2), dk); col.position.z = -.16; wheelG.add(col);
  const rim = new THREE.Group(); wheelG.add(rim);
  bx(.14, .1, .035, st, 0, 0, 0, rim); bx(.05, .012, .04, led, 0, .03, .003, rim); bx(.4, .034, .03, dk, 0, -.085, 0, rim);
  [-1, 1].forEach(s => { bx(.15, .03, .025, dk, s*.125, 0, 0, rim); bx(.05, .2, .05, dk, s*.2, .0, 0, rim); bx(.054, .03, .054, or, s*.2, .085, 0, rim); bx(.054, .03, .054, or, s*.2, -.06, 0, rim);
    const gl = new THREE.Mesh(new THREE.SphereGeometry(.052, 16, 12), fab); gl.scale.set(1, 1.3, 1.15); gl.position.set(s*.2, .012, .022); rim.add(gl);
    const pad = new THREE.Mesh(new THREE.SphereGeometry(.04, 12, 8), dk); pad.scale.set(1, 1.1, .5); pad.position.set(s*.2, .02, .07); rim.add(pad);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .022, 16), st); ring.position.set(s*.207, -.035, .06); ring.rotation.x = .9; rim.add(ring);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.046, .055, .16, 14), fab); cuff.position.set(s*.214, -.085, .12); cuff.rotation.x = .9; rim.add(cuff); });
  // jump thrusters: four plumes under the body, shown while the engines fire
  const jets = new THREE.Group(); tilt.add(jets); jets.visible = false;
  [[1.7, .95], [1.7, -.95], [-1.9, .95], [-1.9, -.95]].forEach(([jx, jz]) => { const m = new THREE.Mesh(new THREE.ConeGeometry(.42, 2.6, 14, 1, true).translate(0, -1.3, 0), new THREE.MeshBasicMaterial({ color:0xbfe6ff, transparent:true, opacity:.55, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, fog:false })); m.position.set(jx, .55, jz); jets.add(m);
    const core = new THREE.Mesh(new THREE.ConeGeometry(.16, 1.5, 10, 1, true).translate(0, -.75, 0), new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:.8, blending:THREE.AdditiveBlending, depthWrite:false, fog:false })); core.position.set(jx, .55, jz); jets.add(core); });
  const dust = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(240*3).fill(-999), 3)), new THREE.PointsMaterial({ color:0xd9a27c, size:2.4, transparent:true, opacity:.5, depthWrite:false, map:tex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }) }));
  dust.frustumCulled = false; scene.add(dust); const dustS = Array.from({ length:240 }, () => ({ life:1, v:new THREE.Vector3() })); let dustI = 0;

  /* ------------------------------------------------------------ camera + pose */
  let stream = null, pose = null, fakePose = null;
  async function startCamera(){
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器或地址不支持摄像头（需要 https 或 localhost）');
      stream = await navigator.mediaDevices.getUserMedia({ video:{ width:{ ideal:640 }, height:{ ideal:480 }, facingMode:'user' }, audio:false });
      if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = stream; await video.play(); camCanvas.width = video.videoWidth || 640; camCanvas.height = video.videoHeight || 480; S.camOk = true;
      $v('camst').textContent = '正在加载姿态识别…';
      const { FilesetResolver, PoseLandmarker } = await import(MP + 'vision_bundle.mjs');
      const fs = await FilesetResolver.forVisionTasks(MP + 'wasm');
      const mk = delegate => PoseLandmarker.createFromOptions(fs, { baseOptions:{ modelAssetPath:MP + 'pose_landmarker_lite.task', delegate }, runningMode:'VIDEO', numPoses:1 });
      try { pose = await mk('GPU'); } catch (e) { pose = await mk('CPU'); }
      if (!active) { pose.close(); pose = null; return; }
      $v('camst').textContent = '请站到画面中央，露出上半身'; $v('tip').textContent = '双手像握方向盘一样抬平，保持 1.5 秒自动上车；也可以直接点下面的按钮。';
    } catch (e) {
      console.warn('experience: camera', e); S.camOk = S.camOk && !!stream;
      $v('camst').textContent = S.camOk ? '姿态识别加载失败，改用键盘' : '未能打开摄像头';
      $v('tip').textContent = (e && e.name === 'NotAllowedError' ? '摄像头权限被拒绝。' : (e && e.name === 'NotFoundError' ? '没有找到摄像头。' : '摄像头不可用。')) + '仍可用键盘驾驶：↑ 前进，← → 转向。';
    }
  }
  const ema = (a, b, k) => { a.x += (b.x - a.x)*k; a.y += (b.y - a.y)*k; a.v = b.v; };
  function readPose(now){
    let lm = fakePose;
    if (!lm && pose && video.readyState >= 2 && video.currentTime !== S.lastVt && now - S.lastDet > 30) {
      S.lastVt = video.currentTime; S.lastDet = now;
      try { const r = pose.detectForVideo(video, now); lm = r.landmarks && r.landmarks[0] ? r.landmarks[0] : false; } catch (e) { lm = undefined; }
    } else if (!lm) lm = undefined;
    if (lm === undefined) return;                       // no new frame: keep the last pose
    if (!lm) { S.pose = null; S.handsUp = false; S.steerT = 0; return; }
    const W = camCanvas.width, Hh = camCanvas.height, pts = lm.map(p => ({ x:(1 - p.x)*W, y:p.y*Hh, v:p.visibility ?? 1 }));   // mirrored, in pixels
    if (!S.pose) S.pose = pts; else pts.forEach((p, i) => ema(S.pose[i], p, .55));
    const p = S.pose, sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) || 1, L = p[15], R = p[16];
    S.handsUp = L.v > .5 && R.v > .5 && Math.max(L.y, R.y) < Math.max(p[11].y, p[12].y) + sw*.8 && Math.abs(L.x - R.x) > sw*.25;
    // like a steering wheel: left hand lower than the right = turning left
    const ang = Math.atan2(L.y - R.y, Math.max(1, Math.abs(L.x - R.x))); S.ang = ang;
    const DEAD = .12, MAX = .7, a = Math.abs(ang);
    S.steerT = S.handsUp && a > DEAD ? Math.sign(ang)*clamp((a - DEAD)/(MAX - DEAD), 0, 1) : 0;
    const high = L.v > .5 && R.v > .5 && Math.max(L.y, R.y) < p[0].y - sw*.1;   // both hands above the head = fire the jump thrusters
    if (high && !S.high) S.jumpReq = true; S.high = high;
  }

  /* ------------------------------------------------------------ helmet + suit overlay */
  const path = (pts, close = true) => { cctx.beginPath(); pts.forEach((q, i) => i ? cctx.lineTo(q[0], q[1]) : cctx.moveTo(q[0], q[1])); if (close) cctx.closePath(); };
  function drawSuit(p, sw){
    const A = p[11], B = p[12], cx = (A.x + B.x)/2, cy = (A.y + B.y)/2, ok = i => p[i].v > .3;
    const hipOk = ok(23) && ok(24), HA = hipOk ? p[23] : { x:A.x + (cx - A.x)*.15, y:A.y + sw*1.7 }, HB = hipOk ? p[24] : { x:B.x + (cx - B.x)*.15, y:B.y + sw*1.7 };
    const out = (q, k, dy) => [q.x + Math.sign(q.x - cx)*sw*k, q.y + dy*sw];
    const sA = out(A, .13, -.1), sB = out(B, .13, -.1), hA = out(HA, .08, .2), hB = out(HB, .08, .2), tiltA = Math.atan2(B.y - A.y, B.x - A.x) + (B.x < A.x ? Math.PI : 0);
    cctx.lineJoin = cctx.lineCap = 'round';
    const arm = (s, e, w, glove) => { if (!ok(s) || !ok(e)) return;
      const seg = (col, lw) => { cctx.strokeStyle = col; cctx.lineWidth = lw; cctx.beginPath(); cctx.moveTo(p[s].x, p[s].y); cctx.lineTo(p[e].x, p[e].y); if (ok(w)) cctx.lineTo(p[w].x, p[w].y); cctx.stroke(); };
      seg('#0f1317', sw*.33); seg('#e9edf0', sw*.29); seg('#ee8743', sw*.05);
      if (glove && ok(w)) { const dx = p[w].x - p[e].x, dy = p[w].y - p[e].y, d = Math.hypot(dx, dy) || 1, gx = p[w].x + dx/d*sw*.06, gy = p[w].y + dy/d*sw*.06;
        cctx.strokeStyle = '#ee8743'; cctx.lineWidth = sw*.31; cctx.beginPath(); cctx.moveTo(p[w].x - dx/d*sw*.08, p[w].y - dy/d*sw*.08); cctx.lineTo(p[w].x, p[w].y); cctx.stroke();
        cctx.fillStyle = '#23282e'; cctx.beginPath(); cctx.arc(gx, gy, sw*.165, 0, 7); cctx.fill(); cctx.strokeStyle = '#4db3da'; cctx.lineWidth = sw*.025; cctx.beginPath(); cctx.arc(gx, gy, sw*.095, 0, 7); cctx.stroke(); } };
    // torso
    const g = cctx.createLinearGradient(sA[0], 0, sB[0], 0); g.addColorStop(0, '#c9d0d6'); g.addColorStop(.5, '#f4f6f8'); g.addColorStop(1, '#c9d0d6');
    path([sA, [cx, cy - sw*.2], sB, hB, hA]); cctx.fillStyle = g; cctx.fill(); cctx.strokeStyle = '#0f1317'; cctx.lineWidth = sw*.03; cctx.stroke();
    const mix = (a, b, t) => [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t];
    path([sA, mix(sA, sB, .16), mix(hA, hB, .2), hA]); cctx.fillStyle = '#2a3037'; cctx.fill(); path([sB, mix(sB, sA, .16), mix(hB, hA, .2), hB]); cctx.fill();   // graphite side panels
    path([mix(sA, sB, .16), mix(sA, sB, .23), mix(hA, hB, .27), mix(hA, hB, .2)]); cctx.fillStyle = '#ee8743'; cctx.fill();
    path([mix(sB, sA, .16), mix(sB, sA, .23), mix(hB, hA, .27), mix(hB, hA, .2)]); cctx.fill();
    cctx.strokeStyle = '#2a3037'; cctx.lineWidth = sw*.025; cctx.beginPath(); cctx.moveTo(cx, cy - sw*.1); cctx.lineTo((hA[0] + hB[0])/2, (hA[1] + hB[1])/2); cctx.stroke();   // zip
    cctx.save(); cctx.translate(cx, cy + sw*.42); cctx.rotate(tiltA);
    cctx.fillStyle = '#ee8743'; cctx.fillRect(-sw*.36, -sw*.15, sw*.72, sw*.05); cctx.fillStyle = '#17202a'; cctx.font = `700 ${sw*.2}px "Barlow Condensed","Noto Sans SC",sans-serif`; cctx.textAlign = 'center'; cctx.textBaseline = 'middle';
    cctx.fillText('ARES-1', 0, sw*.05); cctx.fillStyle = '#17799f'; cctx.fillRect(-sw*.36, sw*.2, sw*.2, sw*.06); cctx.fillStyle = '#5a6672'; cctx.font = `600 ${sw*.075}px sans-serif`; cctx.fillText('MARS DRIVER', sw*.12, sw*.235); cctx.restore();
    cctx.fillStyle = '#23282e'; cctx.beginPath(); cctx.ellipse(cx, cy - sw*.17, sw*.24, sw*.1, tiltA, 0, 7); cctx.fill(); cctx.strokeStyle = '#ee8743'; cctx.lineWidth = sw*.03; cctx.stroke();   // collar
    arm(11, 13, 15, true); arm(12, 14, 16, true);
  }
  function drawHelmet(p, sw){
    const eL = p[7], eR = p[8], nose = p[0]; if (nose.v < .3) return;
    const a = eL.x < eR.x ? eL : eR, b = eL.x < eR.x ? eR : eL, earsOk = eL.v > .3 && eR.v > .3;
    const cx = earsOk ? (a.x + b.x)/2 : nose.x, cy = earsOk ? (a.y + b.y)/2 : nose.y, ang = earsOk ? Math.atan2(b.y - a.y, b.x - a.x) : 0;
    const R = Math.max(earsOk ? Math.hypot(b.x - a.x, b.y - a.y)*.7 : 0, sw*.29);
    const c = Math.cos(-ang), s = Math.sin(-ang), nx = clamp(((nose.x - cx)*c - (nose.y - cy)*s)/R, -.5, .5)*.5;   // look left / right shifts the visor
    cctx.save(); cctx.translate(cx, cy); cctx.rotate(ang); cctx.scale(R, R); cctx.translate(0, -.12); cctx.lineJoin = 'round';
    const shell = new Path2D(); shell.moveTo(-1.04, .2); shell.bezierCurveTo(-1.1, -.75, -.6, -1.28, 0, -1.28); shell.bezierCurveTo(.6, -1.28, 1.1, -.75, 1.04, .2);
    shell.bezierCurveTo(1.02, .7, .86, 1.0, .5, 1.22); shell.quadraticCurveTo(0, 1.36, -.5, 1.22); shell.bezierCurveTo(-.86, 1.0, -1.02, .7, -1.04, .2); shell.closePath();
    const vis = new Path2D(); vis.moveTo(-.8 + nx, -.3); vis.quadraticCurveTo(nx, -.46, .8 + nx, -.3); vis.quadraticCurveTo(.92 + nx, .1, .74 + nx, .42); vis.quadraticCurveTo(nx, .56, -.74 + nx, .42); vis.quadraticCurveTo(-.92 + nx, .1, -.8 + nx, -.3); vis.closePath();
    const body = new Path2D(shell); body.addPath(vis);
    const g = cctx.createRadialGradient(-.35, -.75, .1, 0, 0, 1.6); g.addColorStop(0, '#59636e'); g.addColorStop(.45, '#2b3138'); g.addColorStop(1, '#14181c');
    cctx.fillStyle = g; cctx.fill(body, 'evenodd');
    cctx.save(); cctx.clip(body, 'evenodd');
    cctx.fillStyle = '#ee8743'; cctx.beginPath(); cctx.moveTo(-.17, -1.4); cctx.lineTo(.17, -1.4); cctx.lineTo(.24, -.4); cctx.lineTo(-.24, -.4); cctx.closePath(); cctx.fill();      // centre stripe
    cctx.fillStyle = '#e9edf0'; cctx.fillRect(-.045, -1.4, .09, 1.0);
    cctx.fillStyle = '#ee8743'; cctx.beginPath(); cctx.moveTo(-1.2, .5); cctx.lineTo(-.55, .72); cctx.lineTo(-.5, .86); cctx.lineTo(-1.2, .68); cctx.closePath(); cctx.fill();
    cctx.beginPath(); cctx.moveTo(1.2, .5); cctx.lineTo(.55, .72); cctx.lineTo(.5, .86); cctx.lineTo(1.2, .68); cctx.closePath(); cctx.fill();                                           // cheek flashes
    cctx.fillStyle = '#0c0f12'; [-.2, 0, .2].forEach(x => { cctx.beginPath(); cctx.roundRect(x - .07 + nx*.4, .82, .14, .2, .04); cctx.fill(); });                                     // chin vents
    cctx.fillStyle = '#4db3ff'; cctx.shadowColor = '#4db3ff'; cctx.shadowBlur = 12; cctx.fillRect(-.62, 1.06, .34, .035); cctx.fillRect(.28, 1.06, .34, .035); cctx.shadowBlur = 0;   // LED strips
    cctx.fillStyle = '#e9edf0'; cctx.font = '700 .15px "Barlow Condensed",sans-serif'; cctx.textAlign = 'center'; cctx.fillText('ARES-1', nx*.6, -.52);
    cctx.restore();
    const vg = cctx.createLinearGradient(-.8, -.4, .8, .5); vg.addColorStop(0, 'rgba(255,214,120,.55)'); vg.addColorStop(.55, 'rgba(214,128,44,.34)'); vg.addColorStop(1, 'rgba(255,140,60,.30)');
    cctx.fillStyle = vg; cctx.fill(vis);
    cctx.save(); cctx.clip(vis); cctx.fillStyle = 'rgba(255,255,255,.32)'; cctx.beginPath(); cctx.moveTo(-.9, -.1); cctx.quadraticCurveTo(-.3, -.5, .5, -.42); cctx.lineTo(.6, -.36); cctx.quadraticCurveTo(-.25, -.4, -.9, .05); cctx.closePath(); cctx.fill(); cctx.restore();
    cctx.lineWidth = .06; cctx.strokeStyle = '#0c0f12'; cctx.stroke(vis); cctx.lineWidth = .035; cctx.strokeStyle = '#0a0c0f'; cctx.stroke(shell);
    cctx.restore();
  }
  function drawCam(){
    const W = camCanvas.width, Hh = camCanvas.height;
    if (S.camOk && video.readyState >= 2) { cctx.save(); cctx.translate(W, 0); cctx.scale(-1, 1); cctx.drawImage(video, 0, 0, W, Hh); cctx.restore(); }
    else { const g = cctx.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, '#2a323b'); g.addColorStop(1, '#14181d'); cctx.fillStyle = g; cctx.fillRect(0, 0, W, Hh);
      if (!S.pose) { cctx.fillStyle = '#93a0ab'; cctx.font = '16px sans-serif'; cctx.textAlign = 'center'; cctx.fillText('摄像头画面', W/2, Hh/2); } }
    const p = S.pose; if (!p) { $v('camhint').textContent = ''; return; }
    const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) || 1;
    if (p[11].v > .3 && p[12].v > .3) drawSuit(p, sw);
    drawHelmet(p, sw);
    const L = p[15], R = p[16];
    if (L.v > .5 && R.v > .5) {   // the imaginary steering wheel between the hands
      const mx = (L.x + R.x)/2, my = (L.y + R.y)/2, r = Math.hypot(L.x - R.x, L.y - R.y)/2, a = Math.atan2(R.y - L.y, R.x - L.x) + (R.x < L.x ? Math.PI : 0);
      cctx.save(); cctx.translate(mx, my); cctx.rotate(a); cctx.lineWidth = Math.max(2, sw*.018); cctx.strokeStyle = S.handsUp ? 'rgba(111,211,255,.85)' : 'rgba(255,255,255,.35)';
      cctx.beginPath(); cctx.arc(0, 0, r, 0, 7); cctx.moveTo(-r, 0); cctx.lineTo(r, 0); cctx.moveTo(0, 0); cctx.lineTo(0, r); cctx.stroke();
      cctx.fillStyle = '#ee8743'; cctx.fillRect(-sw*.02, -r - sw*.03, sw*.04, sw*.06); cctx.restore();
    }
    $v('camhint').textContent = S.handsUp ? (S.steerT > .05 ? '← 左转' : (S.steerT < -.05 ? '右转 →' : '直行')) : '举起双手';
    if ($v('camst').textContent !== '装备就绪：头盔 + 赛车服') $v('camst').textContent = '装备就绪：头盔 + 赛车服';
  }

  /* ------------------------------------------------------------ loop */
  const say = (t, ms = 2200) => { const m = root.querySelector('.xp-msg'); m.textContent = t; m.classList.add('on'); clearTimeout(say.t); say.t = setTimeout(() => m.classList.remove('on'), ms); };
  function enter(){ if (S.stage === 'drive') return; S.stage = 'drive'; root.classList.remove('xp--suit');
    $v('help').textContent = pose || fakePose ? '双手抬平 = 直行 · 倾斜双手 = 转向 · 双手举过头顶 = 跳跃 · 放下双手 = 停车' : '键盘驾驶：↑ 前进 · ← → 转向 · 空格 跳跃';
    say('已进入驾驶舱：开往蓝色能量信标', 3200); }
  const ARROWS = ['↑','↗','→','↘','↓','↙','←','↖'];
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), look = new THREE.Vector3(); let last = performance.now();
  function frame(now){
    if (!active) return; S.raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last)/1000, .1); last = now; S.t += dt;
    const p0 = performance.now(); readPose(now); drawCam(); const p1 = performance.now();
    const k = S.keys, kSteer = (k.ArrowLeft || k.a ? 1 : 0) - (k.ArrowRight || k.d ? 1 : 0), kGo = k.ArrowUp || k.w;
    const driving = S.stage === 'drive' && (kGo || S.handsUp), steerT = kSteer || S.steerT;
    if (S.stage === 'suit') { const lvl = S.handsUp && Math.abs(S.ang || 0) < .22; S.hold = lvl ? S.hold + dt : Math.max(0, S.hold - dt*2);
      root.querySelector('.hold i').style.width = clamp(S.hold/1.5, 0, 1)*100 + '%'; if (S.hold >= 1.5) enter(); }
    S.steer += (steerT - S.steer)*(1 - Math.exp(-dt*7));
    const air = S.alt > .05;
    if (!air) S.speed += ((driving ? 13 : 0) - S.speed)*(1 - Math.exp(-dt*(driving ? .9 : 1.6)));
    S.th += S.steer*(air ? .3 : .8)*clamp(S.speed/4, 0, 1)*dt;
    fwd.set(Math.cos(S.th), 0, -Math.sin(S.th)); S.x += fwd.x*S.speed*dt; S.z += fwd.z*S.speed*dt; S.odo += S.speed*dt;
    recenter();
    // sit on the terrain: height and slope from four samples around the wheelbase
    const rx = -fwd.z, rz = fwd.x, hF = H(S.x + fwd.x*2, S.z + fwd.z*2), hB = H(S.x - fwd.x*2, S.z - fwd.z*2), hL = H(S.x - rx*1.1, S.z - rz*1.1), hR = H(S.x + rx*1.1, S.z + rz*1.1);
    const bump = Math.sin(S.odo*1.7)*.012*clamp(S.speed/6, 0, 1);
    // jump thrusters: 4 CH4/LOX engines fire for 0.7 s, then a ballistic hop under Mars gravity (3.71 m/s²); about 50 m at full speed
    const gnd = (hF + hB + hL + hR)/4;
    if (S.jumpReq && S.stage === 'drive' && !air && S.jetCd <= 0) { if (S.fuel > 0) { S.fuel--; S.vy = 7; S.jet = .7; S.jetCd = 1.5; S.speed = Math.max(S.speed, 8); S.y = gnd + .06; say('跳跃推进点火 · 推进剂 −18 kg'); } else say('推进剂不足：收集能量信标可补充'); }
    S.jumpReq = false; S.jet = Math.max(0, S.jet - dt); S.jetCd -= dt; S.shake = Math.max(0, S.shake - dt);
    if (S.y > gnd + .05 || S.vy > 0) { S.vy -= 3.71*dt; S.y += S.vy*dt;
      if (S.y <= gnd) { if (S.vy < -2) { S.shake = .45; for (let n=0;n<50;n++){ const i = dustI = (dustI + 1) % 240, d = dustS[i], a = Math.random()*6.28, rr = 1 + Math.random()*2; d.life = 0; const P2 = dust.geometry.attributes.position.array; P2[i*3] = S.x + Math.cos(a)*rr; P2[i*3+1] = gnd + .2; P2[i*3+2] = S.z + Math.sin(a)*rr; d.v.set(Math.cos(a)*3, .6 + Math.random()*1.5, Math.sin(a)*3); } }
        S.y = gnd; S.vy = 0; } } else S.y = gnd;
    S.alt = S.y - gnd;
    jets.visible = S.jet > 0; if (jets.visible) { const k = .6 + Math.random()*.5; jets.children.forEach(m => m.scale.set(1, k*(S.jet/.7 + .3), 1)); }
    const shk = S.shake > 0 ? Math.sin(S.t*70)*.05*S.shake/.45 : 0;
    yaw.position.set(S.x, S.y + bump + shk, S.z); yaw.rotation.y = S.th;
    devil.position.set(Math.round(S.x/400)*400 + 90 + Math.sin(S.t*.11)*60, 0, Math.round(S.z/400)*400 + 120 + Math.cos(S.t*.09)*60); devil.position.y = H(devil.position.x, devil.position.z); devil.rotation.y = S.t*2.5;
    tilt.rotation.z += ((S.alt > .05 ? clamp(S.vy*.025, -.22, .22) : Math.atan2(hF - hB, 4)) - tilt.rotation.z)*(1 - Math.exp(-dt*6)); tilt.rotation.x += (Math.atan2(hL - hR, 2.2) - S.steer*.03*clamp(S.speed/8, 0, 1) - tilt.rotation.x)*(1 - Math.exp(-dt*6));
    // each wheel rolls, steers and follows the ground under it (suspension travel -0.32 .. +0.4 m; full droop in the air)
    const sp = Math.sin(tilt.rotation.z), sr = Math.sin(tilt.rotation.x);
    car.wheels.forEach(w => { if (w.spin) w.spin.rotation.z -= S.speed*dt/(w.r || .55); if (!w.obj) return; if (w.front) w.obj.rotation.y = S.steer*.38; if (!w.home) return;
      const wx = S.x + fwd.x*w.home.x + rx*w.home.z, wz = S.z + fwd.z*w.home.x + rz*w.home.z, want = clamp(H(wx, wz) - (yaw.position.y + w.home.x*sp - w.home.z*sr), -.32, .4);
      w.dy = (w.dy || 0) + (want - (w.dy || 0))*(1 - Math.exp(-dt*14)); w.obj.position.y = w.home.y + w.dy; });
    rim.rotation.z = S.steer*1.5;
    far.position.set(S.x, 0, S.z);
    // beacons
    let near = null, nd = 1e9;
    beaconPool.forEach(g => { const b = g.userData.b; if (!b || !g.visible) return; g.userData.ring.scale.setScalar(1 + .25*Math.sin(S.t*3)); const d = Math.hypot(b.x - S.x, b.z - S.z);
      if (d < 6 && S.stage === 'drive') { taken.add(b.key); g.visible = false; g.userData.b = null; S.beacons++; S.fuel = Math.min(10, S.fuel + 2); say(`收集到能量信标 × ${S.beacons} · 推进剂 +36 kg`); } else if (d < nd) { nd = d; near = b; } });
    // dust behind the rear wheels
    const P = dust.geometry.attributes.position.array;
    if (S.speed > 1.5 && S.alt < .05) for (let n=0;n<2;n++){ const i = dustI = (dustI + 1) % 240, sd = Math.random() < .5 ? -1 : 1, d = dustS[i]; d.life = 0;
      const px = S.x - fwd.x*2.2 + rx*sd*1.05, pz = S.z - fwd.z*2.2 + rz*sd*1.05; P[i*3] = px; P[i*3+1] = H(px, pz) + .2; P[i*3+2] = pz; d.v.set(-fwd.x*1.5 + (Math.random() - .5), 1 + Math.random(), -fwd.z*1.5 + (Math.random() - .5)); }
    for (let i=0;i<240;i++){ const d = dustS[i]; if (d.life >= 1) continue; d.life += dt/1.6; P[i*3] += d.v.x*dt; P[i*3+1] += d.v.y*dt; P[i*3+2] += d.v.z*dt; if (d.life >= 1) P[i*3+1] = -999; }
    dust.geometry.attributes.position.needsUpdate = true;
    // camera
    const cockpitView = S.stage === 'drive' && S.view === 'cockpit'; cockpit.visible = cockpitView; car.group.visible = !cockpitView;
    if (cockpitView) { if (cam.parent !== tilt) { tilt.add(cam); cam.fov = 66; cam.updateProjectionMatrix(); } cam.position.set(.55, 1.9, 0); cam.rotation.set(0, -Math.PI/2 + S.steer*.06, 0, 'YXZ'); cam.rotateX(-.07); }
    else { if (cam.parent) { cam.parent.remove(cam); cam.fov = 52; cam.updateProjectionMatrix(); cam.position.set(S.x - 10, yaw.position.y + 5, S.z + 6); }
      if (S.stage === 'suit') tmp.set(S.x + Math.cos(S.t*.25)*9.5, yaw.position.y + 3.4, S.z + Math.sin(S.t*.25)*9.5);
      else tmp.set(S.x - fwd.x*10, yaw.position.y + 4.2, S.z - fwd.z*10);
      tmp.y = Math.max(tmp.y, H(tmp.x, tmp.z) + 1.2); cam.position.lerp(tmp, 1 - Math.exp(-dt*(S.stage === 'suit' ? 8 : 3.5)));
      look.set(S.x + fwd.x*2, yaw.position.y + 1.5, S.z + fwd.z*2); cam.lookAt(look); }
    const p2 = performance.now(); renderer.render(scene, cam); const p3 = performance.now(); if (DEBUG) { const pr = S.prof ||= { cam:0, sim:0, gl:0, n:0 }; pr.cam += p1 - p0; pr.sim += p2 - p1; pr.gl += p3 - p2; pr.n++; pr.calls = renderer.info.render.calls; pr.tris = renderer.info.render.triangles; }
    // HUD
    if ((S.scr += dt) > .1 && cockpitView) { S.scr = 0; drawScreens(near, nd); }
    $v('alt').textContent = S.alt.toFixed(1) + ' m'; $v('fuel').textContent = S.fuel*18 + ' kg';
    $v('kmh').textContent = Math.round(S.speed*3.6); $v('hdg').textContent = String(Math.round(((90 - S.th*180/Math.PI) % 360 + 360) % 360)).padStart(3, '0') + '°';
    $v('odo').textContent = S.odo < 1000 ? Math.round(S.odo) + ' m' : (S.odo/1000).toFixed(2) + ' km'; $v('bc').textContent = S.beacons;
    if (near) { const rel = Math.atan2(-(near.z - S.z), near.x - S.x) - S.th, idx = ((Math.round(-rel/(Math.PI/4)) % 8) + 8) % 8; $v('near').textContent = `${Math.round(nd)} m ${ARROWS[idx]}`; } else $v('near').textContent = '—';
    $v('st').textContent = S.alt > .05 ? '跳跃中 ⤒' : !driving && S.speed < .5 ? '停车' : (S.steer > .12 ? '← 左转' : (S.steer < -.12 ? '右转 →' : '直行'));
    root.querySelector('.xp-steer .bar i').style.left = (50 - S.steer*46) + '%';
  }

  /* ------------------------------------------------------------ wiring */
  const resize = () => { const w = root.clientWidth, h = root.clientHeight; renderer.setSize(w, h, false); cam.aspect = w/h; cam.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(root); resize();
  const onKey = e => { const down = e.type === 'keydown', key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (down && key === 'Escape') return close(); if (down && key === 'c') S.view = S.view === 'cockpit' ? 'chase' : 'cockpit';
    if (key === ' ') { if (down && !e.repeat) S.jumpReq = true; return e.preventDefault(); }
    if (['ArrowLeft','ArrowRight','ArrowUp','a','d','w'].includes(key)) { S.keys[key] = down; e.preventDefault(); } };
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);
  root.addEventListener('click', e => { const b = e.target.closest('[data-xp]'); if (!b) return;
    if (b.dataset.xp === 'exit') close(); else if (b.dataset.xp === 'enter') enter(); else if (b.dataset.xp === 'jump') S.jumpReq = true; else if (b.dataset.xp === 'view') S.view = S.view === 'cockpit' ? 'chase' : 'cockpit'; });
  function close(){
    if (!active) return; active = null; window.__xpActive = false; cancelAnimationFrame(S.raf); ro.disconnect();
    removeEventListener('keydown', onKey); removeEventListener('keyup', onKey);
    if (stream) stream.getTracks().forEach(t => t.stop()); try { pose && pose.close(); } catch (e) {}
    pm.dispose();   // car geometry is shared with the main page, so nothing else is disposed here
    renderer.dispose(); renderer.forceContextLoss(); root.remove(); if (DEBUG) delete window.__xp;
  }
  if (DEBUG) window.__xp = { S, enter, close, setPose(lm){ fakePose = lm; }, setView(v){ S.view = v; } };
  recenter(true); S.raf = requestAnimationFrame(frame);
  startCamera();
}

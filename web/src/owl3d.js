// The owl as a live three.js model, drawn on a transparent WebGL canvas over the pre-rendered room.
// The three.js camera is set every tick to the room camera exported from Blender (frames/cam_d.json,
// cam_m.json), so the owl's perspective matches the render exactly. Everything lives in the room's
// Blender coordinates (Z up, metres): the glTF (Y up) is wrapped in a group rotated +90° about X.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const WIN = { x: 3.3, h: 1.526, z: 2.62 };                 // must match assets/blender/build_room.py
const SILL_TOP = 1.867;                                    // top of PH_WindowSill in the room (measured from room_anim_hd.blend)
const SILL_Y = -0.13;                                      // the ledge spans y -0.25..0.05; the owl stands on its front half
const OWL_H = 0.36;                                        // metres
const FOOT_SINK = 0.03;                                    // the claws sink this far into the ledge so the feet read as planted
const HOLD = 12, MOVE = 48, STOP_FRAME = [1, 61, 121, 181, 241, 301], LAST_FRAME = 313;
const WINDOW_STOP = STOP_FRAME[3];
const ease = t => t * t * (3 - 2 * t);

export async function createOwl3D(stage) {
  const canvas = document.createElement("canvas");
  canvas.id = "owl3d"; canvas.className = "owl3d";
  stage.insertBefore(canvas, document.getElementById("pinned"));       // over the room, under the cards
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  } catch (e) { canvas.remove(); throw e; }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 0.66;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
  scene.add(camera);

  // lights, matched to the room's window corner: a warm spot on the sill, cool moonlight from outside, a soft room fill
  const spot = new THREE.SpotLight(0xffc98c, 26, 0, THREE.MathUtils.degToRad(34), 0.7, 1.4);   // the warm sill spot (OwlSpot in the room)
  spot.position.set(WIN.x - 0.9, -1.7, 2.9); scene.add(spot, spot.target);
  spot.castShadow = false; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0005; spot.shadow.normalBias = 0.01; spot.shadow.radius = 4;
  const moon = new THREE.DirectionalLight(0x8fa8e6, 0.9); moon.position.set(WIN.x + 0.5, 1.6, 3.6); scene.add(moon, moon.target);   // cool light from outside, above and behind
  moon.castShadow = true; moon.shadow.mapSize.set(1024, 1024); moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.01; moon.shadow.radius = 3;
  Object.assign(moon.shadow.camera, { left: -0.7, right: 0.7, top: 0.7, bottom: -0.7, near: 0.1, far: 8 });
  const hemi = new THREE.HemisphereLight(0x5a6e93, 0x1a110a, 0.22); hemi.position.set(0, 0, 1); scene.add(hemi);
  const fill = new THREE.PointLight(0xffd6a6, 1.6, 0, 1.7); fill.position.set(WIN.x - 0.7, -1.2, 1.5); scene.add(fill);            // room bounce, low

  // room camera per frame
  const cams = {};
  await Promise.all(["d", "m"].map(k => fetch(`/frames/cam_${k}.json`).then(r => r.json()).then(j => { cams[k] = j; }).catch(() => null)));
  if (!cams.d && !cams.m) throw new Error("no camera data");

  // the owl: 0.36 m tall, yawed 15°, feet on the sill top, standing on the ledge's front half
  const gltf = await new GLTFLoader().loadAsync("/models/owl/scene.gltf");    // the Sketchfab glTF as published (CC BY-NC)
  const model = gltf.scene;
  model.traverse(o => {
    if (o.name === "Icosphere") o.visible = false;                            // the model's helper sphere
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
    if (o.material) { o.material.side = THREE.FrontSide; o.material.roughness = 0.92; o.material.metalness = 0; o.material.color.setRGB(0.92, 0.9, 0.86); }
    // recolour the vertex colours: the tan feathers become a deep brown, the cream stays cream, beak and claws keep their yellow
    const col = o.geometry.getAttribute("color");
    if (col) {
      const c = new THREE.Color(), deep = new THREE.Color(0.13, 0.07, 0.035);
      for (let i = 0; i < col.count; i++) {
        c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
        const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b), sat = mx ? (mx - mn) / mx : 0;
        if (sat > 0.12 && c.g / Math.max(c.r, 1e-3) < 0.82) c.lerp(deep, 0.88);          // browns -> deep brown
        else if (sat > 0.12) c.multiplyScalar(0.8);                                        // yellows a touch deeper
        else c.multiplyScalar(0.78).lerp(new THREE.Color(0.9, 0.82, 0.68), 0.12);          // cream, warmer and less bright
        col.setXYZ(i, c.r, c.g, c.b);
      }
      col.needsUpdate = true;
    }
  });
  const holder = new THREE.Group(); holder.rotation.x = Math.PI / 2; holder.add(model);
  const root = new THREE.Group(); root.add(holder); scene.add(root);
  root.updateMatrixWorld(true);
  const bboxOf = () => { const b = new THREE.Box3(); holder.traverse(o => { if (o.isMesh && o.visible && o.name !== "Icosphere") b.expandByObject(o); }); return b; };
  let box = bboxOf();
  const s = OWL_H / Math.max(1e-6, box.max.z - box.min.z);
  root.scale.setScalar(s); root.rotation.z = THREE.MathUtils.degToRad(15); root.updateMatrixWorld(true);
  box = bboxOf();
  const REST = new THREE.Vector3(WIN.x - (box.min.x + box.max.x) / 2 + 0.08, SILL_Y - (box.min.y + box.max.y) / 2, SILL_TOP - box.min.z);
  const START = REST.clone().add(new THREE.Vector3(0.55, 1.1, 0.95));
  root.position.copy(REST);
  spot.target.position.copy(REST); moon.target.position.copy(REST);
  // the sill top receives the owl's shadow (invisible elsewhere), plus a soft contact shadow under the feet
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 0.30), new THREE.ShadowMaterial({ opacity: 0.62, color: 0x000000 }));
  catcher.position.set(WIN.x, -0.10, SILL_TOP + 0.001); catcher.receiveShadow = true; scene.add(catcher);
  const blob = document.createElement("canvas"); blob.width = blob.height = 128;
  const g = blob.getContext("2d"), grd = g.createRadialGradient(64, 64, 4, 64, 64, 60);
  grd.addColorStop(0, "rgba(0,0,0,.7)"); grd.addColorStop(0.55, "rgba(0,0,0,.3)"); grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry((box.max.x - box.min.x) * 1.35, (box.max.y - box.min.y) * 1.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blob), transparent: true, depthWrite: false }));
  contact.position.set((box.min.x + box.max.x) / 2 + REST.x, (box.min.y + box.max.y) / 2 + REST.y, SILL_TOP + 0.002); scene.add(contact);

  // animation: the model's own actions
  const mixer = new THREE.AnimationMixer(model);
  // keep only the rotation tracks: this model's position/scale tracks differ per clip and blending them squashes the pose
  const clipOf = n => { const c = gltf.animations.find(a => a.name.toLowerCase().endsWith(n)); return c && new THREE.AnimationClip(c.name, c.duration, c.tracks.filter(t => t.name.endsWith(".quaternion"))); };
  const act = {};
  for (const n of ["fly", "landing", "idle", "headtwist", "sleep"]) { const c = clipOf(n); if (c) act[n] = mixer.clipAction(c); }
  for (const n of ["landing", "headtwist"]) if (act[n]) { act[n].setLoop(THREE.LoopOnce, 1); act[n].clampWhenFinished = true; }
  let current = null;
  function play(n, fade = 0.35) {
    const a = act[n]; if (!a || a === current) return;
    a.reset().setEffectiveWeight(1).play();
    if (current) current.crossFadeTo(a, fade, false);
    current = a;
  }
  const owl = { state: "away", t0: 0, nextTwist: 0, lastT: 0, sleeping: false, grounded: false };
  function groundFeet() {                       // measure the skinned (posed) mesh and drop the owl so its feet touch the sill top
    const b = new THREE.Box3();
    holder.traverse(m => { if (m.isSkinnedMesh) b.expandByObject(m, true); });
    if (!isFinite(b.min.z)) return;
    const dz = SILL_TOP - FOOT_SINK - b.min.z;
    REST.z += dz; START.z += dz; root.position.copy(REST); contact.position.z = SILL_TOP + 0.002;
    owl.grounded = true;
  }
  if (act.idle) { act.idle.reset().play(); mixer.update(0); root.updateMatrixWorld(true); groundFeet(); act.idle.stop(); mixer.update(0); }
  mixer.addEventListener("finished", e => {
    if (e.action === act.landing) { owl.state = "idle"; play("idle", 0.6); owl.nextTwist = performance.now() + 6000 + Math.random() * 8000; }
    else if (e.action === act.headtwist) { play("idle", 0.4); owl.nextTwist = performance.now() + 10000 + Math.random() * 12000; }
  });

  // frame -> camera (interpolated between the exported frames)
  const tmpQa = new THREE.Quaternion(), tmpQb = new THREE.Quaternion(), tmpPa = new THREE.Vector3(), tmpPb = new THREE.Vector3();
  function setCamera(k, f) {
    const c = cams[k] || cams.d || cams.m;
    const lo = Math.max(1, Math.min(LAST_FRAME, 1 + 2 * Math.floor((f - 1) / 2))), hi = Math.min(LAST_FRAME, lo + 2);
    const a = c.frames[lo] || c.frames[hi], b = c.frames[hi] || a;
    const t = hi > lo ? Math.min(1, Math.max(0, (f - lo) / (hi - lo))) : 0;
    tmpPa.fromArray(a.p); tmpPb.fromArray(b.p); camera.position.lerpVectors(tmpPa, tmpPb, t);
    tmpQa.fromArray(a.q); tmpQb.fromArray(b.q); camera.quaternion.slerpQuaternions(tmpQa, tmpQb, t);
    const lens = a.lens + (b.lens - a.lens) * t, [rw, rh] = c.res;
    const fitH = c.fit === "HORIZONTAL" || (c.fit === "AUTO" && rw >= rh);
    const half = (c.sensor / 2) * (fitH ? rh / rw : 1);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(half / lens));
    camera.aspect = rw / rh;
  }

  let vw = 0, vh = 0, dpr = 0;
  function fit(drawn) {
    const w = innerWidth, h = innerHeight, r = Math.min(devicePixelRatio || 1, 2);
    if (w !== vw || h !== vh || r !== dpr) { vw = w; vh = h; dpr = r; renderer.setPixelRatio(r); renderer.setSize(w, h, false); }
    // the room frame is drawn "cover"-cropped; render the same crop of the full camera frame
    camera.setViewOffset(drawn.w, drawn.h, -drawn.x, -drawn.y, w, h);
    camera.updateProjectionMatrix();
  }

  function update(f, now, drawn, portrait, quietMs) {
    const k = portrait ? "m" : "d";
    if (!drawn.w) return;
    const dt = owl.lastT ? Math.min(0.1, (now - owl.lastT) / 1000) : 0; owl.lastT = now;
    if (owl.state === "away") {
      if (f < WINDOW_STOP - MOVE * 0.45) { canvas.style.visibility = "hidden"; return; }
      owl.state = "fly"; owl.t0 = now; play("fly", 0);                        // the owl arrives as the camera reaches the window
    }
    if (owl.state === "fly" || owl.state === "landing") {
      const t = Math.min(1, (now - owl.t0) / 2600);                 // the glide continues through the landing, ending exactly at REST
      root.position.lerpVectors(START, REST, ease(t));
      root.position.z += 0.04 * Math.sin(now / 90) * (1 - t);
      if (owl.state === "fly" && t >= 0.62) { owl.state = "landing"; play("landing", 0.4); }
    } else {
      root.position.copy(REST);
      if (quietMs > 45000 && act.sleep && !owl.sleeping) { owl.sleeping = true; play("sleep", 0.8); }
      else if (quietMs <= 45000 && owl.sleeping) { owl.sleeping = false; play("idle", 0.6); owl.nextTwist = now + 4000; }
      else if (!owl.sleeping && act.headtwist && now > owl.nextTwist && current === act.idle) { play("headtwist", 0.35); }
    }
    mixer.update(dt);

    setCamera(k, f); fit(drawn);
    canvas.style.visibility = "visible";
    renderer.render(scene, camera);
  }
  return { update, canvas, owl, rest: REST.toArray() };
}

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { useTranslation } from "react-i18next";
import { Minus, Plus, Scan } from "lucide-react";
import { prefersReducedMotion } from "../../lib/urlState.js";
import s from "./scene.module.css";

// Equirectangular with cos(lat) scaling around the country's middle: 1 unit = 1 degree of latitude.
const LON0 = 90.3;
const LAT0 = 23.75;
const KX = Math.cos((LAT0 * Math.PI) / 180);
const X = (lon) => (lon - LON0) * KX;
const Y = (lat) => lat - LAT0;

const SLAB = 0.14;
const BLOCK = 0.2;
const GROUND = -0.34;


function fatLine(coords, z, color, width, opacity = 1) {
  const g = new LineGeometry();
  g.setPositions(coords.flatMap(([lon, lat]) => [X(lon), Y(lat), z]));
  const m = new LineMaterial({ color, linewidth: width, transparent: opacity < 1, opacity, worldUnits: false });
  return new Line2(g, m);
}

function thinLine(coords, z, color, opacity = 1) {
  const g = new THREE.BufferGeometry().setFromPoints(coords.map(([lon, lat]) => new THREE.Vector3(X(lon), Y(lat), z)));
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}

function shapeOf(ring) {
  return new THREE.Shape(ring.map(([lon, lat]) => new THREE.Vector2(X(lon), Y(lat))));
}

function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    [].concat(o.material ?? []).forEach((m) => m.dispose());
  });
}

const hx = (n) => `#${n.toString(16).padStart(6, "0")}`;

const NO_RESERVE = { left: 0, bottom: 0 };

export default function BangladeshScene({ data, colors: C, lang, selected, hovered, onHover, onSelect, onRiverHover, onRiverOpen, regionText, reserve = NO_RESERVE }) {
  const { t } = useTranslation();
  const wrapRef = useRef(null);
  const labelRef = useRef(null);
  const apiRef = useRef(null);
  const reserveRef = useRef(reserve);
  const cbRef = useRef({ onHover, onSelect, onRiverHover, onRiverOpen });
  const [failed, setFailed] = useState(false);
  cbRef.current = { onHover, onSelect, onRiverHover, onRiverOpen };

  useEffect(() => {
    const wrap = wrapRef.current;
    const labelLayer = labelRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return undefined;
    }
    const reduced = prefersReducedMotion();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = s.canvas;
    wrap.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
    const root = new THREE.Group();
    root.rotation.x = -Math.PI / 2; // map XY plane lies flat, +Z points up
    scene.add(root);

    scene.add(new THREE.HemisphereLight(C.sky, C.ground, C.hemi));
    const sun = new THREE.DirectionalLight(0xffffff, C.sun);
    sun.position.set(-3.5, 7, 4.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 30 });
    sun.shadow.radius = 6;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // Ground: graticule and the slab's shadow give the floating-map depth without decoration.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: C.shadow }));
    ground.position.z = GROUND;
    ground.receiveShadow = true;
    root.add(ground);
    const [w, so, e, n] = data.bounds;
    // Degree labels stay near the country; the grid itself runs well past the frame so it reads as a floor.
    const lons = [];
    const lats = [];
    for (let lon = Math.floor(w) - 1; lon <= Math.ceil(e) + 1; lon++) lons.push(lon);
    for (let lat = Math.floor(so) - 1; lat <= Math.ceil(n) + 1; lat++) lats.push(lat);
    const GRID_PAD = 14;
    const [gw, ge, gs, gn] = [lons[0] - GRID_PAD, lons.at(-1) + GRID_PAD, lats[0] - GRID_PAD, lats.at(-1) + GRID_PAD];
    for (let lon = gw; lon <= ge; lon++) root.add(thinLine([[lon, gs], [lon, gn]], GROUND + 0.001, C.graticule));
    for (let lat = gs; lat <= gn; lat++) root.add(thinLine([[gw, lat], [ge, lat]], GROUND + 0.001, C.graticule));

    const slab = new THREE.Mesh(
      new THREE.ExtrudeGeometry(data.outline.map((p) => shapeOf(p[0])), { depth: SLAB, bevelEnabled: false }),
      [
        new THREE.MeshStandardMaterial({ color: C.slabTop, roughness: 0.92, metalness: 0.05 }),
        new THREE.MeshStandardMaterial({ color: C.slabSide, roughness: 1 }),
      ],
    );
    slab.castShadow = true;
    slab.receiveShadow = true;
    root.add(slab);
    // Light theme: hypsometric tint. Each band is the land at or above a height, stacked low to high.
    if (C.elevation && data.elevation) {
      data.elevation.bands.forEach((b, i) => {
        const shapes = b.polygons.map((pp) => {
          const sh = shapeOf(pp.outer);
          sh.holes = pp.holes.map((h) => new THREE.Path(h.map(([lon, lat]) => new THREE.Vector2(X(lon), Y(lat)))));
          return sh;
        });
        const mesh = new THREE.Mesh(
          new THREE.ShapeGeometry(shapes),
          new THREE.MeshStandardMaterial({ color: C.elevation[b.band] ?? C.elevation.at(-1), roughness: 0.95 }),
        );
        mesh.position.z = SLAB + 0.0008 * (i + 1);
        mesh.receiveShadow = true;
        root.add(mesh);
      });
    }
    for (const p of data.outline) root.add(thinLine(p[0], SLAB + 0.002, C.edge));
    for (const l of data.divisions) root.add(thinLine(l, SLAB + 0.002, C.division, 0.9));

    const fatLines = [];
    for (const r of data.rivers) {
      const width = r.rank === 1 ? 2.4 : r.rank === 2 ? 1.5 : 1;
      const line = fatLine(r.coords, SLAB + 0.004, C.river, width, r.rank === 3 ? 0.45 : r.traced ? 0.8 : 0.95);
      fatLines.push(line);
      root.add(line);
    }

    const cityDot = new THREE.CircleGeometry(0.022, 20);
    const cityMat = new THREE.MeshBasicMaterial({ color: C.city });
    for (const c of data.cities) {
      const dot = new THREE.Mesh(cityDot, cityMat);
      dot.position.set(X(c.at[0]), Y(c.at[1]), SLAB + 0.005);
      root.add(dot);
      if (c.kind === "capital") {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.036, 0.046, 28), cityMat);
        ring.position.copy(dot.position);
        root.add(ring);
      }
    }

    // Study reaches: raised blocks carrying the pipeline's own latest banklines.
    const blocks = {};
    for (const [id, reg] of Object.entries(data.regions)) {
      const top = new THREE.MeshStandardMaterial({ color: C.blockTop, roughness: 0.8, metalness: 0.1 });
      const side = new THREE.MeshStandardMaterial({ color: C.blockSide, roughness: 1 });
      const mesh = new THREE.Mesh(
        new THREE.ExtrudeGeometry(reg.rings.map(shapeOf), { depth: BLOCK, bevelEnabled: false }),
        [top, side],
      );
      mesh.position.z = SLAB;
      mesh.castShadow = true;
      mesh.userData.region = id;
      root.add(mesh);
      const edges = reg.rings.map((ring) => {
        const l = fatLine(ring, SLAB + BLOCK + 0.003, C.blockEdge, 1.4);
        fatLines.push(l);
        root.add(l);
        return l;
      });
      for (const b of reg.banks) {
        const l = fatLine(b, SLAB + BLOCK + 0.004, C.banks, 1.6);
        fatLines.push(l);
        root.add(l);
      }
      blocks[id] = { mesh, top, edges };
    }

    // HTML labels follow projected anchor points each frame.
    const labels = [];
    const addLabel = (kind, text, lon, lat, z, extra = {}) => {
      const el = document.createElement("div");
      el.className = `${s.label} ${s[kind]}`;
      // Only river names are interactive; the other labels repeat what the 3D map already shows.
      if (kind !== "river") el.setAttribute("aria-hidden", "true");
      const inner = document.createElement("span");
      el.appendChild(inner);
      labelLayer.appendChild(el);
      // ox/dx mirror each kind's CSS anchor so collision boxes match what is drawn.
      const ox = kind === "river" || kind === "grid" ? -0.5 : 0;
      const dx = kind === "region" ? 14 : kind === "city" || kind === "capital" ? 8 : 0;
      labels.push({ el, inner, text, kind, ox, dx, w: null, h: null, priority: 5, minZoom: 0, pos: new THREE.Vector3(X(lon), Y(lat), z), ...extra });
    };
    // Who wins a collision, and from what zoom a label may appear (1 = the fitted country view).
    const MAJOR_RIVERS = new Set(["Jamuna", "Padma", "Meghna", "Brahmaputra"]);
    for (const c of data.cities) {
      const rank = c.kind === "capital" ? { priority: 1 } : c.kind === "town" ? { priority: 4, minZoom: 1.6 } : { priority: 3 };
      addLabel(c.kind === "capital" ? "capital" : "city", { en: c.name, bn: c.nameBn }, c.at[0], c.at[1], SLAB, rank);
    }
    for (const r of data.riverLabels) {
      addLabel("river", { river: r.name }, r.at[0], r.at[1], SLAB, MAJOR_RIVERS.has(r.name) ? { priority: 2 } : { priority: 4, minZoom: 1.3 });
      // River names are the way into each river's page: hover/focus for a preview, click/Enter to open.
      const span = labels.at(-1).inner;
      span.tabIndex = 0;
      span.setAttribute("role", "link");
      const show = () => cbRef.current.onRiverHover?.(r.name, span.getBoundingClientRect());
      const hide = () => cbRef.current.onRiverHover?.(null);
      span.addEventListener("pointerenter", show);
      span.addEventListener("focus", show);
      span.addEventListener("pointerleave", hide);
      span.addEventListener("blur", hide);
      span.addEventListener("click", () => cbRef.current.onRiverOpen?.(r.name));
      span.addEventListener("keydown", (ev) => ev.key === "Enter" && cbRef.current.onRiverOpen?.(r.name));
    }
    for (const [id, reg] of Object.entries(data.regions)) addLabel("region", { region: id }, reg.center[0] + 0.32, reg.center[1], SLAB + BLOCK, { region: id, priority: 0 });
    for (const lon of lons.slice(1, -1)) addLabel("grid", { raw: `${lon}°E` }, lon, lats[0] + 0.35, GROUND, { priority: 6 });
    for (const lat of lats.slice(1, -1)) addLabel("grid", { raw: `${lat}°N` }, lons.at(-1) - 0.3, lat, GROUND, { priority: 6 });
    const byPriority = [...labels].sort((a, b) => a.priority - b.priority);
    document.fonts?.ready.then(() => labels.forEach((l) => (l.w = null))); // widths change once Inter loads

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.zoomSpeed = 0.6;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.panSpeed = 0.6;
    controls.enableDamping = !reduced;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.5;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = 1.08;
    controls.minAzimuthAngle = -0.75;
    controls.maxAzimuthAngle = 0.75;
    const target = new THREE.Vector3(X(90.35), 0, -Y(23.7));
    controls.target.copy(target);

    let width = 1;
    let height = 1;
    let distance = 14;
    const corners = data.outline
      .flatMap((poly) => poly[0])
      .flatMap(([lon, lat]) => [new THREE.Vector3(X(lon), 0, -Y(lat)), new THREE.Vector3(X(lon), SLAB + BLOCK, -Y(lat))]);
    const place = (polar, azimuth, d) => {
      camera.position.set(
        target.x + d * Math.sin(polar) * Math.sin(azimuth),
        target.y + d * Math.cos(polar),
        target.z + d * Math.sin(polar) * Math.cos(azimuth),
      );
      camera.lookAt(target);
      camera.updateMatrixWorld();
    };
    const FINAL_POLAR = 0.74;
    const fit = () => {
      // Smallest distance at which the whole country fits the part of the frame no overlay reserves.
      const { left = 0, bottom = 0 } = reserveRef.current;
      const xmin = -1 + (2 * left) / width + 0.1;
      const ymin = -1 + (2 * bottom) / height + 0.14;
      const tmp = new THREE.Vector3();
      for (distance = 6; distance < 40; distance += 0.25) {
        place(FINAL_POLAR, 0, distance);
        if (corners.every((c) => {
          tmp.copy(c).project(camera);
          return tmp.x > xmin && tmp.x < 0.9 && tmp.y > ymin && tmp.y < 0.82;
        })) break;
      }
    };
    const resize = () => {
      width = wrap.clientWidth || 1;
      height = wrap.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Centre the map in the free area: shift the image right/up by half of what overlays reserve.
      const { left = 0, bottom = 0 } = reserveRef.current;
      camera.setViewOffset(width, height, -left / 2, bottom / 2, width, height);
      for (const l of fatLines) l.material.resolution.set(width, height);
      const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(target));
      fit();
      controls.target.copy(target);
      controls.minDistance = distance * 0.35;
      controls.maxDistance = distance * 1.3;
      place(revealDone ? sph.phi : FINAL_POLAR, revealDone ? sph.theta : 0, distance);
    };
    const zoom = (factor) => {
      const off = camera.position.clone().sub(controls.target);
      off.setLength(Math.min(controls.maxDistance, Math.max(controls.minDistance, off.length() * factor)));
      camera.position.copy(controls.target).add(off);
      controls.update();
    };
    const resetView = () => {
      controls.target.copy(target);
      place(FINAL_POLAR, 0, distance);
      controls.update();
    };

    let revealDone = reduced;
    let revealStart = null;
    controls.enabled = reduced;
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    if (!reduced) place(0.12, 0, distance);

    // Picking
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hoverId = null;
    let down = null;
    const pick = (ev) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(Object.values(blocks).map((b) => b.mesh), false)[0];
      return hit?.object.userData.region ?? null;
    };
    const onMove = (ev) => {
      const id = pick(ev);
      if (id !== hoverId) {
        hoverId = id;
        renderer.domElement.style.cursor = id ? "pointer" : "grab";
        cbRef.current.onHover?.(id);
      }
    };
    const onDown = (ev) => (down = { x: ev.clientX, y: ev.clientY });
    const onUp = (ev) => {
      if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 5) {
        const id = pick(ev);
        if (id) cbRef.current.onSelect?.(id);
      }
      down = null;
    };
    const onLeave = () => {
      hoverId = null;
      cbRef.current.onHover?.(null);
    };
    renderer.domElement.style.cursor = "grab";
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointerleave", onLeave);

    let visible = true;
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    io.observe(wrap);

    const tmp = new THREE.Vector3();
    let raf = 0;
    const frame = (time) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      if (!revealDone) {
        revealStart ??= time;
        const k = Math.min(1, (time - revealStart) / 1600);
        const ease = 1 - Math.pow(1 - k, 3);
        place(0.12 + (FINAL_POLAR - 0.12) * ease, 0, distance);
        if (k === 1) {
          revealDone = true;
          controls.enabled = true;
        }
      } else {
        controls.update();
      }
      root.updateMatrixWorld();
      // Collision-aware labels: place in priority order; a label that would overlap one already placed waits
      // (hidden) until zooming or turning frees its space. Less important labels also wait for a closer zoom.
      const zoomNow = distance / camera.position.distanceTo(controls.target);
      const placed = [];
      for (const l of byPriority) {
        tmp.copy(l.pos).applyMatrix4(root.matrixWorld).project(camera);
        const x = ((tmp.x + 1) / 2) * width;
        const y = ((1 - tmp.y) / 2) * height;
        l.el.style.transform = `translate(${x}px, ${y}px)`;
        let show = tmp.z <= 1 && zoomNow >= l.minZoom;
        if (show) {
          if (l.w == null) {
            l.w = l.inner.offsetWidth;
            l.h = l.inner.offsetHeight;
          }
          const box = [x + l.ox * l.w + l.dx - 3, y - l.h / 2 - 2, x + l.ox * l.w + l.dx + l.w + 3, y + l.h / 2 + 2];
          show = !placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1]);
          if (show) placed.push(box);
        }
        if ((l.el.dataset.hidden === "true") === show) l.el.dataset.hidden = show ? "false" : "true";
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    apiRef.current = {
      relayout: resize,
      zoom,
      reset: resetView,
      highlight(sel, hov) {
        for (const [id, b] of Object.entries(blocks)) {
          const isSel = id === sel;
          b.top.color.setHex(isSel ? C.blockTopSelected : id === hov ? C.blockTopHover : C.blockTop);
          for (const edge of b.edges) {
            edge.material.color.setHex(isSel || id === hov ? C.blockEdgeSelected : C.blockEdge);
            edge.material.linewidth = isSel ? 2.2 : 1.4;
          }
        }
        for (const l of labels) if (l.region) l.el.dataset.state = l.region === sel ? "selected" : l.region === hov ? "hover" : "";
      },
      setText(fn) {
        for (const l of labels) {
          l.inner.textContent = fn(l.text);
          l.w = null; // re-measure for the new language
        }
      },
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      disposeTree(scene);
      renderer.dispose();
      renderer.domElement.remove();
      labelLayer.replaceChildren();
      apiRef.current = null;
    };
  }, [data, C]);

  useEffect(() => {
    apiRef.current?.highlight(selected, hovered);
  }, [selected, hovered, data, C]);

  useEffect(() => {
    reserveRef.current = reserve;
    apiRef.current?.relayout();
  }, [reserve.left, reserve.bottom]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    apiRef.current?.setText((txt) => {
      if (txt.raw) return txt.raw;
      if (txt.river) return regionText.river(txt.river);
      if (txt.region) return regionText.region(txt.region);
      return txt[lang] ?? txt.en;
    });
  }, [lang, data, regionText, C]);

  if (failed) return <FlatFallback data={data} C={C} selected={selected} onSelect={onSelect} />;
  return (
    <div ref={wrapRef} className={s.scene}>
      <div ref={labelRef} className={s.labels} />
      <div className={s.zoom}>
        <button type="button" aria-label={t("map.zoomIn")} onClick={() => apiRef.current?.zoom(0.75)}>
          <Plus size={16} />
        </button>
        <button type="button" aria-label={t("map.zoomOut")} onClick={() => apiRef.current?.zoom(1 / 0.75)}>
          <Minus size={16} />
        </button>
        <button type="button" aria-label={t("map.resetCountry")} title={t("map.resetCountry")} onClick={() => apiRef.current?.reset()}>
          <Scan size={16} />
        </button>
      </div>
    </div>
  );
}

/** No WebGL: the same map, flat, still selectable. */
function FlatFallback({ data, C, selected, onSelect }) {
  const [w, so, e, n] = data.bounds;
  const path = (ring) => "M" + ring.map(([lon, lat]) => `${X(lon).toFixed(3)},${(-Y(lat)).toFixed(3)}`).join("L");
  return (
    <svg className={s.scene} viewBox={`${X(w) - 0.2} ${-Y(n) - 0.2} ${X(e) - X(w) + 0.4} ${Y(n) - Y(so) + 0.4}`}>
      {data.outline.map((p, i) => (
        <path key={i} d={path(p[0]) + "Z"} fill={hx(C.slabTop)} stroke={hx(C.edge)} strokeWidth="0.01" />
      ))}
      {data.rivers.map((r, i) => (
        <path key={i} d={path(r.coords)} fill="none" stroke={hx(C.river)} strokeWidth={r.rank === 1 ? 0.02 : 0.012} />
      ))}
      {Object.entries(data.regions).map(([id, reg]) => (
        <path
          key={id}
          d={reg.rings.map((r) => path(r) + "Z").join("")}
          fill={hx(id === selected ? C.blockTopSelected : C.blockTop)}
          stroke={hx(id === selected ? C.blockEdgeSelected : C.blockEdge)}
          strokeWidth="0.012"
          style={{ cursor: "pointer" }}
          onClick={() => onSelect?.(id)}
        />
      ))}
    </svg>
  );
}

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  ContactShadows,
  ContactShadows,
  OrbitControls,
  useGLTF,
  useProgress,
  Center,
} from "@react-three/drei";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import * as THREE from "three";
import type { Mesh, Group, Texture } from "three";
import { Box, Grid3x3 } from "lucide-react";

/** WASM-декодеры Draco лежат в public/draco/ — без них сжатая сетка не распакуется. */
function attachDraco(loader: { setDRACOLoader: (l: DRACOLoader) => void }) {
  const draco = new DRACOLoader();
  draco.setDecoderPath("/draco/");
  loader.setDRACOLoader(draco);
}

const PLASTIC = { roughness: 0.52, metalness: 0 } as const;
export const DEFAULT_PART_COLOR = "#000000";
export type PartMaterial = {
  roughness: number;
  /** Пластик — диэлектрик: значение всегда приводится к 0. */
  metalness: number;
  opacity?: number;
  /** Микроплёнка от литья под давлением. */
  clearcoat?: number;
  /** Процедурная шагрень: микрорельеф литой корки. */
  texture?: "shagreen";
};

/**
 * Карта нормалей с микрошумом: имитирует шагрень — свет рассеивается
 * по микрорельефу, поверхность перестаёт быть «пластиковой пустотой».
 */
let shagreenCache: Texture | null = null;
function shagreenNormalMap(): Texture {
  if (shagreenCache) return shagreenCache;
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const n = (Math.random() - 0.5) * 46;
    data[i * 4] = 128 + n;
    data[i * 4 + 1] = 128 + (Math.random() - 0.5) * 46;
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.needsUpdate = true;
  shagreenCache = tex;
  return tex;
}

/** Единая PBR-настройка пластика: metalness 0 + тонкий clearcoat. */
function pbrProps(material: PartMaterial) {
  const opacity = material.opacity ?? 1;
  return {
    roughness: material.roughness,
    metalness: 0,
    clearcoat: material.clearcoat ?? 0.08,
    clearcoatRoughness: Math.min(0.6, material.roughness * 0.7),
    envMapIntensity: material.roughness < 0.4 ? 1.15 : 0.75,
    transparent: opacity < 1,
    opacity,
    ...(material.texture === "shagreen"
      ? { normalMap: shagreenNormalMap(), normalScale: new THREE.Vector2(0.35, 0.35) }
      : {}),
  };
}

function GltfModel({
  url,
  wire,
  color,
  material,
}: {
  url: string;
  wire: boolean;
  color: string;
  material: PartMaterial;
}) {
  const { scene } = useGLTF(url, true, undefined, attachDraco as never);
  const cloned = useMemo(() => {
    const s = scene.clone(true);
    s.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && m.material && !Array.isArray(m.material)) {
        // Базовые материалы из GLB заменяем на физически корректный пластик.
        const src = m.material as unknown as { map?: Texture | null; aoMap?: Texture | null };
        const mat = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(color),
          wireframe: wire,
          ...pbrProps(material),
          ...(src.map ? { map: src.map } : {}),
          ...(src.aoMap ? { aoMap: src.aoMap, aoMapIntensity: 1 } : {}),
        });
        m.material = mat as never;
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return s;
  }, [scene, wire, color, material]);
  return <primitive object={cloned} />;
}

/**
 * Параметрический прокси-меш: используется, пока в S3 нет Draco-модели артикула.
 * Геометрия строится по категории, поэтому вьювер всегда показывает узел, а не пустой холст.
 */
function ProxyModel({
  category,
  wire,
  color,
  material,
}: {
  category: string;
  wire: boolean;
  color: string;
  material: PartMaterial;
}) {
  const mat = <meshPhysicalMaterial color={color} wireframe={wire} {...pbrProps(material)} />;

  if (category.includes("Колпач")) {
    return (
      <group>
        <mesh castShadow>
          <cylinderGeometry args={[0.55, 0.6, 0.9, 48]} />
          {mat}
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <torusGeometry args={[0.6, 0.06, 16, 48]} />
          {mat}
        </mesh>
      </group>
    );
  }
  // Крышка канистры — круглый корпус DIN 61 с накаткой и внутренним обтюратором
  if (category.includes("канистр")) {
    return (
      <group>
        <mesh castShadow>
          <cylinderGeometry args={[0.72, 0.72, 0.42, 64]} />
          {mat}
        </mesh>
        <mesh position={[0, 0.23, 0]}>
          <cylinderGeometry args={[0.68, 0.72, 0.05, 64]} />
          {mat}
        </mesh>
        <mesh position={[0, -0.26, 0]}>
          <cylinderGeometry args={[0.58, 0.58, 0.14, 48]} />
          {mat}
        </mesh>
        <mesh position={[0, -0.38, 0]}>
          <coneGeometry args={[0.5, 0.16, 48]} />
          {mat}
        </mesh>
      </group>
    );
  }
  if (category.includes("Хомут")) {
    return (
      <group rotation={[Math.PI / 2.2, 0, 0]}>
        <mesh>
          <torusGeometry args={[0.8, 0.07, 20, 80, Math.PI * 1.7]} />
          {mat}
        </mesh>
        <mesh position={[0.8, 0, 0]}>
          <boxGeometry args={[0.34, 0.3, 0.26]} />
          {mat}
        </mesh>
      </group>
    );
  }
  if (category.includes("Крепёж")) {
    return (
      <group>
        <mesh>
          <cylinderGeometry args={[0.13, 0.13, 1.7, 32]} />
          {mat}
        </mesh>
        <mesh position={[0, 0.9, 0]}>
          <cylinderGeometry args={[0.36, 0.36, 0.16, 6]} />
          {mat}
        </mesh>
        <mesh position={[0, -0.9, 0]}>
          <coneGeometry args={[0.14, 0.28, 24]} />
          {mat}
        </mesh>
      </group>
    );
  }
  if (category.includes("Опор")) {
    return (
      <group>
        <mesh>
          <boxGeometry args={[1.5, 0.28, 0.9]} />
          {mat}
        </mesh>
        <mesh position={[0, 0.42, 0]}>
          <boxGeometry args={[0.5, 0.6, 0.66]} />
          {mat}
        </mesh>
        {[-0.55, 0.55].map((x) => (
          <mesh key={x} position={[x, -0.28, 0]}>
            <cylinderGeometry args={[0.16, 0.2, 0.3, 24]} />
            {mat}
          </mesh>
        ))}
      </group>
    );
  }
  // Заглушки трубные — квадратный корпус с юбкой и рёбрами жёсткости
  return (
    <group>
      <mesh>
        <boxGeometry args={[1.2, 0.22, 1.2]} />
        {mat}
      </mesh>
      <mesh position={[0, -0.42, 0]}>
        <boxGeometry args={[1.02, 0.65, 1.02]} />
        {mat}
      </mesh>
      {[0, Math.PI / 2].map((r) => (
        <mesh key={r} position={[0, -0.42, 0]} rotation={[0, r, 0]}>
          <boxGeometry args={[0.96, 0.6, 0.08]} />
          {mat}
        </mesh>
      ))}
    </group>
  );
}

function Spin({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const ref = useRef<Group>(null);
  useFrame((_, d) => {
    if (enabled && ref.current) ref.current.rotation.y += d * 0.18;
  });
  return <group ref={ref}>{children}</group>;
}

function CadLoader() {
  const { progress, active } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center bg-surface/80">
      <div className="w-56">
        <div className="h-px w-full bg-border">
          <div
            className="h-px bg-primary transition-[width] duration-200"
            style={{ width: `${Math.max(4, progress)}%` }}
          />
        </div>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Загрузка CAD-геометрии... {progress.toFixed(0)}%
        </p>
      </div>
    </div>
  );
}

export function CadViewer({
  glbUrl,
  category,
  color = DEFAULT_PART_COLOR,
  material = PLASTIC,
}: {
  glbUrl: string | null;
  category: string;
  color?: string;
  material?: PartMaterial;
}) {
  const [wire, setWire] = useState(false);
  const [auto, setAuto] = useState(true);
  const [grabbing, setGrabbing] = useState(false);
  const glRef = useRef<{
    dispose: () => void;
    forceContextLoss?: () => void;
    renderLists?: { dispose: () => void };
  } | null>(null);

  // Без ручной очистки серия открытий карточек выжирает WebGL-контексты на мобильных.
  // Освобождаем контекст асинхронно: drei успевает удалить свои render-target'ы.
  useEffect(
    () => () => {
      const gl = glRef.current;
      glRef.current = null;
      if (!gl) return;
      setTimeout(() => {
        try {
          gl.renderLists?.dispose();
          gl.dispose();
          gl.forceContextLoss?.();
        } catch {
          /* контекст уже освобождён браузером */
        }
      }, 0);
    },
    [],
  );


  return (
    <div
      className={`relative h-64 overflow-hidden rounded-lg bg-surface sm:h-72 lg:h-[380px] ${
        grabbing ? "cursor-grabbing" : "cursor-grab"
      }`}
      // Жест вращения не должен прокручивать страницу под пальцем
      style={{ touchAction: "none" }}
      onPointerUp={() => setGrabbing(false)}
      onPointerLeave={() => setGrabbing(false)}
    >
      <Canvas
        camera={{ position: [2.6, 1.8, 2.6], fov: 40 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
        onCreated={({ gl, scene }) => {
          glRef.current = gl as unknown as typeof glRef.current;
          void scene;
        }}
        onPointerDown={() => {
          setAuto(false);
          setGrabbing(true);
        }}
        onWheel={() => setAuto(false)}
      >
        {/* Студийный софтбокс вместо жёстких direct-теней */}
        <ambientLight intensity={0.55} />
        <Suspense fallback={null}>
          <Center>
            <Spin enabled={auto}>
              {glbUrl ? (
                <GltfModel url={glbUrl} wire={wire} color={color} material={material} />
              ) : (
                <ProxyModel category={category} wire={wire} color={color} material={material} />
              )}
            </Spin>
          </Center>
          {/* Студийный свет обычными источниками: drei-Environment с детьми
              роняет контекст при закрытии карточки (dispose cube render target). */}
          <ambientLight intensity={0.85} />
          <hemisphereLight args={["#ffffff", "#c8ccd2", 0.7]} />
          <directionalLight position={[0, 5, 2]} intensity={2.2} color="#ffffff" />
          <directionalLight position={[-5, 1, 1]} intensity={0.9} color="#f4f6f8" />
          <directionalLight position={[5, 1, -1]} intensity={0.9} color="#eef1f4" />
          {/* Мягкое контактное затенение вместо чёрной проекционной тени */}
          <ContactShadows
            position={[0, -1.15, 0]}
            opacity={0.32}
            scale={9}
            blur={2.8}
            far={4}
            resolution={512}
          />
        </Suspense>
        <OrbitControls
          enablePan={false}
          minDistance={2}
          maxDistance={7}
          enableDamping
          dampingFactor={0.08}
          // Один палец — вращение, два пальца — pinch-to-zoom
          touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        />
      </Canvas>

      <CadLoader />

      <button
        type="button"
        onClick={() => setWire((v) => !v)}
        className="absolute bottom-3 left-3 flex items-center gap-2 rounded-sm border border-border bg-card/90 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur hover:border-primary hover:text-primary"
      >
        {wire ? <Box className="size-3.5" strokeWidth={1.75} /> : <Grid3x3 className="size-3.5" strokeWidth={1.75} />}
        {wire ? "Solid (пластик)" : "Wireframe (сетка)"}
      </button>

      <p className="pointer-events-none absolute right-3 top-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        WebGL · PBR · вращение мышью / свайпом
      </p>
    </div>
  );
}

export default CadViewer;

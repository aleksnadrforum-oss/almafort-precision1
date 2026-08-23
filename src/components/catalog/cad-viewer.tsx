import { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, OrbitControls, useGLTF, useProgress, Center } from "@react-three/drei";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { Mesh, Group } from "three";
import { Box, Grid3x3 } from "lucide-react";

/** WASM-декодеры Draco лежат в public/draco/ — без них сжатая сетка не распакуется. */
function attachDraco(loader: { setDRACOLoader: (l: DRACOLoader) => void }) {
  const draco = new DRACOLoader();
  draco.setDecoderPath("/draco/");
  loader.setDRACOLoader(draco);
}

const PLASTIC = { roughness: 0.6, metalness: 0.1, color: "#d8dade" } as const;

function GltfModel({ url, wire }: { url: string; wire: boolean }) {
  const { scene } = useGLTF(url, true, undefined, attachDraco as never);
  const cloned = useMemo(() => {
    const s = scene.clone(true);
    s.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && m.material && !Array.isArray(m.material)) {
        const mat = m.material.clone() as unknown as { wireframe: boolean; roughness: number; metalness: number };
        mat.wireframe = wire;
        mat.roughness = PLASTIC.roughness;
        mat.metalness = PLASTIC.metalness;
        m.material = mat as never;
      }
    });
    return s;
  }, [scene, wire]);
  return <primitive object={cloned} />;
}

/**
 * Параметрический прокси-меш: используется, пока в S3 нет Draco-модели артикула.
 * Геометрия строится по категории, поэтому вьювер всегда показывает узел, а не пустой холст.
 */
function ProxyModel({ category, wire }: { category: string; wire: boolean }) {
  const mat = <meshStandardMaterial {...PLASTIC} wireframe={wire} />;

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
}: {
  glbUrl: string | null;
  category: string;
}) {
  const [wire, setWire] = useState(false);
  const [auto, setAuto] = useState(true);

  return (
    <div className="relative h-72 overflow-hidden rounded-lg bg-surface">
      <Canvas
        camera={{ position: [2.6, 1.8, 2.6], fov: 40 }}
        dpr={[1, 2]}
        onPointerDown={() => setAuto(false)}
        onWheel={() => setAuto(false)}
      >
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 6, 3]} intensity={1.1} />
        <Suspense fallback={null}>
          <Center>
            <Spin enabled={auto}>
              {glbUrl ? (
                <GltfModel url={glbUrl} wire={wire} />
              ) : (
                <ProxyModel category={category} wire={wire} />
              )}
            </Spin>
          </Center>
          <Environment preset="studio" />
        </Suspense>
        <OrbitControls
          enablePan={false}
          minDistance={2}
          maxDistance={7}
          enableDamping
          dampingFactor={0.08}
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
        WebGL · вращение мышью
      </p>
    </div>
  );
}

export default CadViewer;

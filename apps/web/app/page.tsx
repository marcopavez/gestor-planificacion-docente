// apps/web/app/page.tsx — página raíz

import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ color: '#1A237E' }}>Faro</h1>
      <p>Copiloto de planificación y cumplimiento docente (K-12 Chile).</p>
      <p>
        <Link href="/aula">▶ Probar la cascada de Aula</Link> — del OA a la planificación, la prueba y el .pptx.
      </p>
    </main>
  );
}

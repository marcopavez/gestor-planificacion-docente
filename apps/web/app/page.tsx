// apps/web/app/page.tsx — página raíz

import Link from 'next/link';

export default function Home() {
  return (
    <main className="faro-page">
      <header className="faro-header">
        <h1 className="faro-title">Faro</h1>
        <p className="faro-subtitle">Copiloto de planificación y cumplimiento docente (K-12 Chile).</p>
      </header>

      <div className="faro-card">
        <p>Del Objetivo de Aprendizaje a la planificación, la prueba y el .pptx — alineado al currículum nacional.</p>
        <Link href="/aula" className="btn btn--primary btn--mt">
          ▶ Probar la cascada de Aula
        </Link>
      </div>
    </main>
  );
}

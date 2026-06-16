// apps/web/app/layout.tsx — layout raíz de Next.js App Router

// Sistema de diseño "Faro" (papel cálido + faro índigo): faro.css es una copia fiel del
// handoff (frontend-handoff/design_handoff_faro/styles.css). Edítalo allí y re-sincroniza,
// no a mano aquí. En el App Router el CSS global solo puede importarse desde el layout raíz.
import './faro.css';

export const metadata = {
  title: 'Faro — Copiloto de planificación docente',
  description: 'Genera documentos pedagógicos alineados al currículum nacional (MINEDUC).',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

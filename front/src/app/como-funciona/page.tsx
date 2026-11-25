import { GRUPOS_MOTORES, type EstadoMotor } from '@/dominio/motores';
import { Icono } from '@/componentes/Icono';

export const metadata = { title: 'Cómo funciona' };

const ESTADO: Record<EstadoMotor, { texto: string; clase: string }> = {
  activo: { texto: 'Activo', clase: 'confirmed' },
  parcial: { texto: 'Parcial', clase: 'media' },
  'en-desarrollo': { texto: 'En desarrollo', clase: 'confirmar' },
};

export default function ComoFunciona() {
  const motores = GRUPOS_MOTORES.flatMap((g) => g.motores);
  const activos = motores.filter((m) => m.estado !== 'en-desarrollo').length;
  return (
    <>
      <section className="page-lead">
        <h1>Cómo funciona AXIS</h1>
        <p>{motores.length} motores en cinco grupos. Las salidas de un motor alimentan las comprobaciones del siguiente. Hoy corren {activos}; el resto se muestra con su estado real.</p>
      </section>
      <ol className="pipeline" aria-label="Flujo del análisis">
        {['Leer el expediente', 'Identificar obra y tramo', 'Ejecutar pruebas aplicables', 'Aprender de obras terminadas y paralizadas'].map((paso, i) => <li key={paso}><span>{i + 1}</span>{paso}</li>)}
      </ol>
      <section className="engine-catalog" aria-labelledby="catalogo">
        <h2 id="catalogo">Motores por función</h2>
        {GRUPOS_MOTORES.map((g, i) => (
          <details key={g.id} open={i === 0}>
            <summary>
              <span><Icono nombre={g.icono} tamano={22} />{g.nombre}</span>
              <span>{g.motores.filter((m) => m.estado !== 'en-desarrollo').length} de {g.motores.length} activos <Icono nombre="down" tamano={18} /></span>
            </summary>
            <ul>
              {g.motores.map((m) => (
                <li key={m.id}>
                  <strong>{m.nombre}</strong>
                  <span>
                    {m.proposito}{' '}
                    <span className={`pill ${ESTADO[m.estado].clase}`}>{ESTADO[m.estado].texto}</span>
                    {m.pendiente && <small className="engine-pending">Pendiente: {m.pendiente}</small>}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
    </>
  );
}

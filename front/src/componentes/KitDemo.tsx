'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icono } from './Icono';
import { revisarDemo } from './demo/GuiaDemo';
import { EVENTO_DEMO, guardarDemo, leerDemo, type EstadoDemo } from './demo/estado';

// Botón de la portada que arranca la demo de una vez: revisa el expediente del siguiente
// escenario que el modelo todavía no aprendió. La guía de abajo lleva el resto.

export interface EscenarioKit {
  id: string; zona: string; titulo: string; situacion: string; aprendido: boolean;
  original: { archivo: string; via: string };
  obra: { archivo: string; tipo: string };
  cercano: { archivo: string; via: string; distancia: number };
}

/** Adónde continuar una demo empezada (null: falta revisar el expediente cercano). */
function destinoDemo(d: EstadoDemo): string | null {
  if (d.paso === 1 && d.a) return `/revision/${d.a}`;
  if (d.paso === 2) return `/obras?escenario=${d.escenario}`;
  if (d.paso === 4 && d.b) return `/revision/${d.b}`;
  return null;
}

export function BotonDemo({ subidaDirecta, actual, lista }: { subidaDirecta: boolean; actual: EscenarioKit | null; lista: EscenarioKit[] }) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoDemo | null>(null);
  const [cargando, setCargando] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const leer = () => setEstado(leerDemo());
    leer();
    window.addEventListener(EVENTO_DEMO, leer);
    return () => window.removeEventListener(EVENTO_DEMO, leer);
  }, []);

  // El escenario de esta persona se mantiene hasta que lo termine.
  const e = lista.find((x) => x.id === estado?.escenario) ?? actual ?? lista[lista.length - 1];
  const numero = lista.findIndex((x) => x.id === e.id) + 1;
  const enCurso = estado?.escenario === e.id && estado.paso > 0 ? estado : null;

  const revisar = async (url: string, alTerminar: (id: string) => void) => {
    setError('');
    try {
      const id = await revisarDemo(url, subidaDirecta, setCargando);
      alTerminar(id);
      router.push(`/revision/${id}`);
    } catch (x) {
      setError((x as Error).message);
      setCargando('');
    }
  };
  const clic = () => {
    if (!enCurso) return revisar(e.original.archivo, (a) => guardarDemo({ escenario: e.id, paso: 1, a }));
    const destino = destinoDemo(enCurso);
    if (destino) router.push(destino);
    else revisar(e.cercano.archivo, (b) => guardarDemo({ ...enCurso, paso: 4, b }));
  };

  return (
    <div className="boton-demo">
      <button type="button" className="btn primary btn-grande" disabled={!!cargando} onClick={clic}>
        <Icono nombre={cargando ? 'clock' : 'arrow'} tamano={20} />{cargando || (enCurso ? 'Continuar la demo' : 'Empezar la demo')}
      </button>
      <small>
        Escenario {numero} de {lista.length} · {e.titulo} ({e.zona}). Unos 3 minutos, con una guía en cada pantalla.
        {enCurso && <> <button type="button" className="text-link" onClick={() => guardarDemo(null)}>Empezar de nuevo</button></>}
      </small>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

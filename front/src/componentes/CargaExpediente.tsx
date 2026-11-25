'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icono } from './Icono';
import { SelectorArchivos, enviar } from './SelectorArchivos';

export function CargaExpediente({ subidaDirecta }: { subidaDirecta: boolean }) {
  const router = useRouter();
  const [archivos, setArchivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [progreso, setProgreso] = useState('');
  const [error, setError] = useState('');

  const subir = async () => {
    setEnviando(true);
    setError('');
    try {
      const { id } = await enviar<{ id: string }>('/api/expedientes', archivos, {}, subidaDirecta, setProgreso);
      router.push(`/revision/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  };

  return (
    <div className="upload-section" id="cargar" tabIndex={-1}>
      <div className="section-heading"><h2>Sube un expediente</h2><p>Agrupa los documentos de una obra en una sola revisión.</p></div>
      <SelectorArchivos archivos={archivos} alCambiar={setArchivos} titulo="Arrastra tus archivos aquí" ayuda="PDF, Excel o Word" />
      {error && <p className="form-error" role="alert">{error}</p>}
      {archivos.length > 0 && (
        <div className="upload-actions">
          <button type="button" className="btn primary" onClick={subir} disabled={enviando} aria-busy={enviando}>
            <Icono nombre={enviando ? 'clock' : 'arrow'} tamano={18} />{enviando ? progreso || 'Leyendo documentos…' : 'Leer y clasificar'}
          </button>
        </div>
      )}
      <p className="inline-note"><Icono nombre="lock" tamano={15} /> Los documentos se guardan en el servidor de la entidad y solo se usan para esta revisión y para aprender de la obra.</p>
    </div>
  );
}

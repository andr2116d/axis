'use client';

import { useRef, useState } from 'react';
import { Icono } from './Icono';
import { tamano } from './ui';

const ACEPTADOS = /\.(pdf|xlsx?|docx?)$/i;

/** Zona para arrastrar o elegir archivos, con la lista de lo elegido. */
export function SelectorArchivos({ archivos, alCambiar, titulo, ayuda }: {
  archivos: File[];
  alCambiar: (archivos: File[]) => void;
  titulo: string;
  ayuda: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [error, setError] = useState('');

  const agregar = (lista: FileList | null) => {
    if (!lista) return;
    const nuevos = [...lista];
    const validos = nuevos.filter((f) => ACEPTADOS.test(f.name) && f.size > 0);
    setError(validos.length === nuevos.length ? '' : 'Selecciona archivos PDF, Excel o Word que tengan contenido.');
    const vistos = new Set(archivos.map((f) => `${f.name}${f.size}`));
    alCambiar([...archivos, ...validos.filter((f) => !vistos.has(`${f.name}${f.size}`) && vistos.add(`${f.name}${f.size}`))]);
  };

  return (
    <>
      <div
        className={`drop${arrastrando ? ' dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastrando(false); }}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); agregar(e.dataTransfer.files); }}
      >
        <span className="upload-mark"><Icono nombre="upload" tamano={25} /></span>
        <div><strong>{titulo}</strong><span>{ayuda}</span></div>
        <button type="button" className="btn secondary" onClick={() => entrada.current?.click()}>Elegir archivos</button>
        <input ref={entrada} type="file" accept=".pdf,.xlsx,.xls,.docx,.doc" multiple hidden onChange={(e) => { agregar(e.target.files); e.target.value = ''; }} />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {archivos.length > 0 && (
        <ul className="file-list">
          {archivos.map((f, i) => (
            <li key={`${f.name}${f.size}`}>
              <Icono nombre="file" tamano={17} />
              <span>{f.name} <small className="mono">{tamano(f.size)}</small></span>
              <button type="button" className="icon-btn" aria-label={`Quitar ${f.name}`} onClick={() => alCambiar(archivos.filter((_, j) => j !== i))}><Icono nombre="close" tamano={16} /></button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Envía archivos y campos a la API y devuelve el JSON, o lanza el mensaje del servidor.
 * Con `directa`, cada archivo se sube primero al almacén (sin pasar por el límite de
 * tamaño de una petición) y a la API solo llegan sus rutas.
 */
export async function enviar<T>(url: string, archivos: File[], campos: Record<string, string>, directa: boolean, alAvanzar?: (texto: string) => void): Promise<T> {
  let r: Response;
  if (directa) {
    const { uploadPresigned } = await import('@vercel/blob/client');
    const lote = crypto.randomUUID();
    const subidas = [];
    for (const [i, a] of archivos.entries()) {
      alAvanzar?.(`Subiendo ${i + 1} de ${archivos.length}…`);
      const limpio = a.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '_');
      const blob = await uploadPresigned(`subidas/${lote}/${limpio}`, a, { access: 'private', handleUploadUrl: '/api/subidas', multipart: a.size > 8 * 1024 * 1024 });
      subidas.push({ ruta: blob.pathname, nombre: a.name });
    }
    alAvanzar?.('Leyendo documentos…');
    r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ campos, subidas }) });
  } else {
    alAvanzar?.('Leyendo documentos…');
    const form = new FormData();
    Object.entries(campos).forEach(([k, v]) => form.set(k, v));
    archivos.forEach((a) => form.append('archivos', a));
    r = await fetch(url, { method: 'POST', body: form });
  }
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((cuerpo as { error?: string }).error ?? 'No se pudo completar la carga.');
  return cuerpo as T;
}

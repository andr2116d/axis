import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Dónde se guardan físicamente los datos de Axis. En Vercel, un store privado de
// Vercel Blob (BLOB_STORE_ID o BLOB_READ_WRITE_TOKEN). En local, el disco
// (AXIS_DATOS, por defecto .axis-datos/). El resto del servidor no sabe cuál usa.

export interface Respaldo {
  leer(ruta: string): Promise<Uint8Array | null>;
  escribir(ruta: string, datos: Uint8Array | string, tipo?: string): Promise<void>;
  borrar(ruta: string): Promise<void>;
  /** Nombres de las «carpetas» directas bajo el prefijo (sin la barra final). */
  carpetas(prefijo: string): Promise<string[]>;
}

export const usaBlob = Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

function discoLocal(): Respaldo {
  const raiz = path.resolve(process.env.AXIS_DATOS ?? '.axis-datos');
  const ruta = (r: string) => {
    const completa = path.resolve(raiz, r);
    if (!completa.startsWith(raiz + path.sep)) throw new Error('Ruta no válida');
    return completa;
  };
  return {
    async leer(r) {
      try {
        return new Uint8Array(await fs.readFile(ruta(r)));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw e;
      }
    },
    async escribir(r, datos) {
      const destino = ruta(r);
      await fs.mkdir(path.dirname(destino), { recursive: true });
      const temporal = `${destino}.${randomUUID()}.tmp`;
      await fs.writeFile(temporal, datos);
      await fs.rename(temporal, destino);
    },
    async borrar(r) {
      await fs.rm(ruta(r), { force: true });
    },
    async carpetas(prefijo) {
      const entradas = await fs.readdir(ruta(prefijo), { withFileTypes: true }).catch(() => []);
      return entradas.filter((e) => e.isDirectory()).map((e) => e.name);
    },
  };
}

function blobPrivado(): Respaldo {
  const blob = () => import('@vercel/blob');
  return {
    async leer(r) {
      const { get } = await blob();
      // Sin caché: una revisión recién guardada debe leerse tal cual.
      const res = await get(r, { access: 'private', useCache: false });
      if (!res || res.statusCode !== 200) return null;
      return new Uint8Array(await new Response(res.stream).arrayBuffer());
    },
    async escribir(r, datos, tipo = 'application/octet-stream') {
      const { put } = await blob();
      await put(r, typeof datos === 'string' ? datos : Buffer.from(datos), {
        access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: tipo,
      });
    },
    async borrar(r) {
      const { del } = await blob();
      await del(r);
    },
    async carpetas(prefijo) {
      const { list } = await blob();
      const nombres: string[] = [];
      let cursor: string | undefined;
      do {
        const pagina = await list({ prefix: `${prefijo}/`, mode: 'folded', cursor });
        nombres.push(...pagina.folders.map((f) => f.slice(prefijo.length + 1).replace(/\/$/, '')));
        cursor = pagina.hasMore ? pagina.cursor : undefined;
      } while (cursor);
      return nombres;
    },
  };
}

export const respaldo: Respaldo = usaBlob ? blobPrivado() : discoLocal();

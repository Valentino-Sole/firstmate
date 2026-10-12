// Gebündelte Auslieferung: Wenn neben der Seite ein packs/-Ordner liegt
// (erzeugt von tools/build_artifact.py), werden alle Bilddateien aus wenigen
// Paketdateien geladen und über Blob-Adressen aufgelöst. Ohne packs/-Ordner
// (lokaler Spielordner) bleibt jeder Pfad unverändert; das Spiel merkt
// keinen Unterschied. Inhalte und Dateinamen der Assets ändern sich nicht.

let urlMap = null;

export async function initAssetPack() {
  // Nur die gebündelte Auslieferung trägt die Markierung; so entsteht im
  // lokalen Spielordner kein 404-Probelauf in der Konsole.
  if (!document.querySelector('meta[name="fabelbruch-packs"]')) return false;
  try {
    const res = await fetch('packs/manifest.json', { cache: 'no-cache' });
    if (!res.ok) return false;
    const manifest = await res.json();
    const buffers = await Promise.all(
      manifest.packs.map((name) => fetch(`packs/${name}`).then((r) => {
        if (!r.ok) throw new Error(`Paket ${name}: HTTP ${r.status}`);
        return r.arrayBuffer();
      })),
    );
    const map = new Map();
    for (const [path, [pack, offset, length, mime]] of Object.entries(manifest.files)) {
      const blob = new Blob([buffers[pack].slice(offset, offset + length)], { type: mime });
      map.set(path, URL.createObjectURL(blob));
    }
    urlMap = map;
    return true;
  } catch (err) {
    urlMap = null;
    return false;
  }
}

export function assetUrl(path) {
  if (urlMap && typeof path === 'string') {
    const hit = urlMap.get(path);
    if (hit) return hit;
  }
  return path;
}

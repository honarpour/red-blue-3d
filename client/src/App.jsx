import { useEffect, useRef, useState, useCallback } from 'react';

const DEFAULTS = {
  mode: 'optimized', shift: 0, depth: 3, blur: 8, swap: false,
  maxSize: 1600, format: 'png', quality: 92,
};

const MODES = [
  ['optimized', 'Optimized'],
  ['color', 'Color'],
  ['half', 'Half color'],
  ['gray', 'Gray'],
  ['true', 'True (red/blue)'],
];

let nextId = 1;

async function convert(file, s, signal) {
  const fd = new FormData();
  fd.append('image', file);
  Object.entries(s).forEach(([k, v]) => fd.append(k, String(v)));
  const res = await fetch('/api/convert', { method: 'POST', body: fd, signal });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return URL.createObjectURL(await res.blob());
}

function Slider({ label, value, min, max, step, onChange, hint }) {
  return (
    <label className="field">
      <span>{label} <b>{value}</b></span>
      <input type="range" {...{ min, max, step, value }} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export default function App() {
  const [items, setItems] = useState([]); // {id, file, name, result, status, error}
  const [s, setS] = useState(DEFAULTS);
  const [selected, setSelected] = useState(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef();
  const jobs = useRef(new Map());

  const set = (k) => (v) => setS((p) => ({ ...p, [k]: v }));

  const patch = (id, p) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const run = useCallback(async (item, settings) => {
    jobs.current.get(item.id)?.abort();
    const ctl = new AbortController();
    jobs.current.set(item.id, ctl);
    patch(item.id, { status: 'working', error: null });
    try {
      const url = await convert(item.file, settings, ctl.signal);
      setItems((prev) => prev.map((i) => {
        if (i.id !== item.id) return i;
        if (i.result) URL.revokeObjectURL(i.result);
        return { ...i, result: url, status: 'done' };
      }));
    } catch (e) {
      if (e.name !== 'AbortError') patch(item.id, { status: 'error', error: e.message });
    }
  }, []);

  const addFiles = (files) => {
    const imgs = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif|tiff?)$/i.test(f.name));
    const added = imgs.map((file) => ({ id: nextId++, file, name: file.name, result: null, status: 'queued' }));
    if (!added.length) return;
    setItems((prev) => [...prev, ...added]);
    setSelected((cur) => cur ?? added[0].id);
  };

  // Re-convert every image (debounced) whenever settings change or new items appear.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    const t = setTimeout(async () => {
      const list = itemsRef.current;
      // Selected first so the main preview updates quickly, then the rest one by one.
      const ordered = [...list].sort((a) => (a.id === selected ? -1 : 1));
      for (const it of ordered) await run(it, s);
    }, 350);
    return () => clearTimeout(t);
  }, [s, items.length, selected, run]);

  const remove = (id) => {
    jobs.current.get(id)?.abort();
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSelected((cur) => (cur === id ? null : cur));
  };

  const ext = s.format === 'jpeg' ? 'jpg' : 'png';
  const outName = (n) => n.replace(/\.[^.]+$/, '') + `-3d.${ext}`;

  const saveAll = async () => {
    for (const it of items.filter((i) => i.result)) {
      const a = document.createElement('a');
      a.href = it.result; a.download = outName(it.name);
      a.click();
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  const current = items.find((i) => i.id === selected) ?? items[0];
  const busy = items.some((i) => i.status === 'working' || i.status === 'queued');

  return (
    <div className="app">
      <header>
        <h1><span className="r">Red</span>/<span className="c">Blue</span> 3D</h1>
        <p>Turn photos into anaglyph 3D. Wear red-cyan glasses (red on the left eye).</p>
      </header>

      <div className="layout">
        <aside>
          <div
            className={`drop ${drag ? 'over' : ''}`}
            onClick={() => inputRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
          >
            <strong>Select images</strong>
            <span>or drop them here</span>
            <input ref={inputRef} type="file" accept="image/*" multiple hidden
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>

          <label className="field">
            <span>Colour mode</span>
            <select value={s.mode} onChange={(e) => set('mode')(e.target.value)}>
              {MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <Slider label="Depth strength" value={s.depth} min={0} max={10} step={0.25} onChange={set('depth')}
            hint="Pseudo depth from brightness: brighter areas pop out." />
          <Slider label="Depth smoothness" value={s.blur} min={0.5} max={40} step={0.5} onChange={set('blur')} />
          <Slider label="Overall shift" value={s.shift} min={-5} max={5} step={0.1} onChange={set('shift')}
            hint="Moves the whole scene towards or behind the screen." />
          <label className="check">
            <input type="checkbox" checked={s.swap} onChange={(e) => set('swap')(e.target.checked)} />
            Invert depth (swap eyes)
          </label>

          <div className="row">
            <label className="field">
              <span>Format</span>
              <select value={s.format} onChange={(e) => set('format')(e.target.value)}>
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
              </select>
            </label>
            <label className="field">
              <span>Max size</span>
              <select value={s.maxSize} onChange={(e) => set('maxSize')(Number(e.target.value))}>
                {[1000, 1600, 2400, 4000].map((n) => <option key={n} value={n}>{n}px</option>)}
              </select>
            </label>
          </div>
          <button className="ghost" onClick={() => setS(DEFAULTS)}>Reset settings</button>
        </aside>

        <main>
          {!current ? (
            <div className="empty">No images yet. Select one or more to get started.</div>
          ) : (
            <>
              <div className="stage">
                {current.result
                  ? <img src={current.result} alt="3D result" style={{ opacity: current.status === 'working' ? 0.6 : 1 }} />
                  : <div className="empty">{current.status === 'error' ? current.error : 'Converting…'}</div>}
              </div>
              <div className="bar">
                <span>{current.name}{current.status === 'working' && ' · updating…'}</span>
                <span className="grow" />
                {current.result && (
                  <a className="btn" href={current.result} download={outName(current.name)}>Download</a>
                )}
                <button className="btn" onClick={saveAll} disabled={busy || !items.some((i) => i.result)}>
                  Download all ({items.length})
                </button>
              </div>
              <div className="thumbs">
                {items.map((i) => (
                  <div key={i.id} className={`thumb ${i.id === current.id ? 'sel' : ''}`} onClick={() => setSelected(i.id)}>
                    {i.result ? <img src={i.result} alt="" /> : <div className="ph">{i.status === 'error' ? '!' : '…'}</div>}
                    <button title="Remove" onClick={(e) => { e.stopPropagation(); remove(i.id); }}>×</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

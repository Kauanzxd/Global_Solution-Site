/* SADEC — mapa de ruas reais (OpenStreetMap) sem biblioteca.
   Os blocos de 256 px do tile.openstreetmap.org entram como <image> num SVG em coordenadas de pixel
   da projeção Web Mercator; rotas, unidades e drones ficam no mesmo SVG. Arrastar move o mapa;
   os botões aproximam, afastam e centralizam. Atribuição "© OpenStreetMap" obrigatória no HTML.
   Uma rota: mostrar({ pontos, progresso, drone }). Várias (Central): mostrar({ rotas: [{ id, pontos, progresso, drone, prio }], foco }). */
(function (root) {
  'use strict';
  const SIDEC = (root.SIDEC = root.SIDEC || {});
  const doc = root.document;
  const NS = 'http://www.w3.org/2000/svg';
  const TILE = 256;
  const Z_MIN = 10;
  const Z_MAX = 18;

  function svg(tag, attrs, children) {
    const n = doc.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
    [].concat(children || []).forEach((c) => n.append(c));
    return n;
  }

  /* Web Mercator: graus -> pixel do mundo no zoom z */
  function projetar(lat, lon, z) {
    const escala = TILE * Math.pow(2, z);
    const s = Math.sin(lat * Math.PI / 180);
    return { x: (lon + 180) / 360 * escala, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * escala };
  }
  function desprojetar(x, y, z) {
    const escala = TILE * Math.pow(2, z);
    const n = Math.PI - 2 * Math.PI * y / escala;
    return { lat: 180 / Math.PI * Math.atan(Math.sinh(n)), lon: x / escala * 360 - 180 };
  }

  /* Distância em km (haversine), para o trecho percorrido da rota */
  function km(a, b) {
    const r = Math.PI / 180;
    const h = Math.pow(Math.sin((b.lat - a.lat) * r / 2), 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.pow(Math.sin((b.lon - a.lon) * r / 2), 2);
    return 12742 * Math.asin(Math.sqrt(h));
  }

  /* Ponto ao longo da rota (0 a 1) */
  function pontoNaRota(pts, f) {
    const trechos = pts.slice(1).map((p, i) => km(pts[i], p));
    let resta = trechos.reduce((s, t) => s + t, 0) * Math.max(0, Math.min(1, f));
    for (let i = 0; i < trechos.length; i += 1) {
      if (resta <= trechos[i] || i === trechos.length - 1) {
        const t = trechos[i] ? resta / trechos[i] : 1;
        return { indice: i, lat: pts[i].lat + (pts[i + 1].lat - pts[i].lat) * t, lon: pts[i].lon + (pts[i + 1].lon - pts[i].lon) * t };
      }
      resta -= trechos[i];
    }
    return { indice: 0, lat: pts[0].lat, lon: pts[0].lon };
  }

  /* Sem telemetria real: a posição em voo de um pedido da Central é estimada pelo horário da
     decolagem e pela distância, no cruzeiro de referência (o mesmo da simulação e da API). */
  const VELOCIDADE_KMH = 48;
  const ESCALA_TEMPO = 12; // demonstração: 1 min da operação = 5 s reais (igual à API); minutos exibidos são os realistas
  function estimarVoo(p, agora) {
    if (p.status === 'entregue') return { f: 1, chegou: true, faltamMin: 0 };
    if (p.status !== 'em_voo') return { f: 0 };
    const ev = (p.eventos || []).filter((e) => e.status_novo === 'em_voo').pop();
    const ini = p.decolou_em || (ev && ev.data_hora) || p.data_hora; // pedido de exemplo sem evento: horário do pedido
    const t0 = ini ? new Date(String(ini).replace(' ', 'T')).getTime() : agora;
    const duracao = Math.max(60000, (p.distancia_km || 1) / VELOCIDADE_KMH * 3600000); // duração realista do voo
    const real = duracao / ESCALA_TEMPO; // espera real na demonstração
    const f = Math.max(0, (agora - t0) / real);
    return {
      f: Math.min(0.97, f), chegou: f >= 1, duracaoMin: Math.round(duracao / 60000),
      faltamMin: Math.max(0, Math.ceil((1 - Math.min(1, f)) * duracao / 60000)),
      chegada: t0 + duracao // horário previsto se o voo corresse em tempo real
    };
  }

  /* opcoes.aoEscolher(id): toque num drone ou destino de uma rota (sem arrastar) */
  function criar(alvo, opcoes) {
    const cfg = opcoes || {};
    const camadas = { tiles: svg('g'), rede: svg('g', { class: 'osm__rede' }), rota: svg('g'), marcas: svg('g'), drones: svg('g') };
    alvo.append(camadas.tiles, camadas.rede, camadas.rota, camadas.marcas, camadas.drones);
    let z = 12;
    let centro = { lat: -23.55, lon: -46.63 };
    let dados = { rotas: [], rede: [], foco: null };
    const droneNos = new Map(); // grupo fixo por rota: só o translate muda (o CSS anima)

    const tamanho = () => ({ w: Math.max(200, alvo.clientWidth || 600), h: Math.max(200, alvo.clientHeight || 400) });
    const validas = () => dados.rotas.filter((r) => r.pontos && r.pontos.length >= 2);

    function desenhar(animar) {
      alvo.classList.toggle('is-estatico', !animar);
      const { w, h } = tamanho();
      const c = projetar(centro.lat, centro.lon, z);
      const x0 = c.x - w / 2;
      const y0 = c.y - h / 2;
      alvo.setAttribute('viewBox', [x0, y0, w, h].map((n) => n.toFixed(1)).join(' '));

      const n = Math.pow(2, z);
      const imgs = [];
      for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x0 + w) / TILE); tx += 1) {
        for (let ty = Math.max(0, Math.floor(y0 / TILE)); ty <= Math.min(n - 1, Math.floor((y0 + h) / TILE)); ty += 1) {
          const wx = ((tx % n) + n) % n;
          imgs.push(svg('image', { href: 'https://tile.openstreetmap.org/' + z + '/' + wx + '/' + ty + '.png', x: tx * TILE, y: ty * TILE, width: TILE, height: TILE }));
        }
      }
      camadas.tiles.replaceChildren(...imgs);

      const p = (q) => projetar(q.lat, q.lon, z);
      const xy = (q) => { const r = p(q); return r.x.toFixed(1) + ' ' + r.y.toFixed(1); };
      // Rede de unidades (hospitais do CNES) como pontos discretos
      camadas.rede.classList.toggle('is-oculta', z < 12);
      camadas.rede.replaceChildren(...dados.rede.map((l) => {
        const q = p(l);
        return svg('circle', { cx: q.x.toFixed(1), cy: q.y.toFixed(1), r: 3 }, svg('title', {}, l.nome));
      }));

      const rotas = validas();
      const toD = (lista) => lista.map((q, i) => (i ? 'L' : 'M') + xy(q)).join(' ');
      const paths = [];
      const marcas = new Map();
      const vivos = new Set();
      rotas.forEach((r) => {
        const atual = pontoNaRota(r.pontos, r.progresso || 0);
        const cls = (r.prio ? ' osm--p' + r.prio : '') + (dados.foco && dados.foco === r.id ? ' is-foco' : '') + (dados.foco && dados.foco !== r.id ? ' is-fundo' : '');
        paths.push(
          svg('path', { class: 'osm__faixa' + cls, d: toD(r.pontos) }),
          svg('path', { class: 'osm__feito' + cls, d: toD(r.pontos.slice(0, atual.indice + 1).concat([atual])) }),
          svg('path', { class: 'osm__falta' + cls, d: toD([atual].concat(r.pontos.slice(atual.indice + 1))) })
        );
        r.pontos.forEach((q) => {
          const chave = q.tipo + '|' + q.nome;
          if (marcas.has(chave) && !(dados.foco === r.id)) return;
          const destino = q.tipo === 'destino';
          marcas.set(chave, svg('g', { class: 'osm__marca osm__marca--' + q.tipo + cls, transform: 'translate(' + xy(q) + ')', 'data-rota': r.id || '' }, [
            svg('title', {}, q.nome + (q.endereco ? ' — ' + q.endereco : '')),
            destino ? svg('circle', { class: 'osm__halo', r: 18 }) : null,
            svg('circle', { r: destino ? 9 : 7 }),
            svg('circle', { class: 'osm__miolo', r: 3 })
          ].filter(Boolean)));
        });
        if (!r.drone) return;
        const id = r.id || 'unica';
        vivos.add(id);
        let g = droneNos.get(id);
        if (!g) {
          g = svg('g', { class: 'osm__drone', 'data-rota': r.id || '' }, [svg('circle', { class: 'osm__drone-anel', r: 13 }), svg('circle', { class: 'osm__drone-ponto', r: 7 }), svg('title', {}, '')]);
          camadas.drones.append(g);
          droneNos.set(id, g);
        }
        g.setAttribute('class', 'osm__drone' + cls);
        g.lastChild.textContent = r.drone;
        g.setAttribute('transform', 'translate(' + xy(atual) + ')');
      });
      droneNos.forEach((g, id) => { if (!vivos.has(id)) { g.remove(); droneNos.delete(id); } });
      camadas.rota.replaceChildren(...paths);
      camadas.marcas.replaceChildren(...marcas.values());
    }

    /* Enquadra a rota em foco (ou todas) com uma margem */
    function enquadrar() {
      const foco = dados.foco ? validas().filter((r) => r.id === dados.foco) : [];
      const pts = (foco.length ? foco : validas()).flatMap((r) => r.pontos);
      if (!pts.length) { desenhar(false); return; }
      const { w, h } = tamanho();
      const folga = w < 520 ? 0.6 : 0.72; // celular: mais margem em volta da rota
      for (z = Z_MAX; z > Z_MIN; z -= 1) {
        const ps = pts.map((q) => projetar(q.lat, q.lon, z));
        const dx = Math.max(...ps.map((q) => q.x)) - Math.min(...ps.map((q) => q.x));
        const dy = Math.max(...ps.map((q) => q.y)) - Math.min(...ps.map((q) => q.y));
        if (dx < w * folga && dy < h * folga) break;
      }
      const lats = pts.map((q) => q.lat);
      const lons = pts.map((q) => q.lon);
      centro = { lat: (Math.max(...lats) + Math.min(...lats)) / 2, lon: (Math.max(...lons) + Math.min(...lons)) / 2 };
      desenhar(false);
    }

    /* Arrastar com mouse, toque ou caneta; toque sem arrastar escolhe a rota */
    let arraste = null;
    alvo.addEventListener('pointerdown', (e) => {
      const alvoRota = e.target.closest && e.target.closest('[data-rota]');
      arraste = { x: e.clientX, y: e.clientY, c: projetar(centro.lat, centro.lon, z), rota: alvoRota ? alvoRota.getAttribute('data-rota') : '', moveu: false };
      alvo.setPointerCapture(e.pointerId);
      alvo.classList.add('is-arrastando');
    });
    alvo.addEventListener('pointermove', (e) => {
      if (!arraste) return;
      if (Math.abs(e.clientX - arraste.x) + Math.abs(e.clientY - arraste.y) > 4) arraste.moveu = true;
      const escala = tamanho().w / alvo.getBoundingClientRect().width;
      centro = desprojetar(arraste.c.x - (e.clientX - arraste.x) * escala, arraste.c.y - (e.clientY - arraste.y) * escala, z);
      desenhar(false);
    });
    const soltar = () => {
      if (arraste && !arraste.moveu && arraste.rota && cfg.aoEscolher) cfg.aoEscolher(arraste.rota);
      arraste = null;
      alvo.classList.remove('is-arrastando');
    };
    alvo.addEventListener('pointerup', soltar);
    alvo.addEventListener('pointercancel', () => { arraste = null; alvo.classList.remove('is-arrastando'); });
    if (root.ResizeObserver) new root.ResizeObserver(() => desenhar(false)).observe(alvo);

    return {
      mostrar(novos, reenquadrar) {
        const n = novos || {};
        dados = {
          rotas: n.rotas || [{ id: 'unica', pontos: n.pontos || [], progresso: n.progresso || 0, drone: n.drone || null }],
          rede: n.rede || [],
          foco: n.foco || null
        };
        if (reenquadrar) enquadrar();
        else desenhar(true);
      },
      zoom(delta) {
        z = Math.max(Z_MIN, Math.min(Z_MAX, z + delta));
        desenhar(false);
      },
      centralizarDrone() {
        const r = validas().find((x) => x.id === dados.foco && x.drone) || validas().find((x) => x.drone);
        if (!r) return;
        const a = pontoNaRota(r.pontos, r.progresso || 0);
        centro = { lat: a.lat, lon: a.lon };
        z = Math.max(z, 15);
        desenhar(false);
      },
      enquadrar
    };
  }

  SIDEC.mapaOsm = { criar, km, pontoNaRota, projetar, estimarVoo, VELOCIDADE_KMH, ESCALA_TEMPO };
})(window);

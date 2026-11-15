/* SIDEC — motor de operações da central (regras de prioridade, autonomia, seleção, voo e contingência).
   Funções puras sobre um objeto de estado; usadas pelo navegador (window.SIDEC.ops) e pelos testes em Node. */
(function (root) {
  'use strict';

  const FLIGHT_MS_PER_KM = 3000; // simulação acelerada: 1 km de voo = 3 s
  const RESERVA = { 1: 0.3, 2: 0.15, 3: 0.15, 4: 0.15 }; // órgão: 30% (regra oficial); demais: 15% (ilustrativo)
  const CORREDOR_KM = 2.5; // distância máxima de uma zona de pouso até a rota
  const FAIXA_TERMICA = { min: 2, max: 8 };

  const PRIORIDADES = { 1: 'Órgãos', 2: 'Emergência', 3: 'Saúde', 4: 'Comercial' };
  const STATUS = {
    fila: 'Na fila', atribuida: 'Drone atribuído', em_voo: 'Em voo', entregue: 'Entregue',
    outro_meio: 'Outro meio de transporte', pouso_emergencia: 'Pouso de emergência',
    disponivel: 'Disponível', atribuido: 'Aguardando decolagem', manutencao: 'Em manutenção'
  };

  const round1 = (n) => Math.round(n * 10) / 10;
  const byId = (list, id) => list.find((x) => x.id === id) || null;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function findPoint(state, id) {
    return byId(state.filiais, id) || byId(state.locais, id) || byId(state.zonas, id);
  }

  function addLog(state, msg, tipo) {
    state.log = state.log || [];
    state.log.unshift({ msg, tipo: tipo || 'info' });
    state.log.length = Math.min(state.log.length, 40);
  }

  function distanceToSegment(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
  }

  /* Relação N:N Rota ↔ ZonaPouso: zonas dentro do corredor de qualquer trecho do trajeto. */
  function zonesNearPath(state, points) {
    return state.zonas
      .filter((z) => points.slice(1).some((p, i) => distanceToSegment(z, points[i], p) <= CORREDOR_KM))
      .sort((a, b) => distance(a, points[0]) - distance(b, points[0]));
  }

  function routeLandingZones(state, origemId, destinoId) {
    return zonesNearPath(state, [findPoint(state, origemId), findPoint(state, destinoId)]);
  }

  function sortQueue(state) {
    return state.entregas
      .filter((e) => e.status === 'fila')
      .sort((a, b) => a.prioridade - b.prioridade || a.ordem - b.ordem);
  }

  /* Regra de autonomia isolada da geometria: usada pela central e pelo simulador do SIDEC Saúde. */
  function estimateAutonomy({ km, consumoKm, bateria, prioridade }) {
    const consumo = round1(km * consumoKm);
    const reserva = RESERVA[prioridade];
    const necessario = round1(consumo * (1 + reserva));
    return { ok: bateria >= necessario, km: round1(km), consumo, reserva, necessario, sobra: round1(bateria - necessario) };
  }

  function checkAutonomy(state, drone, entrega) {
    const origem = findPoint(state, entrega.origemId);
    const destino = findPoint(state, entrega.destinoId);
    const km = round1(distance(drone, origem) + distance(origem, destino));
    return estimateAutonomy({ km, consumoKm: drone.consumoKm, bateria: drone.bateria, prioridade: entrega.prioridade });
  }

  function filialAdequada(state, entrega) {
    const origem = findPoint(state, entrega.origemId);
    return state.filiais.slice().sort((a, b) => distance(a, origem) - distance(b, origem))[0];
  }

  const isFree = (drone) => drone.status === 'disponivel';

  /* Drone atribuído a entrega comercial (P4) que ainda não decolou: pode ser realocado por P1/P2. */
  function isPreemptable(state) {
    return (drone) => {
      const e = drone.status === 'atribuido' ? byId(state.entregas, drone.entregaId) : null;
      return Boolean(e && e.prioridade === 4 && e.status === 'atribuida');
    };
  }

  function selectDrone(state, entrega, filtro) {
    const accept = filtro || isFree;
    const filial = filialAdequada(state, entrega);
    const rejeitados = [];
    const candidatos = [];
    state.drones.forEach((drone) => {
      if (!accept(drone)) {
        rejeitados.push({ droneId: drone.id, motivo: 'indisponível (' + (STATUS[drone.status] || drone.status).toLowerCase() + ')' });
        return;
      }
      if (entrega.pesoKg > drone.cargaMaxKg) {
        rejeitados.push({ droneId: drone.id, motivo: 'carga de ' + entrega.pesoKg + ' kg acima do limite de ' + drone.cargaMaxKg + ' kg' });
        return;
      }
      const autonomia = checkAutonomy(state, drone, entrega);
      if (!autonomia.ok) {
        rejeitados.push({ droneId: drone.id, motivo: 'bateria ' + drone.bateria + '% < ' + autonomia.necessario + '% necessários' });
        return;
      }
      candidatos.push({ drone, autonomia, dist: distance(drone, filial) });
    });
    candidatos.sort((a, b) => a.dist - b.dist || b.drone.bateria - a.drone.bateria);
    const best = candidatos[0];
    return { drone: best ? best.drone : null, autonomia: best ? best.autonomia : null, filial, rejeitados };
  }

  function dispatch(state, entregaId) {
    const e = byId(state.entregas, entregaId);
    if (!e || e.status !== 'fila') return { ok: false, motivo: 'Entrega não está na fila.' };

    let sel = selectDrone(state, e);
    let preempted = null;
    if (!sel.drone && e.prioridade <= 2) {
      const alt = selectDrone(state, e, isPreemptable(state));
      if (alt.drone) {
        preempted = byId(state.entregas, alt.drone.entregaId);
        Object.assign(preempted, { status: 'fila', droneId: null, motivo: 'Reorganizada para atender ' + e.id + ' (' + PRIORIDADES[e.prioridade] + ').' });
        addLog(state, preempted.id + ' (comercial) voltou para a fila: ' + alt.drone.nome + ' realocado para ' + e.id + '.', 'warn');
        sel = alt;
      }
    }

    if (!sel.drone) {
      const semCapacidade = state.drones.length > 0 && state.drones.every((d) => e.pesoKg > d.cargaMaxKg);
      if (e.prioridade <= 2 || semCapacidade) {
        e.status = 'outro_meio';
        e.motivo = semCapacidade
          ? 'Carga acima da capacidade de toda a frota.'
          : 'Nenhum drone disponível com carga e autonomia suficientes.';
        addLog(state, e.id + ': ' + e.motivo + ' Acionar outro meio de transporte.', 'erro');
        return { ok: false, status: 'outro_meio', motivo: e.motivo, rejeitados: sel.rejeitados };
      }
      e.motivo = 'Aguardando drone disponível.';
      return { ok: false, status: 'fila', motivo: e.motivo, rejeitados: sel.rejeitados };
    }

    const d = sel.drone;
    const a = sel.autonomia;
    Object.assign(d, { status: 'atribuido', entregaId: e.id });
    Object.assign(e, { status: 'atribuida', droneId: d.id, motivo: null, km: a.km, consumo: a.consumo, necessario: a.necessario });
    addLog(state, e.id + ' → ' + d.nome + ' (' + sel.filial.nome + '): ' + a.km + ' km, consumo ' + a.consumo + '% + reserva ' +
      Math.round(a.reserva * 100) + '% = ' + a.necessario + '% ≤ bateria ' + d.bateria + '%.', 'ok');
    return { ok: true, status: 'atribuida', droneId: d.id, preemptedId: preempted ? preempted.id : null, rejeitados: sel.rejeitados };
  }

  function processQueue(state) {
    const tried = new Set();
    const results = [];
    let next = sortQueue(state).find((e) => !tried.has(e.id));
    while (next) {
      tried.add(next.id);
      results.push(Object.assign({ id: next.id }, dispatch(state, next.id)));
      next = sortQueue(state).find((e) => !tried.has(e.id));
    }
    return results;
  }

  function launch(state, entregaId, now) {
    const e = byId(state.entregas, entregaId);
    if (!e || e.status !== 'atribuida') return { ok: false, motivo: 'Somente entregas com drone atribuído podem decolar.' };
    const d = byId(state.drones, e.droneId);
    Object.assign(e, {
      status: 'em_voo',
      inicio: now,
      duracaoMs: e.km * FLIGHT_MS_PER_KM,
      bateriaInicial: d.bateria,
      trajeto: [{ x: d.x, y: d.y }, findPoint(state, e.origemId), findPoint(state, e.destinoId)].map((p) => ({ x: p.x, y: p.y }))
    });
    d.status = 'em_voo';
    addLog(state, e.id + ' decolou com ' + d.nome + '.', 'info');
    return { ok: true };
  }

  function flightProgress(e, now) {
    if (e.status === 'entregue') return 1;
    if (typeof e.inicio !== 'number' || !e.duracaoMs) return 0;
    return Math.max(0, Math.min(1, (now - e.inicio) / e.duracaoMs));
  }

  function positionAt(trajeto, progress) {
    const lens = trajeto.slice(1).map((p, i) => distance(trajeto[i], p));
    let restante = lens.reduce((s, l) => s + l, 0) * progress;
    for (let i = 0; i < lens.length; i += 1) {
      if (restante <= lens[i] || i === lens.length - 1) {
        const t = lens[i] === 0 ? 1 : Math.min(1, restante / lens[i]);
        const a = trajeto[i];
        const b = trajeto[i + 1];
        return { x: round1(a.x + (b.x - a.x) * t), y: round1(a.y + (b.y - a.y) * t) };
      }
      restante -= lens[i];
    }
    return { x: trajeto[0].x, y: trajeto[0].y };
  }

  function tick(state, now) {
    const done = [];
    state.entregas.forEach((e) => {
      if (e.status !== 'em_voo' || flightProgress(e, now) < 1) return;
      const d = byId(state.drones, e.droneId);
      const destino = findPoint(state, e.destinoId);
      Object.assign(e, { status: 'entregue', fim: now });
      Object.assign(d, { status: 'disponivel', entregaId: null, x: destino.x, y: destino.y, bateria: round1(e.bateriaInicial - e.consumo) });
      addLog(state, e.id + ' entregue em ' + destino.nome + '. Recebimento confirmado.', 'ok');
      done.push(e.id);
    });
    return done;
  }

  function emergencyLanding(state, entregaId, tipo, now) {
    const e = byId(state.entregas, entregaId);
    if (!e || e.status !== 'em_voo') return { ok: false, motivo: 'A demonstração de pane exige uma entrega em voo.' };
    const d = byId(state.drones, e.droneId);
    const progress = flightProgress(e, now);
    const pos = positionAt(e.trajeto, progress);
    const corredor = zonesNearPath(state, e.trajeto);
    const pool = corredor.length ? corredor : state.zonas;
    const zona = pool.slice().sort((a, b) => distance(a, pos) - distance(b, pos))[0];
    const paraquedas = tipo === 'grave';
    const ponto = paraquedas ? pos : { x: zona.x, y: zona.y };
    e.status = 'pouso_emergencia';
    e.evento = { tipo, zonaId: zona.id, x: ponto.x, y: ponto.y, paraquedas, resgate: true, progresso: progress };
    Object.assign(d, { status: 'pouso_emergencia', x: ponto.x, y: ponto.y, bateria: round1(e.bateriaInicial - e.consumo * progress) });
    addLog(state, paraquedas
      ? e.id + ': falha grave. Paraquedas, luzes e alerta sonoro acionados. Carga aguarda resgate (referência: ' + zona.nome + ').'
      : e.id + ': ' + (tipo === 'bateria' ? 'bateria insuficiente' : 'falha de motor') + '. Pouso seguro em ' + zona.nome + '. Carga aguarda resgate.', 'erro');
    return { ok: true, zona, paraquedas, x: ponto.x, y: ponto.y };
  }

  function checkTemperature(valor, faixa) {
    const f = faixa || FAIXA_TERMICA;
    const ok = valor >= f.min && valor <= f.max;
    return {
      ok,
      mensagem: ok
        ? 'Temperatura de ' + valor + ' °C dentro da faixa (' + f.min + '–' + f.max + ' °C).'
        : 'Alerta à equipe médica: ' + valor + ' °C fora da faixa de ' + f.min + '–' + f.max + ' °C.'
    };
  }

  /* Leitura demonstrativa e determinística (mesmo instante = mesmos valores em qualquer tela). */
  function sensorReading(state, e, now) {
    const progress = flightProgress(e, now);
    const pos = e.trajeto ? positionAt(e.trajeto, progress) : findPoint(state, e.origemId);
    const ativo = e.status === 'em_voo';
    const bateria = e.bateriaInicial ? round1(e.bateriaInicial - e.consumo * progress) : null;
    let temp = null;
    if (e.faixaTemp) {
      const meio = (e.faixaTemp.min + e.faixaTemp.max) / 2;
      temp = round1(meio + 1.2 * Math.sin(progress * Math.PI * 2) + (e.tempOffset || 0));
    }
    const vibracao = ativo ? Math.round((0.18 + 0.08 * Math.abs(Math.sin(progress * 17))) * 100) / 100 : 0;
    return { progress, x: pos.x, y: pos.y, bateria, temp, vibracao };
  }

  function createOrder(state, data) {
    const prioridade = Number(data.prioridade);
    const pesoKg = Number(data.pesoKg);
    const carga = String(data.carga || '').trim().slice(0, 80);
    if (![1, 2, 3, 4].includes(prioridade)) throw new Error('Prioridade inválida.');
    if (!(pesoKg > 0 && pesoKg <= 50)) throw new Error('Peso deve estar entre 0 e 50 kg.');
    if (!carga) throw new Error('Informe o tipo de carga.');
    if (!findPoint(state, data.origemId) || !findPoint(state, data.destinoId)) throw new Error('Origem ou destino inexistente.');
    if (data.origemId === data.destinoId) throw new Error('Origem e destino devem ser diferentes.');
    state.seq += 1;
    const e = {
      id: 'SDC-' + String(state.seq).padStart(4, '0'),
      prioridade, carga, pesoKg,
      origemId: data.origemId,
      destinoId: data.destinoId,
      solicitante: String(data.solicitante || 'Central SIDEC').slice(0, 60),
      status: 'fila', droneId: null, ordem: state.seq,
      faixaTemp: prioridade === 1 || data.termico ? Object.assign({}, FAIXA_TERMICA) : null
    };
    state.entregas.push(e);
    addLog(state, e.id + ' registrada: ' + PRIORIDADES[prioridade] + ' — ' + carga + '.', 'info');
    return e;
  }

  const api = {
    FLIGHT_MS_PER_KM, RESERVA, PRIORIDADES, STATUS, FAIXA_TERMICA,
    distance, findPoint, byId, sortQueue, estimateAutonomy, checkAutonomy, selectDrone, dispatch, processQueue,
    launch, tick, flightProgress, positionAt, routeLandingZones, emergencyLanding,
    checkTemperature, sensorReading, createOrder, addLog
  };

  root.SIDEC = root.SIDEC || {};
  root.SIDEC.ops = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

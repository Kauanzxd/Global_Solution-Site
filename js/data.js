/* SIDEC — dados FICTÍCIOS e ILUSTRATIVOS da cidade-modelo usada nas simulações.
   Coordenadas em km numa grade de 20 × 16 km. Nenhum local, hospital ou empresa real. */
(function (root) {
  'use strict';
  const SIDEC = (root.SIDEC = root.SIDEC || {});
  const VERSION = 5;

  const GRADE = { largura: 20, altura: 16 };

  function base() {
    return {
      version: VERSION,
      seq: 5,
      log: [],
      filiais: [
        { id: 'F-NOR', nome: 'Base Norte', x: 5, y: 3 },
        { id: 'F-CEN', nome: 'Base Centro', x: 11, y: 8 },
        { id: 'F-SUL', nome: 'Base Sul', x: 6, y: 13 }
      ],
      locais: [
        { id: 'H-01', nome: 'Hospital Regional Norte', tipo: 'hospital', x: 3, y: 5 },
        { id: 'H-02', nome: 'Hospital Municipal Aurora', tipo: 'hospital', x: 14, y: 4 },
        { id: 'H-03', nome: 'Hospital Vale Verde', tipo: 'hospital', x: 17, y: 11 },
        { id: 'H-04', nome: 'Hospital Horizonte', tipo: 'hospital', x: 8, y: 10 },
        { id: 'CT-01', nome: 'Central de Transplantes (modelo)', tipo: 'hospital', x: 10, y: 5 },
        { id: 'U-01', nome: 'UBS Jardim Esperança', tipo: 'ubs', x: 2, y: 11 },
        { id: 'U-02', nome: 'UBS Morro Azul', tipo: 'ubs', x: 15, y: 14 },
        { id: 'FA-01', nome: 'Farmácia Vila Nova', tipo: 'farmacia', x: 12, y: 9 },
        { id: 'C-01', nome: 'Sakura Sushi', tipo: 'comercio', x: 7, y: 12 },
        { id: 'C-02', nome: 'Bella Pizza', tipo: 'comercio', x: 12, y: 10 },
        { id: 'C-03', nome: 'Burger House', tipo: 'comercio', x: 4, y: 8 },
        { id: 'B-01', nome: 'Vila Serena', tipo: 'bairro', x: 18, y: 2 },
        { id: 'B-02', nome: 'Parque das Águas', tipo: 'bairro', x: 3, y: 14 },
        { id: 'B-03', nome: 'Centro', tipo: 'bairro', x: 10, y: 7 },
        { id: 'B-04', nome: 'Jardim Primavera', tipo: 'bairro', x: 13, y: 12 },
        { id: 'B-05', nome: 'Alto da Serra', tipo: 'bairro', x: 19, y: 15 }
      ],
      zonas: [
        { id: 'ZP-01', nome: 'Campo do Parque Norte', x: 6, y: 5 },
        { id: 'ZP-02', nome: 'Heliponto H. Aurora', x: 14, y: 5 },
        { id: 'ZP-03', nome: 'Praça Cívica', x: 10, y: 9 },
        { id: 'ZP-04', nome: 'Campo Esportivo Sul', x: 7, y: 14 },
        { id: 'ZP-05', nome: 'Pátio Logístico Leste', x: 17, y: 8 },
        { id: 'ZP-06', nome: 'Clareira Alto da Serra', x: 18, y: 14 }
      ],
      drones: [
        { id: 'D-01', nome: 'SDC-Alfa', filialId: 'F-NOR', x: 5, y: 3, bateria: 96, consumoKm: 3, cargaMaxKg: 6, status: 'disponivel', entregaId: null },
        { id: 'D-02', nome: 'SDC-Beta', filialId: 'F-CEN', x: 11, y: 8, bateria: 88, consumoKm: 3.2, cargaMaxKg: 8, status: 'disponivel', entregaId: null },
        { id: 'D-03', nome: 'SDC-Gama', filialId: 'F-CEN', x: 11, y: 8, bateria: 41, consumoKm: 3.2, cargaMaxKg: 8, status: 'disponivel', entregaId: null },
        { id: 'D-04', nome: 'SDC-Delta', filialId: 'F-SUL', x: 6, y: 13, bateria: 100, consumoKm: 3.6, cargaMaxKg: 10, status: 'disponivel', entregaId: null },
        { id: 'D-05', nome: 'SDC-Épsilon', filialId: 'F-SUL', x: 6, y: 13, bateria: 90, consumoKm: 3, cargaMaxKg: 6, status: 'disponivel', entregaId: null },
        { id: 'D-06', nome: 'SDC-Zeta', filialId: 'F-NOR', x: 5, y: 3, bateria: 23, consumoKm: 3, cargaMaxKg: 6, status: 'manutencao', entregaId: null }
      ],
      entregas: [
        { id: 'SDC-0001', prioridade: 3, carga: 'Losartana 50 mg — uso contínuo', pesoKg: 0.3, origemId: 'FA-01', destinoId: 'B-02', solicitante: 'Cidadão (fictício)', status: 'fila', droneId: null, ordem: 1, faixaTemp: null },
        { id: 'SDC-0002', prioridade: 2, carga: 'Água potável e kit de primeiros socorros', pesoKg: 4.5, origemId: 'F-SUL', destinoId: 'B-05', solicitante: 'Defesa Civil (simulação)', status: 'fila', droneId: null, ordem: 2, faixaTemp: null },
        { id: 'SDC-0003', prioridade: 4, carga: 'Combinado de sushi — restaurante fictício', pesoKg: 1.2, origemId: 'C-01', destinoId: 'B-04', solicitante: 'Parceiro comercial (fictício)', status: 'fila', droneId: null, ordem: 3, faixaTemp: null },
        { id: 'SDC-0004', prioridade: 4, carga: 'Refeição — restaurante parceiro (fictício)', pesoKg: 1.8, origemId: 'C-02', destinoId: 'B-03', solicitante: 'Parceiro comercial (fictício)', status: 'fila', droneId: null, ordem: 4, faixaTemp: null },
        { id: 'SDC-0005', prioridade: 3, carga: 'Amostras de exames laboratoriais', pesoKg: 1, origemId: 'U-02', destinoId: 'H-03', solicitante: 'UBS Morro Azul', status: 'fila', droneId: null, ordem: 5, faixaTemp: { min: 2, max: 8 } }
      ]
    };
  }

  /* Atribui uma entrega a um drone específico (montagem do cenário inicial). */
  function assign(state, entregaId, droneId) {
    const ops = SIDEC.ops;
    const e = ops.byId(state.entregas, entregaId);
    const d = ops.byId(state.drones, droneId);
    const a = ops.checkAutonomy(state, d, e);
    Object.assign(e, { status: 'atribuida', droneId: d.id, km: a.km, consumo: a.consumo, necessario: a.necessario });
    Object.assign(d, { status: 'atribuido', entregaId: e.id });
  }

  /* Estado inicial: uma entrega comercial em voo e outra atribuída aguardando decolagem. */
  function createSeed(now) {
    const state = base();
    assign(state, 'SDC-0003', 'D-05');
    SIDEC.ops.launch(state, 'SDC-0003', now - 6000);
    assign(state, 'SDC-0004', 'D-04');
    state.log = [{ msg: 'Dados iniciais carregados. Todos os valores são ilustrativos.', tipo: 'info' }];
    return state;
  }

  SIDEC.data = { VERSION, GRADE, base, createSeed, assign };
})(typeof window !== 'undefined' ? window : globalThis);

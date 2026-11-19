package br.com.fiap.sadec.service;

import br.com.fiap.sadec.model.Drone;
import br.com.fiap.sadec.model.Entrega;
import br.com.fiap.sadec.model.LeituraSensor;
import br.com.fiap.sadec.model.TransporteOrgao;
import br.com.fiap.sadec.model.ZonaPouso;

import java.util.ArrayList;
import java.util.List;

/**
 * Central de operação do SADEC: guarda a frota e a fila de pedidos
 * e aplica as regras de negócio (os métodos principais do sistema).
 */
public class CentralOperacao {

    // Limites usados para cargas que não são órgãos (remédios, kits, exames)
    private static final double TEMP_MIN_PADRAO = 2.0;
    private static final double TEMP_MAX_PADRAO = 30.0;
    private static final double VIBRACAO_MAX_PADRAO = 3.0;

    private String nome;
    private List<Drone> frota;
    private List<Entrega> fila;

    public CentralOperacao() {
        this.frota = new ArrayList<>();
        this.fila = new ArrayList<>();
    }

    public CentralOperacao(String nome) {
        this.nome = nome;
        this.frota = new ArrayList<>();
        this.fila = new ArrayList<>();
    }

    /** Coloca um drone na frota controlada pela central. */
    public void adicionarDrone(Drone drone) {
        frota.add(drone);
    }

    // =====================================================================
    // FUNCIONALIDADE 1: registrar pedido na fila de prioridade
    // =====================================================================
    /**
     * Insere o pedido na posição certa da fila: antes do primeiro pedido de prioridade
     * menor (número maior). Pedidos de mesma prioridade mantêm a ordem de chegada.
     * Retorna a posição (1, 2, 3...) em que o pedido entrou.
     */
    public int registrarPedido(Entrega entrega) {
        int posicao = fila.size();
        for (int i = 0; i < fila.size(); i++) {
            if (entrega.getPrioridade() < fila.get(i).getPrioridade()) {
                posicao = i;
                break;
            }
        }
        fila.add(posicao, entrega);
        return posicao + 1;
    }

    // =====================================================================
    // FUNCIONALIDADE 2: escolher o drone e verificar a autonomia
    // =====================================================================
    /**
     * Escolhe o drone para a entrega e o coloca em voo.
     * Regras:
     *  - a bateria precisa cobrir ida e volta x fator de segurança (1,3 para órgãos);
     *  - prefere drone livre; entre os livres, o de maior bateria;
     *  - níveis 1 e 2 podem usar um drone reservado para entrega comercial que ainda não decolou:
     *    essa entrega comercial é reagendada;
     *  - drone em voo comercial termina a entrega (não entra na escolha).
     * Retorna o drone escolhido, ou null se nenhum atende (é preciso outro transporte).
     */
    public Drone atribuirEntrega(Entrega entrega) {
        double distancia = entrega.getRota().calcularDistanciaIdaVolta();
        double fator = entrega.getFatorSeguranca();     // polimorfismo: 1,3 se for TransporteOrgao
        boolean urgente = entrega.getPrioridade() <= 2;

        Drone escolhido = null;
        for (Drone d : frota) {
            boolean disponivel = d.getStatus().equals("livre")
                    || (urgente && d.getStatus().equals("aguardando_comercial"));
            if (!disponivel || !d.verificarAutonomia(distancia, fator)) {
                continue;
            }
            if (escolhido == null || melhorOpcao(d, escolhido)) {
                escolhido = d;
            }
        }

        if (escolhido == null) {
            return null;
        }

        if (escolhido.getStatus().equals("aguardando_comercial")) {
            reagendarEntregaComercial(escolhido);
        }
        escolhido.setStatus("em_voo");
        entrega.setDrone(escolhido);
        entrega.setStatus("em_voo");
        return escolhido;
    }

    /** True se o drone "a" é melhor opção que "b": livre antes de reservado; depois, mais bateria. */
    private boolean melhorOpcao(Drone a, Drone b) {
        boolean aLivre = a.getStatus().equals("livre");
        boolean bLivre = b.getStatus().equals("livre");
        if (aLivre != bLivre) {
            return aLivre;
        }
        return a.getBateriaPct() > b.getBateriaPct();
    }

    /** Libera o drone da entrega comercial que ainda não decolou e reagenda essa entrega. */
    private void reagendarEntregaComercial(Drone drone) {
        for (Entrega e : fila) {
            if (e.getDrone() == drone && e.getPrioridade() == 4 && e.getStatus().equals("aguardando")) {
                e.setStatus("reagendada");
                e.setDrone(null);
                System.out.println("   ↳ Entrega comercial " + e.getCodigo()
                        + " reagendada: o drone " + drone.getCodigo() + " foi para um chamado urgente.");
            }
        }
    }

    // =====================================================================
    // FUNCIONALIDADE 3: monitorar a carga durante o voo
    // =====================================================================
    /**
     * Compara a leitura dos sensores com os limites da carga.
     * Órgãos usam a faixa do próprio transporte; as outras cargas usam limites padrão.
     * Retorna true se está tudo dentro do limite, false se gerou alerta.
     */
    public boolean verificarCondicaoCarga(Entrega entrega, LeituraSensor leitura) {
        double tempMin = TEMP_MIN_PADRAO;
        double tempMax = TEMP_MAX_PADRAO;
        double vibracaoMax = VIBRACAO_MAX_PADRAO;

        if (entrega instanceof TransporteOrgao) {
            TransporteOrgao t = (TransporteOrgao) entrega;   // cast para acessar os limites do órgão
            tempMin = t.getTemperaturaMinC();
            tempMax = t.getTemperaturaMaxC();
            vibracaoMax = t.getVibracaoMaxG();
        }

        boolean ok = true;
        if (leitura.getTemperaturaC() < tempMin || leitura.getTemperaturaC() > tempMax) {
            System.out.printf("   ALERTA %s: temperatura %.1f °C fora da faixa (%.1f a %.1f °C). "
                    + "Equipe médica avisada.%n", entrega.getCodigo(), leitura.getTemperaturaC(), tempMin, tempMax);
            ok = false;
        }
        if (leitura.getVibracaoG() > vibracaoMax) {
            System.out.printf("   ALERTA %s: vibração %.1f g acima do limite (%.1f g).%n",
                    entrega.getCodigo(), leitura.getVibracaoG(), vibracaoMax);
            ok = false;
        }
        return ok;
    }

    // =====================================================================
    // FUNCIONALIDADE 4: pouso de emergência em caso de pane
    // =====================================================================
    /**
     * Procura, entre as zonas de pouso da rota, a zona SEGURA mais próxima da posição atual
     * do drone. O drone pousa lá e a carga fica aguardando resgate.
     * Se não houver zona segura, o paraquedas é acionado (retorna null).
     */
    public ZonaPouso acionarPousoEmergencia(Entrega entrega, LeituraSensor leitura) {
        ZonaPouso maisProxima = null;
        double menorDistancia = Double.MAX_VALUE;

        for (ZonaPouso z : entrega.getRota().getZonasPouso()) {
            if (!z.isSegura()) {
                continue;   // nunca pousa perto de pessoas ou vias movimentadas
            }
            double distancia = Math.abs(z.getKmNaRota() - leitura.getKmPercorrido());
            if (distancia < menorDistancia) {
                menorDistancia = distancia;
                maisProxima = z;
            }
        }

        Drone drone = entrega.getDrone();
        drone.setStatus("pouso_emergencia");
        entrega.setStatus("aguardando_resgate");
        if (maisProxima != null) {
            drone.consumirBateria(menorDistancia);
        }
        return maisProxima;
    }

    // =====================================================================
    // FUNCIONALIDADE 5: cronograma da fila
    // =====================================================================
    /** Monta o cronograma: a fila na ordem em que será atendida. */
    public String gerarCronograma() {
        StringBuilder sb = new StringBuilder();
        int posicao = 1;
        for (Entrega e : fila) {
            sb.append(String.format("   %d. %s%n", posicao, e));
            posicao++;
        }
        return sb.toString();
    }

    public String getNome() {
        return nome;
    }

    public void setNome(String nome) {
        this.nome = nome;
    }

    public List<Drone> getFrota() {
        return frota;
    }

    public void setFrota(List<Drone> frota) {
        this.frota = frota;
    }

    public List<Entrega> getFila() {
        return fila;
    }

    public void setFila(List<Entrega> fila) {
        this.fila = fila;
    }
}

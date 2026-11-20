package br.com.fiap.sadec.main;

import br.com.fiap.sadec.model.Drone;
import br.com.fiap.sadec.model.Entrega;
import br.com.fiap.sadec.model.Filial;
import br.com.fiap.sadec.model.Hospital;
import br.com.fiap.sadec.model.LeituraSensor;
import br.com.fiap.sadec.model.Local;
import br.com.fiap.sadec.model.Rota;
import br.com.fiap.sadec.model.TransporteOrgao;
import br.com.fiap.sadec.model.ZonaPouso;
import br.com.fiap.sadec.service.CentralOperacao;

/**
 * SADEC - Sistema Autônomo de Drones de Entrega e Cuidado.
 * Classe executável: cria objetos de todas as classes e testa as funcionalidades.
 */
public class Main {

    public static void main(String[] args) {

        titulo("SADEC - Sistema Autônomo de Drones de Entrega e Cuidado");

        // ------------------------------------------------------------------
        // 1) Cenário inicial: filiais, drones, locais e rotas
        // ------------------------------------------------------------------
        secao("CENÁRIO INICIAL");

        Filial filialCentro = new Filial("Filial Centro", "Centro");
        Filial filialSul = new Filial("Filial Zona Sul", "Santo Amaro");

        Drone dr01 = new Drone("DR-01", "Agrícola adaptado X8", 95, 50, "livre");
        Drone dr02 = new Drone("DR-02", "Agrícola adaptado X8", 85, 50, "aguardando_comercial");
        Drone dr03 = new Drone("DR-03", "Agrícola adaptado X6", 60, 40, "em_voo_comercial");
        Drone dr04 = new Drone("DR-04", "Agrícola adaptado X6", 30, 40, "livre");
        filialCentro.adicionarDrone(dr01);
        filialCentro.adicionarDrone(dr04);
        filialSul.adicionarDrone(dr02);
        filialSul.adicionarDrone(dr03);

        CentralOperacao central = new CentralOperacao("Central SADEC São Paulo");
        central.adicionarDrone(dr01);
        central.adicionarDrone(dr02);
        central.adicionarDrone(dr03);
        central.adicionarDrone(dr04);

        Hospital hc = new Hospital("Hospital das Clínicas", "Cerqueira César", true, "(11) 2661-0000");
        Hospital incor = new Hospital("InCor", "Cerqueira César", true, "(11) 2661-5000");
        Local capao = new Local("Capão Redondo", "Capão Redondo");
        Local mooca = new Local("Mooca", "Mooca");
        Local parelheiros = new Local("Parelheiros", "Parelheiros");

        ZonaPouso zParque = new ZonaPouso("Parque Santo Dias", "Capão Redondo", 7.5, true);
        ZonaPouso zCampo = new ZonaPouso("Campo de futebol M'Boi Mirim", "Jardim Ângela", 4.5, true);
        ZonaPouso zFeira = new ZonaPouso("Praça da feira", "Capão Redondo", 6, false);   // com pessoas

        Rota rotaHc = new Rota("R-01", filialCentro, hc, 6);
        Rota rotaMooca = new Rota("R-02", filialCentro, mooca, 6);
        Rota rotaCapao = new Rota("R-03", filialSul, capao, 8);
        rotaCapao.adicionarZonaPouso(zCampo);
        rotaCapao.adicionarZonaPouso(zFeira);
        rotaCapao.adicionarZonaPouso(zParque);
        Rota rotaParelheiros = new Rota("R-04", filialSul, parelheiros, 35);

        System.out.println(filialCentro);
        System.out.println(filialSul);
        System.out.println("Frota:");
        for (Drone d : central.getFrota()) {
            System.out.println("   " + d);
        }
        System.out.println("Locais: " + hc.descrever() + " | " + incor.descrever() + " | " + capao.descrever());
        System.out.println("Rotas: " + rotaHc + " | " + rotaCapao + " | " + rotaParelheiros);

        // ------------------------------------------------------------------
        // FUNCIONALIDADE 1: registrarPedido (fila de prioridade)
        // ------------------------------------------------------------------
        secao("FUNCIONALIDADE 1 - registrarPedido(): fila de prioridade");

        Entrega comercial = new Entrega("SD1002", "encomenda", 4, rotaMooca, "tarde");
        comercial.setDrone(dr02);   // DR-02 está reservado para esta entrega comercial (ainda não decolou)
        Entrega remedio = new Entrega("SD1004", "remedio", 3, rotaCapao, "noite");
        TransporteOrgao orgao = new TransporteOrgao("SD2001", rotaHc, "coração", incor, 4.0, 8.0, 2.0);
        Entrega emergenciaCapao = new Entrega("SD2002", "kit_emergencia", 2, rotaCapao, "agora");
        Entrega emergenciaParelheiros = new Entrega("SD2003", "kit_emergencia", 2, rotaParelheiros, "agora");

        System.out.println("Chegou " + comercial.getCodigo() + " (" + comercial.getDescricaoPrioridade()
                + ") -> posição " + central.registrarPedido(comercial));
        System.out.println("Chegou " + remedio.getCodigo() + " (" + remedio.getDescricaoPrioridade()
                + ") -> posição " + central.registrarPedido(remedio));
        System.out.println("Chegou " + orgao.getCodigo() + " (" + orgao.getDescricaoPrioridade()
                + ") -> posição " + central.registrarPedido(orgao));
        System.out.println("Chegou " + emergenciaCapao.getCodigo() + " (" + emergenciaCapao.getDescricaoPrioridade()
                + ") -> posição " + central.registrarPedido(emergenciaCapao));
        System.out.println("Chegou " + emergenciaParelheiros.getCodigo() + " ("
                + emergenciaParelheiros.getDescricaoPrioridade() + ") -> posição "
                + central.registrarPedido(emergenciaParelheiros));
        System.out.println("\nCronograma (ordem de atendimento):");
        System.out.print(central.gerarCronograma());

        // ------------------------------------------------------------------
        // FUNCIONALIDADE 2: atribuirEntrega (escolha do drone + autonomia)
        // ------------------------------------------------------------------
        secao("FUNCIONALIDADE 2 - atribuirEntrega(): escolha do drone e autonomia");

        testarAtribuicao(central, orgao);
        testarAtribuicao(central, emergenciaCapao);
        testarAtribuicao(central, emergenciaParelheiros);

        System.out.println("\nCronograma depois das atribuições:");
        System.out.print(central.gerarCronograma());

        // ------------------------------------------------------------------
        // FUNCIONALIDADE 3: verificarCondicaoCarga (sensores em voo)
        // ------------------------------------------------------------------
        secao("FUNCIONALIDADE 3 - verificarCondicaoCarga(): monitoramento da carga");

        LeituraSensor l1 = new LeituraSensor(dr01, "14:02", 5.2, 0.8, 2.0);
        LeituraSensor l2 = new LeituraSensor(dr01, "14:05", 9.1, 1.1, 4.5);
        LeituraSensor l3 = new LeituraSensor(dr02, "14:07", 24.0, 3.6, 5.5);

        testarCarga(central, orgao, l1);
        testarCarga(central, orgao, l2);
        testarCarga(central, emergenciaCapao, l3);

        // ------------------------------------------------------------------
        // FUNCIONALIDADE 4: acionarPousoEmergencia (pane em voo)
        // ------------------------------------------------------------------
        secao("FUNCIONALIDADE 4 - acionarPousoEmergencia(): pane em voo");

        System.out.println("Pane no " + dr02.getCodigo() + " na " + rotaCapao.getCodigo()
                + ", posição km " + l3.getKmPercorrido());
        System.out.println("Zonas da rota:");
        for (ZonaPouso z : rotaCapao.getZonasPouso()) {
            System.out.println("   " + z.descrever());
        }
        ZonaPouso pouso = central.acionarPousoEmergencia(emergenciaCapao, l3);
        if (pouso != null) {
            System.out.println("-> Pouso em: " + pouso.descrever()
                    + ". A praça (mais perto, km 6) foi descartada por não ser segura.");
        } else {
            System.out.println("-> Nenhuma zona segura: paraquedas acionado.");
        }
        System.out.println("Estado do drone: " + dr02);
        System.out.println("Estado da entrega: " + emergenciaCapao);

        // ------------------------------------------------------------------
        // FUNCIONALIDADE 4b: recuperação do drone (resgate, manutenção e liberação)
        // ------------------------------------------------------------------
        secao("FUNCIONALIDADE 4b - recuperação do drone: resgate, manutenção e liberação");

        System.out.println("Liberar o DR-02 direto do pouso? " + resultado(central.liberarDrone(dr02)));
        boolean resgatou = central.concluirResgate(dr02);
        if (resgatou) {
            emergenciaCapao.setStatus("resgatada");   // a equipe levou a carga junto com o drone
        }
        System.out.println("Resgate concluído (vai para a base)? " + resultado(resgatou)
                + " -> " + dr02.getStatus() + " | entrega " + emergenciaCapao.getCodigo()
                + ": " + emergenciaCapao.getStatus());
        System.out.println("Manutenção concluída? " + resultado(central.concluirManutencao(dr02))
                + " -> " + dr02.getStatus());
        System.out.println("\nAntes da liberação, o DR-02 não pode ser despachado:");
        testarAtribuicao(central, remedio);
        System.out.println("\nLiberação formal pela Central? " + resultado(central.liberarDrone(dr02))
                + " -> " + dr02.getStatus());
        testarAtribuicao(central, remedio);

        // ------------------------------------------------------------------
        // Estado final de todos os objetos
        // ------------------------------------------------------------------
        secao("ESTADO FINAL");
        System.out.println("Frota:");
        for (Drone d : central.getFrota()) {
            System.out.println("   " + d);
        }
        System.out.println("Cronograma final:");
        System.out.print(central.gerarCronograma());
    }

    private static void testarAtribuicao(CentralOperacao central, Entrega entrega) {
        double distancia = entrega.getRota().calcularDistanciaIdaVolta();
        double necessario = distancia * entrega.getFatorSeguranca();
        System.out.printf("%n%s (%s) para %s: ida e volta %.1f km x fator %.1f = %.1f km necessários%n",
                entrega.getCodigo(), entrega.getDescricaoPrioridade(), entrega.getRota().getDestino().getNome(),
                distancia, entrega.getFatorSeguranca(), necessario);

        Drone drone = central.atribuirEntrega(entrega);
        if (drone != null) {
            System.out.println("   OK -> drone " + drone);
        } else {
            System.out.println("   NENHUM drone disponível tem bateria para essa rota. "
                    + "Acionar outro transporte (Defesa Civil 199 / helicóptero).");
        }
    }

    private static void testarCarga(CentralOperacao central, Entrega entrega, LeituraSensor leitura) {
        System.out.println("\nLeitura " + leitura + " (" + entrega.getCodigo() + ", " + entrega.getTipoCarga() + ")");
        boolean ok = central.verificarCondicaoCarga(entrega, leitura);
        System.out.println(ok ? "   Carga dentro dos limites." : "   Carga com alerta.");
    }

    private static String resultado(boolean ok) {
        return ok ? "sim" : "não (recusado)";
    }

    private static void titulo(String texto) {
        System.out.println("==========================================================================");
        System.out.println("  " + texto);
        System.out.println("==========================================================================");
    }

    private static void secao(String texto) {
        System.out.println();
        System.out.println("---------- " + texto + " ----------");
    }
}

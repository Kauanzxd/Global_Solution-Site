package br.com.fiap.sadec.integracao;

import java.util.List;
import java.util.Map;

/**
 * Testes da integração Java (sem JUnit, para não adicionar dependências).
 * Rodar: java -cp <classes> br.com.fiap.sadec.integracao.IntegracaoTeste
 */
public final class IntegracaoTeste {

    private static int falhas = 0;
    private static int total = 0;

    private IntegracaoTeste() {
    }

    private static void verificar(String nome, boolean condicao) {
        total++;
        if (condicao) {
            System.out.println("ok    " + nome);
        } else {
            falhas++;
            System.out.println("FALHA " + nome);
        }
    }

    private static Map<String, Object> rodar(String json) {
        return IntegracaoCLI.processar(json.replace('\'', '"'));
    }

    private static String drone(String codigo, int bateria, double autonomia, String status) {
        return "{'codigo':'" + codigo + "','bateria_pct':" + bateria + ",'autonomia_km':" + autonomia + ",'status':'" + status + "'}";
    }

    private static String atribuir(String pedido, String drones, String comerciais) {
        return "{'operacao':'atribuir','pedido':" + pedido + ",'drones':[" + drones + "],'comerciais_aguardando':[" + comerciais + "]}";
    }

    public static void main(String[] args) {
        // 1. Fila P1–P4 e empate por ordem de chegada (registrarPedido)
        Map<String, Object> fila = rodar("{'operacao':'ordenar_fila','pedidos':["
                + "{'codigo':'SD1001','prioridade':4,'tipo_carga':'encomenda'},"
                + "{'codigo':'SD1002','prioridade':3,'tipo_carga':'remedio'},"
                + "{'codigo':'SD1003','prioridade':2,'tipo_carga':'kit_emergencia'},"
                + "{'codigo':'SD1004','prioridade':3,'tipo_carga':'exame'},"
                + "{'codigo':'SD1005','prioridade':1,'tipo_carga':'orgao'}]}");
        verificar("fila ordena P1, P2, P3, P3, P4 com empate pela chegada",
                fila.get("ordem").toString().equals("[SD1005, SD1003, SD1002, SD1004, SD1001]"));

        // 2. Drone livre com alcance é escolhido; pedido NÃO fica em voo antes da decolagem
        Map<String, Object> livre = rodar(atribuir("{'codigo':'SD1010','prioridade':3,'tipo_carga':'remedio','distancia_km':5}",
                drone("DR-01", 80, 40, "livre"), ""));
        verificar("drone livre é atribuído", "DR-01".equals(livre.get("drone_codigo")));
        verificar("pedido fica atribuída, não em_voo", "atribuida".equals(livre.get("status_pedido")));
        verificar("drone fica atribuído aguardando decolagem", "atribuido".equals(livre.get("status_drone")));

        // 3. P1 usa drone de entrega comercial que ainda não decolou (comercial é reagendada)
        Map<String, Object> preempcao = rodar(atribuir("{'codigo':'SD1011','prioridade':1,'tipo_carga':'orgao','distancia_km':5}",
                drone("DR-02", 90, 40, "aguardando_comercial"), "{'codigo':'SD1009','drone_codigo':'DR-02'}"));
        verificar("P1 assume drone comercial ainda não decolado", "DR-02".equals(preempcao.get("drone_codigo")));
        verificar("comercial reservada é reagendada", ((List<?>) preempcao.get("reagendadas")).contains("SD1009"));

        // 4. P3 não pode tomar o drone comercial reservado
        Map<String, Object> p3 = rodar(atribuir("{'codigo':'SD1012','prioridade':3,'tipo_carga':'remedio','distancia_km':5}",
                drone("DR-02", 90, 40, "aguardando_comercial"), "{'codigo':'SD1009','drone_codigo':'DR-02'}"));
        verificar("P3 não preempta comercial", Boolean.FALSE.equals(p3.get("atribuido")));

        // 5. Drone comercial já em voo nunca é realocado
        Map<String, Object> emVoo = rodar(atribuir("{'codigo':'SD1013','prioridade':1,'tipo_carga':'orgao','distancia_km':5}",
                drone("DR-03", 95, 40, "em_voo_comercial"), ""));
        verificar("comercial em voo não é realocado", Boolean.FALSE.equals(emVoo.get("atribuido"))
                && "outro_meio".equals(emVoo.get("status_pedido")));

        // 6. Bateria insuficiente: órgão exige ida e volta x 1,3
        // 10 km ida e volta = 20 km x 1,3 = 26 km; drone com 60% de 40 km = 24 km -> recusa
        Map<String, Object> fraca = rodar(atribuir("{'codigo':'SD1014','prioridade':1,'tipo_carga':'orgao','distancia_km':10}",
                drone("DR-04", 60, 40, "livre"), ""));
        verificar("bateria insuficiente indica outro meio", Boolean.FALSE.equals(fraca.get("atribuido"))
                && fraca.get("motivo") != null);
        // limite exato: 65% de 40 km = 26 km -> aceita
        Map<String, Object> exato = rodar(atribuir("{'codigo':'SD1015','prioridade':1,'tipo_carga':'orgao','distancia_km':10}",
                drone("DR-04", 65, 40, "livre"), ""));
        verificar("limite exato de 1,3 é aceito", "DR-04".equals(exato.get("drone_codigo")));

        // 7. Drones em manutenção e aguardando liberação nunca são despachados
        Map<String, Object> indisponiveis = rodar(atribuir("{'codigo':'SD1016','prioridade':2,'tipo_carga':'kit_emergencia','distancia_km':2}",
                drone("DR-05", 100, 40, "manutencao") + "," + drone("DR-06", 100, 40, "aguardando_liberacao")
                        + "," + drone("DR-07", 100, 40, "pouso_emergencia"), ""));
        verificar("manutenção, aguardando liberação e pouso não são despachados",
                Boolean.FALSE.equals(indisponiveis.get("atribuido")));

        // 8. Pane: pousa na zona segura mais próxima
        Map<String, Object> pane = rodar("{'operacao':'pouso_emergencia','pedido':{'codigo':'SD1017','prioridade':3,"
                + "'tipo_carga':'remedio','distancia_km':10},'drone':" + drone("DR-01", 80, 40, "em_voo")
                + ",'km_percorrido':4,'zonas':[{'nome':'Praça A','km_na_rota':2,'segura':true},"
                + "{'nome':'Avenida','km_na_rota':4,'segura':false},{'nome':'Parque B','km_na_rota':5,'segura':true}]}");
        verificar("pane pousa na zona segura mais próxima", "Parque B".equals(pane.get("zona"))
                && "pouso_emergencia".equals(pane.get("status_drone")));

        // 9. Resgate -> manutenção -> aguardando liberação (sem volta automática) -> liberação manual
        Map<String, Object> resgate = rodar("{'operacao':'recuperacao','acao':'concluir_resgate','drone':" + drone("DR-01", 70, 40, "pouso_emergencia") + "}");
        verificar("resgate leva à manutenção", "manutencao".equals(resgate.get("status_novo")));
        Map<String, Object> inspecao = rodar("{'operacao':'recuperacao','acao':'concluir_manutencao','drone':" + drone("DR-01", 70, 40, "manutencao") + "}");
        verificar("fim da manutenção NÃO libera: aguardando_liberacao", "aguardando_liberacao".equals(inspecao.get("status_novo")));
        Map<String, Object> cedo = rodar("{'operacao':'recuperacao','acao':'liberar','drone':" + drone("DR-01", 70, 40, "manutencao") + "}");
        verificar("liberação prematura é recusada", Boolean.FALSE.equals(cedo.get("aceito"))
                && "manutencao".equals(cedo.get("status_novo")));
        Map<String, Object> liberado = rodar("{'operacao':'recuperacao','acao':'liberar','drone':" + drone("DR-01", 70, 40, "aguardando_liberacao") + "}");
        verificar("liberação manual devolve à frota", Boolean.TRUE.equals(liberado.get("aceito"))
                && "livre".equals(liberado.get("status_novo")));

        // 10. Monitoramento da carga
        Map<String, Object> quente = rodar("{'operacao':'verificar_carga','pedido':{'codigo':'SD1018','prioridade':1,'tipo_carga':'orgao'},'leitura':{'temperatura_c':11,'vibracao_g':1}}");
        verificar("órgão fora de 2–8 °C gera alerta", Boolean.FALSE.equals(quente.get("dentro_do_limite")));

        // 11. Entrada inválida
        verificar("operação inválida é recusada", Boolean.FALSE.equals(rodar("{'operacao':'xyz'}").get("ok")));
        boolean lancou = false;
        try {
            rodar("{'operacao':'atribuir','pedido':{'codigo':'SD1','prioridade':9,'distancia_km':1},'drones':[]}");
        } catch (IllegalArgumentException e) {
            lancou = true;
        }
        verificar("prioridade fora de 1–4 é recusada", lancou);

        System.out.println((total - falhas) + " de " + total + " testes passaram");
        System.exit(falhas == 0 ? 0 : 1);
    }
}

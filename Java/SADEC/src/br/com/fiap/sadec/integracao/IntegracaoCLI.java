package br.com.fiap.sadec.integracao;

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

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Interface de integração do SADEC Java, chamada pelo Node-RED por linha de comando.
 * Entrada: um objeto JSON no stdin. Saída: exatamente um objeto JSON no stdout.
 * As decisões são tomadas pela CentralOperacao original; aqui só se montam os objetos do domínio
 * a partir do JSON (vindo do SQLite) e se devolve o resultado.
 *
 * O Main original continua sendo a demonstração em console e não foi alterado.
 *
 * Operações: ordenar_fila, atribuir, verificar_carga, pouso_emergencia, recuperacao.
 */
public final class IntegracaoCLI {

    private IntegracaoCLI() {
    }

    public static void main(String[] args) throws Exception {
        String entrada = args.length > 0 ? args[0] : lerTudo(System.in);
        PrintStream saidaOriginal = new PrintStream(System.out, true, "UTF-8");
        // Mensagens que a CentralOperacao imprime (ex.: reagendamento) vão para o stderr,
        // para o stdout ter só o JSON de resposta.
        System.setOut(new PrintStream(System.err, true, "UTF-8"));
        String resposta;
        int codigo;
        try {
            Map<String, Object> r = processar(entrada);
            resposta = Json.escrever(r);
            codigo = Boolean.TRUE.equals(r.get("ok")) ? 0 : 3;
        } catch (IllegalArgumentException e) {
            System.err.println("Entrada inválida: " + e.getMessage());
            resposta = Json.escrever(erro("Entrada inválida: " + e.getMessage()));
            codigo = 2;
        } catch (RuntimeException e) {
            e.printStackTrace(System.err);
            resposta = Json.escrever(erro("Erro interno na Central Java."));
            codigo = 1;
        }
        saidaOriginal.println(resposta);
        System.exit(codigo);
    }

    /** Processa a entrada JSON e devolve a resposta. Usado pelo main e pelos testes. */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> processar(String entradaJson) {
        Object lido = Json.ler(entradaJson);
        if (!(lido instanceof Map)) {
            return erro("A entrada precisa ser um objeto JSON.");
        }
        Map<String, Object> dados = (Map<String, Object>) lido;
        String operacao = texto(dados, "operacao", "");
        switch (operacao) {
            case "ordenar_fila":
                return ordenarFila(dados);
            case "atribuir":
                return atribuir(dados);
            case "verificar_carga":
                return verificarCarga(dados);
            case "pouso_emergencia":
                return pousoEmergencia(dados);
            case "recuperacao":
                return recuperacao(dados);
            default:
                return erro("operacao inválida. Use: ordenar_fila, atribuir, verificar_carga, pouso_emergencia, recuperacao.");
        }
    }

    // ---------- operações ----------

    /** registrarPedido(): devolve os códigos na ordem de atendimento (prioridade e, no empate, chegada). */
    private static Map<String, Object> ordenarFila(Map<String, Object> dados) {
        CentralOperacao central = new CentralOperacao("Central SADEC");
        Rota rota = rotaPadrao(1);
        for (Map<String, Object> p : listaDeObjetos(dados, "pedidos")) {
            central.registrarPedido(montarEntrega(p, rota));
        }
        List<Object> ordem = new ArrayList<>();
        for (Entrega e : central.getFila()) {
            ordem.add(e.getCodigo());
        }
        Map<String, Object> r = ok("ordenar_fila");
        r.put("ordem", ordem);
        return r;
    }

    /** atribuirEntrega(): escolhe o drone pelas regras da Central Java. */
    private static Map<String, Object> atribuir(Map<String, Object> dados) {
        Map<String, Object> pedido = objeto(dados, "pedido");
        CentralOperacao central = new CentralOperacao("Central SADEC");
        Map<String, Drone> porCodigo = new LinkedHashMap<>();
        for (Map<String, Object> d : listaDeObjetos(dados, "drones")) {
            Drone drone = montarDrone(d);
            central.adicionarDrone(drone);
            porCodigo.put(drone.getCodigo(), drone);
        }
        // Entregas comerciais com drone reservado e ainda sem decolar (podem ceder o drone para P1/P2)
        Rota rotaComercial = rotaPadrao(1);
        for (Map<String, Object> c : listaDeObjetos(dados, "comerciais_aguardando")) {
            Entrega comercial = new Entrega(texto(c, "codigo", "?"), "encomenda", 4, rotaComercial, "agora");
            comercial.setDrone(porCodigo.get(texto(c, "drone_codigo", "")));
            central.registrarPedido(comercial);
        }

        Entrega entrega = montarEntrega(pedido, rotaPadrao(numero(pedido, "distancia_km", -1)));
        int posicao = central.registrarPedido(entrega);
        double idaVolta = entrega.getRota().calcularDistanciaIdaVolta();
        Drone escolhido = central.atribuirEntrega(entrega);

        Map<String, Object> r = ok("atribuir");
        r.put("pedido_codigo", entrega.getCodigo());
        r.put("posicao_fila", (double) posicao);
        r.put("distancia_ida_volta_km", idaVolta);
        r.put("fator_seguranca", entrega.getFatorSeguranca());
        r.put("km_necessarios", idaVolta * entrega.getFatorSeguranca());
        List<Object> reagendadas = new ArrayList<>();
        for (Entrega e : central.getFila()) {
            if ("reagendada".equals(e.getStatus())) {
                reagendadas.add(e.getCodigo());
            }
        }
        r.put("reagendadas", reagendadas);
        if (escolhido == null) {
            r.put("atribuido", false);
            r.put("drone_codigo", null);
            r.put("status_pedido", "outro_meio");
            r.put("motivo", "Nenhum drone disponível tem alcance para a rota. Acionar outro transporte.");
        } else {
            // A Central marca "em_voo" ao escolher; na API o pedido só entra em voo na decolagem.
            r.put("atribuido", true);
            r.put("drone_codigo", escolhido.getCodigo());
            r.put("status_pedido", "atribuida");
            r.put("status_drone", entrega.getPrioridade() == 4 ? "aguardando_comercial" : "atribuido");
            r.put("alcance_drone_km", escolhido.calcularAlcanceAtual());
        }
        return r;
    }

    /** verificarCondicaoCarga(): temperatura e vibração dentro dos limites da carga. */
    private static Map<String, Object> verificarCarga(Map<String, Object> dados) {
        Map<String, Object> pedido = objeto(dados, "pedido");
        Map<String, Object> leitura = objeto(dados, "leitura");
        CentralOperacao central = new CentralOperacao("Central SADEC");
        Entrega entrega = montarEntrega(pedido, rotaPadrao(1));
        LeituraSensor l = new LeituraSensor(null, texto(leitura, "horario", ""),
                numero(leitura, "temperatura_c", Double.NaN), numero(leitura, "vibracao_g", 0), 0);
        boolean ok = central.verificarCondicaoCarga(entrega, l);
        Map<String, Object> r = ok("verificar_carga");
        r.put("dentro_do_limite", ok);
        return r;
    }

    /** acionarPousoEmergencia(): zona segura mais próxima na rota, ou paraquedas. */
    private static Map<String, Object> pousoEmergencia(Map<String, Object> dados) {
        Map<String, Object> pedido = objeto(dados, "pedido");
        Rota rota = rotaPadrao(numero(pedido, "distancia_km", 1));
        for (Map<String, Object> z : listaDeObjetos(dados, "zonas")) {
            rota.adicionarZonaPouso(new ZonaPouso(texto(z, "nome", "?"), texto(z, "bairro", ""),
                    numero(z, "km_na_rota", 0), Boolean.TRUE.equals(z.get("segura"))));
        }
        Entrega entrega = montarEntrega(pedido, rota);
        Drone drone = montarDrone(objeto(dados, "drone"));
        entrega.setDrone(drone);
        LeituraSensor l = new LeituraSensor(drone, "", 0, 0, numero(dados, "km_percorrido", 0));
        ZonaPouso zona = new CentralOperacao("Central SADEC").acionarPousoEmergencia(entrega, l);
        Map<String, Object> r = ok("pouso_emergencia");
        r.put("zona", zona == null ? null : zona.getNome());
        r.put("paraquedas", zona == null);
        r.put("status_drone", drone.getStatus());
        r.put("status_pedido", entrega.getStatus());
        r.put("bateria_pct", (double) drone.getBateriaPct());
        return r;
    }

    /** Ciclo de recuperação: concluir_resgate, concluir_manutencao ou liberar (sempre explícito). */
    private static Map<String, Object> recuperacao(Map<String, Object> dados) {
        Drone drone = montarDrone(objeto(dados, "drone"));
        String anterior = drone.getStatus();
        CentralOperacao central = new CentralOperacao("Central SADEC");
        String acao = texto(dados, "acao", "");
        boolean aceito;
        switch (acao) {
            case "concluir_resgate":
                aceito = central.concluirResgate(drone);
                break;
            case "concluir_manutencao":
                aceito = central.concluirManutencao(drone);
                break;
            case "liberar":
                aceito = central.liberarDrone(drone);
                break;
            default:
                return erro("acao inválida. Use: concluir_resgate, concluir_manutencao, liberar.");
        }
        Map<String, Object> r = ok("recuperacao");
        r.put("acao", acao);
        r.put("aceito", aceito);
        r.put("status_anterior", anterior);
        r.put("status_novo", drone.getStatus());
        if (!aceito) {
            r.put("motivo", "Ação " + acao + " não permitida com o drone em " + anterior + ".");
        }
        return r;
    }

    // ---------- montagem dos objetos do domínio ----------

    private static Rota rotaPadrao(double distanciaKm) {
        if (distanciaKm < 0 || Double.isNaN(distanciaKm)) {
            throw new IllegalArgumentException("pedido.distancia_km é obrigatório e não pode ser negativo.");
        }
        return new Rota("R-API", new Filial("Filial SADEC", ""), new Local("Destino", ""), distanciaKm);
    }

    private static Entrega montarEntrega(Map<String, Object> p, Rota rota) {
        String codigo = texto(p, "codigo", null);
        if (codigo == null || codigo.isEmpty()) {
            throw new IllegalArgumentException("codigo do pedido é obrigatório.");
        }
        int prioridade = (int) numero(p, "prioridade", -1);
        if (prioridade < 1 || prioridade > 4) {
            throw new IllegalArgumentException("prioridade precisa estar entre 1 e 4.");
        }
        String tipo = texto(p, "tipo_carga", "remedio");
        if ("orgao".equals(tipo)) {
            // Faixa de 2 a 8 °C da regra do SADEC; vibração máxima igual ao limite padrão da Central.
            return new TransporteOrgao(codigo, rota, texto(p, "orgao", "órgão"),
                    new Hospital(texto(p, "origem", "Hospital de origem"), "", true, ""), 2.0, 8.0, 3.0);
        }
        return new Entrega(codigo, tipo, prioridade, rota, "agora");
    }

    private static Drone montarDrone(Map<String, Object> d) {
        int bateria = (int) Math.round(numero(d, "bateria_pct", -1));
        if (bateria < 0 || bateria > 100) {
            throw new IllegalArgumentException("bateria_pct do drone precisa estar entre 0 e 100.");
        }
        return new Drone(texto(d, "codigo", "?"), texto(d, "modelo", ""), bateria,
                numero(d, "autonomia_km", 0), texto(d, "status", "livre"));
    }

    // ---------- utilitários ----------

    private static Map<String, Object> ok(String operacao) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("ok", true);
        r.put("operacao", operacao);
        return r;
    }

    private static Map<String, Object> erro(String mensagem) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("ok", false);
        List<Object> erros = new ArrayList<>();
        erros.add(mensagem);
        r.put("erros", erros);
        return r;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> objeto(Map<String, Object> dados, String campo) {
        Object v = dados.get(campo);
        if (!(v instanceof Map)) {
            throw new IllegalArgumentException(campo + " precisa ser um objeto.");
        }
        return (Map<String, Object>) v;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> listaDeObjetos(Map<String, Object> dados, String campo) {
        List<Map<String, Object>> lista = new ArrayList<>();
        Object v = dados.get(campo);
        if (v == null) {
            return lista;
        }
        if (!(v instanceof List)) {
            throw new IllegalArgumentException(campo + " precisa ser uma lista.");
        }
        for (Object item : (List<Object>) v) {
            if (!(item instanceof Map)) {
                throw new IllegalArgumentException("Itens de " + campo + " precisam ser objetos.");
            }
            lista.add((Map<String, Object>) item);
        }
        return lista;
    }

    private static String texto(Map<String, Object> dados, String campo, String padrao) {
        Object v = dados.get(campo);
        return v instanceof String ? (String) v : padrao;
    }

    private static double numero(Map<String, Object> dados, String campo, double padrao) {
        Object v = dados.get(campo);
        return v instanceof Double ? (Double) v : padrao;
    }

    private static String lerTudo(InputStream in) throws Exception {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] bloco = new byte[4096];
        int n;
        while ((n = in.read(bloco)) != -1) {
            buffer.write(bloco, 0, n);
        }
        return buffer.toString(StandardCharsets.UTF_8.name());
    }
}

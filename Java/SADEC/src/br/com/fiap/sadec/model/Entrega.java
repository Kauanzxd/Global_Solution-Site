package br.com.fiap.sadec.model;

/**
 * Pedido de entrega (classe-mãe de TransporteOrgao).
 *
 * Prioridade (o número menor passa na frente):
 *  1 = órgãos | 2 = emergência | 3 = saúde | 4 = comercial.
 * Status: aguardando, em_voo, entregue, reagendada, aguardando_resgate.
 */
public class Entrega {

    private String codigo;
    private String tipoCarga;     // orgao, remedio, kit_emergencia, exame, encomenda
    private int prioridade;
    private String status;
    private Rota rota;
    private Drone drone;          // null enquanto nenhum drone foi atribuído
    private String periodo;       // manha, tarde, noite, agora

    public Entrega() {
    }

    public Entrega(String codigo, String tipoCarga, int prioridade, Rota rota, String periodo) {
        this.codigo = codigo;
        this.tipoCarga = tipoCarga;
        setPrioridade(prioridade);
        this.rota = rota;
        this.periodo = periodo;
        this.status = "aguardando";
    }

    /** Folga de bateria exigida. Entregas comuns: 1,0 (sem folga). TransporteOrgao sobrescreve. */
    public double getFatorSeguranca() {
        return 1.0;
    }

    /** Nome do nível de prioridade, para as saídas. */
    public String getDescricaoPrioridade() {
        switch (prioridade) {
            case 1:
                return "nível 1 - Órgãos";
            case 2:
                return "nível 2 - Emergência";
            case 3:
                return "nível 3 - Saúde";
            default:
                return "nível 4 - Comercial";
        }
    }

    public String getCodigo() {
        return codigo;
    }

    public void setCodigo(String codigo) {
        this.codigo = codigo;
    }

    public String getTipoCarga() {
        return tipoCarga;
    }

    public void setTipoCarga(String tipoCarga) {
        this.tipoCarga = tipoCarga;
    }

    public int getPrioridade() {
        return prioridade;
    }

    /** Encapsulamento: prioridade sempre entre 1 e 4. */
    public void setPrioridade(int prioridade) {
        if (prioridade < 1 || prioridade > 4) {
            throw new IllegalArgumentException("Prioridade deve ser de 1 a 4: " + prioridade);
        }
        this.prioridade = prioridade;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Rota getRota() {
        return rota;
    }

    public void setRota(Rota rota) {
        this.rota = rota;
    }

    public Drone getDrone() {
        return drone;
    }

    public void setDrone(Drone drone) {
        this.drone = drone;
    }

    public String getPeriodo() {
        return periodo;
    }

    public void setPeriodo(String periodo) {
        this.periodo = periodo;
    }

    @Override
    public String toString() {
        return String.format("%s | %-14s | %-20s | destino: %-22s | drone: %-5s | %s",
                codigo, tipoCarga, getDescricaoPrioridade(), rota.getDestino().getNome(),
                (drone == null ? "-" : drone.getCodigo()), status);
    }
}

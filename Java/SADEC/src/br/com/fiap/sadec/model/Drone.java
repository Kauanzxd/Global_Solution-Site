package br.com.fiap.sadec.model;

/**
 * Drone agrícola adaptado (compartimento térmico, paraquedas, GPS duplo).
 *
 * Status possíveis:
 *  livre, aguardando_comercial (reservado para entrega comercial que ainda não decolou),
 *  em_voo_comercial, em_voo, manutencao, pouso_emergencia.
 */
public class Drone {

    private String codigo;
    private String modelo;
    private int bateriaPct;        // carga atual da bateria (0 a 100)
    private double autonomiaKm;    // alcance com a bateria em 100%
    private String status;

    public Drone() {
    }

    public Drone(String codigo, String modelo, int bateriaPct, double autonomiaKm, String status) {
        this.codigo = codigo;
        this.modelo = modelo;
        setBateriaPct(bateriaPct);
        this.autonomiaKm = autonomiaKm;
        this.status = status;
    }

    /** Alcance com a carga atual: autonomia x bateria / 100. */
    public double calcularAlcanceAtual() {
        return autonomiaKm * bateriaPct / 100.0;
    }

    /**
     * Regra de segurança: o drone só decola se o alcance atual cobrir a rota de ida e volta
     * multiplicada pelo fator de folga (1,3 = 30% de folga, padrão de todas as entregas).
     */
    public boolean verificarAutonomia(double distanciaIdaVoltaKm, double fatorSeguranca) {
        return calcularAlcanceAtual() >= distanciaIdaVoltaKm * fatorSeguranca;
    }

    /** Desconta da bateria a energia gasta para voar a distância informada. */
    public void consumirBateria(double kmVoados) {
        int gasto = (int) Math.round(kmVoados / autonomiaKm * 100);
        setBateriaPct(bateriaPct - gasto);
    }

    public String getCodigo() {
        return codigo;
    }

    public void setCodigo(String codigo) {
        this.codigo = codigo;
    }

    public String getModelo() {
        return modelo;
    }

    public void setModelo(String modelo) {
        this.modelo = modelo;
    }

    public int getBateriaPct() {
        return bateriaPct;
    }

    /** Encapsulamento: a bateria nunca fica abaixo de 0% nem acima de 100%. */
    public void setBateriaPct(int bateriaPct) {
        if (bateriaPct < 0) {
            bateriaPct = 0;
        } else if (bateriaPct > 100) {
            bateriaPct = 100;
        }
        this.bateriaPct = bateriaPct;
    }

    public double getAutonomiaKm() {
        return autonomiaKm;
    }

    public void setAutonomiaKm(double autonomiaKm) {
        this.autonomiaKm = autonomiaKm;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    @Override
    public String toString() {
        return String.format("%s | %s | bateria %d%% | alcance %.1f km | %s",
                codigo, modelo, bateriaPct, calcularAlcanceAtual(), status);
    }
}

package br.com.fiap.sadec.model;

/**
 * Transporte de órgão para transplante. Herda de Entrega e sempre tem prioridade 1.
 * Segue o padrão de bateria de toda entrega (ida e volta + 30% de folga, herdado de Entrega).
 */
public class TransporteOrgao extends Entrega {

    private String orgao;                // rim, coração, fígado...
    private Hospital hospitalOrigem;
    private double temperaturaMinC;      // faixa de temperatura segura da carga
    private double temperaturaMaxC;
    private double vibracaoMaxG;         // vibração máxima tolerada (em g)

    public TransporteOrgao() {
    }

    public TransporteOrgao(String codigo, Rota rota, String orgao, Hospital hospitalOrigem,
                           double temperaturaMinC, double temperaturaMaxC, double vibracaoMaxG) {
        super(codigo, "orgao", 1, rota, "agora");   // prioridade máxima
        this.orgao = orgao;
        this.hospitalOrigem = hospitalOrigem;
        this.temperaturaMinC = temperaturaMinC;
        this.temperaturaMaxC = temperaturaMaxC;
        this.vibracaoMaxG = vibracaoMaxG;
    }

    public String getOrgao() {
        return orgao;
    }

    public void setOrgao(String orgao) {
        this.orgao = orgao;
    }

    public Hospital getHospitalOrigem() {
        return hospitalOrigem;
    }

    public void setHospitalOrigem(Hospital hospitalOrigem) {
        this.hospitalOrigem = hospitalOrigem;
    }

    public double getTemperaturaMinC() {
        return temperaturaMinC;
    }

    public void setTemperaturaMinC(double temperaturaMinC) {
        this.temperaturaMinC = temperaturaMinC;
    }

    public double getTemperaturaMaxC() {
        return temperaturaMaxC;
    }

    public void setTemperaturaMaxC(double temperaturaMaxC) {
        this.temperaturaMaxC = temperaturaMaxC;
    }

    public double getVibracaoMaxG() {
        return vibracaoMaxG;
    }

    public void setVibracaoMaxG(double vibracaoMaxG) {
        this.vibracaoMaxG = vibracaoMaxG;
    }

    @Override
    public String toString() {
        return super.toString() + " | " + orgao + " de " + hospitalOrigem.getNome();
    }
}

package br.com.fiap.sadec.model;

/**
 * Hospital da rede piloto. Herda de Local.
 * Pode ser origem ou destino do transporte de órgãos.
 */
public class Hospital extends Local {

    private boolean centroTransplante;
    private String telefone;

    public Hospital() {
    }

    public Hospital(String nome, String bairro, boolean centroTransplante, String telefone) {
        super(nome, bairro);   // chama o construtor de Local
        this.centroTransplante = centroTransplante;
        this.telefone = telefone;
    }

    @Override
    public String descrever() {
        return "Hospital " + getNome() + " (" + getBairro() + ")"
                + (centroTransplante ? " - centro de transplantes" : "");
    }

    public boolean isCentroTransplante() {
        return centroTransplante;
    }

    public void setCentroTransplante(boolean centroTransplante) {
        this.centroTransplante = centroTransplante;
    }

    public String getTelefone() {
        return telefone;
    }

    public void setTelefone(String telefone) {
        this.telefone = telefone;
    }
}

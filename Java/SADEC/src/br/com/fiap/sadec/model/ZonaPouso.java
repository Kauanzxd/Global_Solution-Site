package br.com.fiap.sadec.model;

/**
 * Zona de pouso ao longo de uma rota. Herda de Local.
 * Em pane, o drone desvia para a zona SEGURA mais próxima
 * (longe de pessoas e vias movimentadas).
 */
public class ZonaPouso extends Local {

    private double kmNaRota;   // em que ponto da rota a zona fica (km a partir da filial)
    private boolean segura;    // false = área com pessoas ou via movimentada no momento

    public ZonaPouso() {
    }

    public ZonaPouso(String nome, String bairro, double kmNaRota, boolean segura) {
        super(nome, bairro);
        this.kmNaRota = kmNaRota;
        this.segura = segura;
    }

    @Override
    public String descrever() {
        return "Zona de pouso " + getNome() + " (km " + kmNaRota + ", "
                + (segura ? "segura" : "NÃO segura") + ")";
    }

    public double getKmNaRota() {
        return kmNaRota;
    }

    public void setKmNaRota(double kmNaRota) {
        this.kmNaRota = kmNaRota;
    }

    public boolean isSegura() {
        return segura;
    }

    public void setSegura(boolean segura) {
        this.segura = segura;
    }
}

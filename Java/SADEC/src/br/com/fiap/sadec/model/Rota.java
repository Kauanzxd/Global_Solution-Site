package br.com.fiap.sadec.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Rota autorizada entre uma filial e um destino.
 * Cada rota tem várias zonas de pouso, e uma zona pode servir a várias rotas (relação N:N).
 */
public class Rota {

    private String codigo;
    private Filial origem;
    private Local destino;          // pode ser um Hospital, um bairro ou outro Local (polimorfismo)
    private double distanciaKm;     // só ida
    private List<ZonaPouso> zonasPouso;

    public Rota() {
        this.zonasPouso = new ArrayList<>();
    }

    public Rota(String codigo, Filial origem, Local destino, double distanciaKm) {
        this.codigo = codigo;
        this.origem = origem;
        this.destino = destino;
        this.distanciaKm = distanciaKm;
        this.zonasPouso = new ArrayList<>();
    }

    /** Liga uma zona de pouso a esta rota. */
    public void adicionarZonaPouso(ZonaPouso zona) {
        zonasPouso.add(zona);
    }

    /** O drone precisa ir e voltar para a base: distância x 2. */
    public double calcularDistanciaIdaVolta() {
        return distanciaKm * 2;
    }

    public String getCodigo() {
        return codigo;
    }

    public void setCodigo(String codigo) {
        this.codigo = codigo;
    }

    public Filial getOrigem() {
        return origem;
    }

    public void setOrigem(Filial origem) {
        this.origem = origem;
    }

    public Local getDestino() {
        return destino;
    }

    public void setDestino(Local destino) {
        this.destino = destino;
    }

    public double getDistanciaKm() {
        return distanciaKm;
    }

    public void setDistanciaKm(double distanciaKm) {
        this.distanciaKm = distanciaKm;
    }

    public List<ZonaPouso> getZonasPouso() {
        return zonasPouso;
    }

    public void setZonasPouso(List<ZonaPouso> zonasPouso) {
        this.zonasPouso = zonasPouso;
    }

    @Override
    public String toString() {
        return codigo + ": " + origem.getNome() + " -> " + destino.getNome() + " (" + distanciaKm + " km)";
    }
}

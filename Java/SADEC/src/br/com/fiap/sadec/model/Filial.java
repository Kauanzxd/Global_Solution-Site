package br.com.fiap.sadec.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Filial (base) de onde os drones decolam. Uma filial tem vários drones (relação 1:N).
 */
public class Filial {

    private String nome;
    private String bairro;
    private List<Drone> drones;

    public Filial() {
        this.drones = new ArrayList<>();
    }

    public Filial(String nome, String bairro) {
        this.nome = nome;
        this.bairro = bairro;
        this.drones = new ArrayList<>();
    }

    /** Adiciona um drone à frota desta filial. */
    public void adicionarDrone(Drone drone) {
        drones.add(drone);
    }

    public String getNome() {
        return nome;
    }

    public void setNome(String nome) {
        this.nome = nome;
    }

    public String getBairro() {
        return bairro;
    }

    public void setBairro(String bairro) {
        this.bairro = bairro;
    }

    public List<Drone> getDrones() {
        return drones;
    }

    public void setDrones(List<Drone> drones) {
        this.drones = drones;
    }

    @Override
    public String toString() {
        return nome + " (" + bairro + ") - " + drones.size() + " drone(s)";
    }
}

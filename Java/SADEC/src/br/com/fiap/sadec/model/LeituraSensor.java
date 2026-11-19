package br.com.fiap.sadec.model;

/**
 * Leitura dos sensores do compartimento de carga durante o voo.
 */
public class LeituraSensor {

    private Drone drone;
    private String horario;          // ex.: "14:05"
    private double temperaturaC;
    private double vibracaoG;
    private double kmPercorrido;     // posição do drone na rota no momento da leitura

    public LeituraSensor() {
    }

    public LeituraSensor(Drone drone, String horario, double temperaturaC, double vibracaoG, double kmPercorrido) {
        this.drone = drone;
        this.horario = horario;
        this.temperaturaC = temperaturaC;
        this.vibracaoG = vibracaoG;
        this.kmPercorrido = kmPercorrido;
    }

    public Drone getDrone() {
        return drone;
    }

    public void setDrone(Drone drone) {
        this.drone = drone;
    }

    public String getHorario() {
        return horario;
    }

    public void setHorario(String horario) {
        this.horario = horario;
    }

    public double getTemperaturaC() {
        return temperaturaC;
    }

    public void setTemperaturaC(double temperaturaC) {
        this.temperaturaC = temperaturaC;
    }

    public double getVibracaoG() {
        return vibracaoG;
    }

    public void setVibracaoG(double vibracaoG) {
        this.vibracaoG = vibracaoG;
    }

    public double getKmPercorrido() {
        return kmPercorrido;
    }

    public void setKmPercorrido(double kmPercorrido) {
        this.kmPercorrido = kmPercorrido;
    }

    @Override
    public String toString() {
        return String.format("%s %s | %.1f °C | vibração %.1f g | km %.1f",
                drone.getCodigo(), horario, temperaturaC, vibracaoG, kmPercorrido);
    }
}

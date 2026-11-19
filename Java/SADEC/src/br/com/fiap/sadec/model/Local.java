package br.com.fiap.sadec.model;

/**
 * Local atendido pela rede SADEC (classe-mãe).
 * Hospital e ZonaPouso herdam desta classe: os dois têm nome e bairro,
 * e cada um acrescenta o que é específico dele.
 */
public class Local {

    private String nome;
    private String bairro;

    public Local() {
    }

    public Local(String nome, String bairro) {
        this.nome = nome;
        this.bairro = bairro;
    }

    /** Texto curto usado nas saídas do sistema. As classes filhas sobrescrevem (polimorfismo). */
    public String descrever() {
        return nome + " (" + bairro + ")";
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

    @Override
    public String toString() {
        return descrever();
    }
}

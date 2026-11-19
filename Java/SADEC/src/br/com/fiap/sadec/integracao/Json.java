package br.com.fiap.sadec.integracao;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Leitor e escritor de JSON mínimo para a integração (sem bibliotecas externas).
 * Objetos viram Map, listas viram List, números viram Double, true/false viram Boolean.
 */
public final class Json {

    private final String texto;
    private int pos;

    private Json(String texto) {
        this.texto = texto;
    }

    public static Object ler(String texto) {
        Json leitor = new Json(texto);
        leitor.espacos();
        Object valor = leitor.valor();
        leitor.espacos();
        if (leitor.pos != texto.length()) {
            throw new IllegalArgumentException("Conteúdo extra depois do JSON na posição " + leitor.pos);
        }
        return valor;
    }

    private Object valor() {
        if (pos >= texto.length()) {
            throw new IllegalArgumentException("JSON incompleto");
        }
        char c = texto.charAt(pos);
        if (c == '{') {
            return objeto();
        }
        if (c == '[') {
            return lista();
        }
        if (c == '"') {
            return textoEntreAspas();
        }
        if (texto.startsWith("true", pos)) {
            pos += 4;
            return Boolean.TRUE;
        }
        if (texto.startsWith("false", pos)) {
            pos += 5;
            return Boolean.FALSE;
        }
        if (texto.startsWith("null", pos)) {
            pos += 4;
            return null;
        }
        return numero();
    }

    private Map<String, Object> objeto() {
        Map<String, Object> mapa = new LinkedHashMap<>();
        pos++;
        espacos();
        if (pos < texto.length() && texto.charAt(pos) == '}') {
            pos++;
            return mapa;
        }
        while (true) {
            espacos();
            String chave = textoEntreAspas();
            espacos();
            esperar(':');
            espacos();
            mapa.put(chave, valor());
            espacos();
            if (pos < texto.length() && texto.charAt(pos) == ',') {
                pos++;
                continue;
            }
            esperar('}');
            return mapa;
        }
    }

    private List<Object> lista() {
        List<Object> itens = new ArrayList<>();
        pos++;
        espacos();
        if (pos < texto.length() && texto.charAt(pos) == ']') {
            pos++;
            return itens;
        }
        while (true) {
            espacos();
            itens.add(valor());
            espacos();
            if (pos < texto.length() && texto.charAt(pos) == ',') {
                pos++;
                continue;
            }
            esperar(']');
            return itens;
        }
    }

    private String textoEntreAspas() {
        esperar('"');
        StringBuilder sb = new StringBuilder();
        while (pos < texto.length()) {
            char c = texto.charAt(pos++);
            if (c == '"') {
                return sb.toString();
            }
            if (c == '\\') {
                char e = texto.charAt(pos++);
                switch (e) {
                    case 'n': sb.append('\n'); break;
                    case 't': sb.append('\t'); break;
                    case 'r': sb.append('\r'); break;
                    case 'b': sb.append('\b'); break;
                    case 'f': sb.append('\f'); break;
                    case 'u':
                        sb.append((char) Integer.parseInt(texto.substring(pos, pos + 4), 16));
                        pos += 4;
                        break;
                    default: sb.append(e);
                }
            } else {
                sb.append(c);
            }
        }
        throw new IllegalArgumentException("Texto sem aspas de fechamento");
    }

    private Double numero() {
        int inicio = pos;
        while (pos < texto.length() && "+-0123456789.eE".indexOf(texto.charAt(pos)) >= 0) {
            pos++;
        }
        if (inicio == pos) {
            throw new IllegalArgumentException("Valor inválido na posição " + inicio);
        }
        return Double.parseDouble(texto.substring(inicio, pos));
    }

    private void esperar(char c) {
        if (pos >= texto.length() || texto.charAt(pos) != c) {
            throw new IllegalArgumentException("Esperado '" + c + "' na posição " + pos);
        }
        pos++;
    }

    private void espacos() {
        while (pos < texto.length() && Character.isWhitespace(texto.charAt(pos))) {
            pos++;
        }
    }

    // ---------- escrita ----------

    public static String escrever(Object valor) {
        StringBuilder sb = new StringBuilder();
        escrever(valor, sb);
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private static void escrever(Object valor, StringBuilder sb) {
        if (valor == null) {
            sb.append("null");
        } else if (valor instanceof String) {
            sb.append('"');
            String s = (String) valor;
            for (int i = 0; i < s.length(); i++) {
                char c = s.charAt(i);
                if (c == '"' || c == '\\') {
                    sb.append('\\').append(c);
                } else if (c == '\n') {
                    sb.append("\\n");
                } else if (c < 0x20) {
                    sb.append(String.format("\\u%04x", (int) c));
                } else {
                    sb.append(c);
                }
            }
            sb.append('"');
        } else if (valor instanceof Map) {
            sb.append('{');
            boolean primeiro = true;
            for (Map.Entry<String, Object> e : ((Map<String, Object>) valor).entrySet()) {
                if (!primeiro) {
                    sb.append(',');
                }
                primeiro = false;
                escrever(e.getKey(), sb);
                sb.append(':');
                escrever(e.getValue(), sb);
            }
            sb.append('}');
        } else if (valor instanceof List) {
            sb.append('[');
            boolean primeiro = true;
            for (Object item : (List<Object>) valor) {
                if (!primeiro) {
                    sb.append(',');
                }
                primeiro = false;
                escrever(item, sb);
            }
            sb.append(']');
        } else if (valor instanceof Double) {
            double d = (Double) valor;
            if (d == Math.rint(d) && Math.abs(d) < 1e15) {
                sb.append((long) d);
            } else {
                sb.append(Math.round(d * 100) / 100.0);
            }
        } else {
            sb.append(valor);
        }
    }
}

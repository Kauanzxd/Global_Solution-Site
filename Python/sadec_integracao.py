"""
SADEC - Interface de integração do Python (Global Solution 2026/2, FIAP)

Usada pelo Node-RED por linha de comando. Recebe UM objeto JSON (stdin ou 1º argumento)
e devolve exatamente UM objeto JSON no stdout. Erros técnicos vão para o stderr.

Não substitui o programa de console: o arquivo sadec.py continua igual e roda normalmente.
Aqui só são reaproveitadas as funções de validação e de cálculo dele, sem abrir o menu.

Regras acadêmicas seguidas: sem classes, sem orientação a objetos e sem list comprehension.

Exemplos:
  python sadec_integracao.py "{\"operacao\": \"calcular_rota\", \"distancia_km\": 6, \"autonomia_km\": 20, \"bateria_pct\": 70}"
  echo {"operacao": "prioridade_do_uso", "uso": "Entrega de remédios"} | python sadec_integracao.py
"""

import json
import os
import sys

# Marca onde começa o programa principal (o menu) dentro do sadec.py.
MARCA_PROGRAMA_PRINCIPAL = "# 7. PROGRAMA PRINCIPAL"

OPERACOES = ["calcular_rota", "prioridade_do_uso", "validar"]


def carregar_funcoes_sadec():
    # Lê o sadec.py e executa só a parte das funções (antes do menu).
    # Assim as funções originais são usadas sem copiar o código e sem abrir o console.
    pasta = os.path.dirname(os.path.abspath(__file__))
    caminho = os.path.join(pasta, "sadec.py")
    arquivo = open(caminho, encoding="utf-8")
    codigo = arquivo.read()
    arquivo.close()
    posicao = codigo.find(MARCA_PROGRAMA_PRINCIPAL)
    if posicao == -1:
        raise RuntimeError("Marca do programa principal não encontrada em sadec.py")
    funcoes = {"__name__": "sadec_funcoes"}
    exec(compile(codigo[:posicao], caminho, "exec"), funcoes)
    return funcoes


SADEC = carregar_funcoes_sadec()


# ---------- validação de entrada ----------

def eh_numero(valor):
    # True para int ou float (bool não conta como número)
    return (isinstance(valor, int) or isinstance(valor, float)) and not isinstance(valor, bool)


def ler_numero(dados, campo, minimo, maximo, erros, obrigatorio):
    # Lê um número do JSON e confere a faixa. Registra o erro na lista "erros".
    if not (campo in dados) or dados[campo] is None:
        if obrigatorio:
            erros.append(campo + " é obrigatório.")
        return None
    valor = dados[campo]
    if not eh_numero(valor):
        erros.append(campo + " precisa ser um número.")
        return None
    if valor < minimo or valor > maximo:
        erros.append(campo + " precisa estar entre " + str(minimo) + " e " + str(maximo) + ".")
        return None
    return float(valor)


def ler_ponto(dados, campo, erros):
    # Ponto com latitude e longitude em graus: {"lat": -23.55, "lon": -46.63}
    if not (campo in dados) or not isinstance(dados[campo], dict):
        erros.append(campo + " precisa ter lat e lon.")
        return None
    ponto = dados[campo]
    lat = ler_numero(ponto, "lat", -90, 90, erros, True)
    lon = ler_numero(ponto, "lon", -180, 180, erros, True)
    if lat is None or lon is None:
        return None
    return [lat, lon]


# ---------- operações ----------

def calcular_rota(dados):
    # Distância (calcular_distancia) e bateria necessária com reserva de 30%
    # (calcular_bateria_necessaria). Se vier a bateria do drone, diz se ele pode voar.
    erros = []
    autonomia = ler_numero(dados, "autonomia_km", 0.1, 1000, erros, True)
    bateria = ler_numero(dados, "bateria_pct", 0, 100, erros, False)
    distancia = None
    if "distancia_km" in dados:
        distancia = ler_numero(dados, "distancia_km", 0, 1000, erros, True)
    else:
        origem = ler_ponto(dados, "origem", erros)
        destino = ler_ponto(dados, "destino", erros)
        if origem is not None and destino is not None:
            distancia = SADEC["calcular_distancia"](origem[0], origem[1], destino[0], destino[1])
    if len(erros) > 0:
        return {"ok": False, "operacao": "calcular_rota", "erros": erros}

    necessaria = SADEC["calcular_bateria_necessaria"](distancia, autonomia)
    resposta = {
        "ok": True,
        "operacao": "calcular_rota",
        "distancia_km": round(distancia, 2),
        "bateria_necessaria_pct": round(necessaria, 2),
        "reserva_pct": 30,
        "regra": "bateria necessária = distância / autonomia x 100 x 1,3"
    }
    if bateria is not None:
        # Mesmo critério do escolher_drone(): a bateria precisa ser MAIOR OU IGUAL à necessária.
        resposta["bateria_disponivel_pct"] = bateria
        resposta["aprovado"] = bateria >= necessaria
        if not resposta["aprovado"]:
            resposta["motivo"] = "Bateria insuficiente: " + str(round(bateria, 2)) + "% disponível, " + str(round(necessaria, 2)) + "% necessário."
    return resposta


def prioridade_do_uso(dados):
    if not isinstance(dados.get("uso"), str) or dados.get("uso") == "":
        return {"ok": False, "operacao": "prioridade_do_uso", "erros": ["uso é obrigatório."]}
    prioridade = SADEC["prioridade_do_uso"](dados["uso"])
    return {"ok": True, "operacao": "prioridade_do_uso", "prioridade": prioridade,
            "prioridade_texto": SADEC["formatar_prioridade"](prioridade)}


def validar(dados):
    # Usa as funções de validação originais em cada campo enviado.
    validadores = {
        "cep": "cep_valido",
        "email": "email_valido",
        "peso": "numero_decimal_valido",
        "codigo_recebimento": "codigo_recebimento_valido"
    }
    resultado = {}
    algum = False
    for campo in validadores:
        if campo in dados:
            algum = True
            valor = dados[campo]
            if not isinstance(valor, str):
                resultado[campo] = False
            else:
                resultado[campo] = SADEC[validadores[campo]](valor)
    if not algum:
        return {"ok": False, "operacao": "validar", "erros": ["Envie ao menos um campo: cep, email, peso ou codigo_recebimento."]}
    todos_validos = True
    for campo in resultado:
        if not resultado[campo]:
            todos_validos = False
    return {"ok": True, "operacao": "validar", "validos": todos_validos, "campos": resultado}


def processar(dados):
    # Despacha para a operação pedida. Sempre devolve um dicionário.
    if not isinstance(dados, dict):
        return {"ok": False, "erros": ["A entrada precisa ser um objeto JSON."]}
    operacao = dados.get("operacao")
    if operacao == "calcular_rota":
        return calcular_rota(dados)
    if operacao == "prioridade_do_uso":
        return prioridade_do_uso(dados)
    if operacao == "validar":
        return validar(dados)
    return {"ok": False, "erros": ["operacao inválida. Use: " + ", ".join(OPERACOES) + "."]}


def principal():
    # Lê o JSON do 1º argumento ou do stdin e imprime uma única resposta JSON.
    if len(sys.argv) > 1:
        texto = sys.argv[1]
    else:
        texto = sys.stdin.read()
    try:
        dados = json.loads(texto)
    except ValueError as erro:
        sys.stderr.write("JSON inválido: " + str(erro) + "\n")
        print(json.dumps({"ok": False, "erros": ["JSON inválido."]}, ensure_ascii=False))
        return 2
    try:
        resposta = processar(dados)
    except Exception as erro:  # erro técnico: detalhe só no stderr
        sys.stderr.write("Erro interno: " + repr(erro) + "\n")
        print(json.dumps({"ok": False, "erros": ["Erro interno no cálculo."]}, ensure_ascii=False))
        return 1
    print(json.dumps(resposta, ensure_ascii=False))
    if resposta.get("ok"):
        return 0
    return 3


if __name__ == "__main__":
    sys.exit(principal())

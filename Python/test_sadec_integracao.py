"""
Testes da interface de integração do SADEC (sem bibliotecas externas e sem classes).
Rodar: python test_sadec_integracao.py
"""

import json
import os
import subprocess
import sys

import sadec_integracao as integ

PASTA = os.path.dirname(os.path.abspath(__file__))


def rodar_cli(entrada):
    # Executa a interface como o Node-RED faria e devolve (código de saída, json, stderr)
    processo = subprocess.run([sys.executable, os.path.join(PASTA, "sadec_integracao.py")],
                              input=entrada, capture_output=True, text=True, encoding="utf-8")
    linhas = processo.stdout.strip().split("\n")
    return processo.returncode, json.loads(linhas[-1]), processo.stderr, len(linhas)


def test_distancia_usa_funcao_original():
    # 0,1 grau de latitude = 11,08 km pela regra do sadec.py (110,8 km por grau)
    r = integ.processar({"operacao": "calcular_rota", "origem": {"lat": -23.5, "lon": -46.6},
                         "destino": {"lat": -23.6, "lon": -46.6}, "autonomia_km": 20})
    assert r["ok"] is True
    assert r["distancia_km"] == 11.08


def test_distancia_pitagoras():
    # 3 e 4 km (em graus) -> 5 km
    lat = 3 / 110.8
    lon = 4 / 102.0
    r = integ.processar({"operacao": "calcular_rota", "origem": {"lat": 0, "lon": 0},
                         "destino": {"lat": lat, "lon": lon}, "autonomia_km": 20})
    assert r["distancia_km"] == 5.0


def test_bateria_com_reserva_de_30():
    # 10 km com autonomia de 20 km = 50% de rota; x 1,3 = 65%
    r = integ.processar({"operacao": "calcular_rota", "distancia_km": 10, "autonomia_km": 20})
    assert r["bateria_necessaria_pct"] == 65.0
    assert r["reserva_pct"] == 30


def test_bateria_suficiente():
    r = integ.processar({"operacao": "calcular_rota", "distancia_km": 10, "autonomia_km": 20, "bateria_pct": 80})
    assert r["aprovado"] is True
    assert "motivo" not in r


def test_bateria_insuficiente():
    r = integ.processar({"operacao": "calcular_rota", "distancia_km": 10, "autonomia_km": 20, "bateria_pct": 64})
    assert r["aprovado"] is False
    assert "insuficiente" in r["motivo"]


def test_limite_exato_aprova():
    # 6 km / 20 km = 30%; x 1,3 = 39%. Com 39% exatos, o drone voa (mesmo critério >= do escolher_drone)
    r = integ.processar({"operacao": "calcular_rota", "distancia_km": 6, "autonomia_km": 20, "bateria_pct": 39})
    assert r["bateria_necessaria_pct"] == 39.0
    assert r["aprovado"] is True


def test_limite_logo_abaixo_reprova():
    r = integ.processar({"operacao": "calcular_rota", "distancia_km": 6, "autonomia_km": 20, "bateria_pct": 38.99})
    assert r["aprovado"] is False


def test_entrada_invalida():
    sem_autonomia = integ.processar({"operacao": "calcular_rota", "distancia_km": 6})
    assert sem_autonomia["ok"] is False
    texto = integ.processar({"operacao": "calcular_rota", "distancia_km": "seis", "autonomia_km": 20})
    assert texto["ok"] is False
    negativa = integ.processar({"operacao": "calcular_rota", "distancia_km": -1, "autonomia_km": 20})
    assert negativa["ok"] is False
    bateria = integ.processar({"operacao": "calcular_rota", "distancia_km": 1, "autonomia_km": 20, "bateria_pct": 101})
    assert bateria["ok"] is False
    booleano = integ.processar({"operacao": "calcular_rota", "distancia_km": True, "autonomia_km": 20})
    assert booleano["ok"] is False
    assert integ.processar({"operacao": "desconhecida"})["ok"] is False
    assert integ.processar([1, 2])["ok"] is False


def test_prioridade_do_uso_original():
    assert integ.processar({"operacao": "prioridade_do_uso", "uso": "Entrega de remédios"})["prioridade"] == 3
    assert integ.processar({"operacao": "prioridade_do_uso", "uso": "Entrega de comida"})["prioridade"] == 4


def test_validacoes_originais():
    r = integ.processar({"operacao": "validar", "cep": "01310-100", "email": "ana@sadec.org",
                         "peso": "2,5", "codigo_recebimento": "4821"})
    assert r["validos"] is True
    r = integ.processar({"operacao": "validar", "cep": "123", "codigo_recebimento": "48a1"})
    assert r["validos"] is False
    assert r["campos"]["cep"] is False


def test_cli_devolve_um_unico_json():
    codigo, resposta, erro, linhas = rodar_cli('{"operacao": "calcular_rota", "distancia_km": 6, "autonomia_km": 20, "bateria_pct": 39}')
    assert codigo == 0
    assert linhas == 1
    assert resposta["aprovado"] is True
    assert erro == ""


def test_cli_json_malformado_vai_para_stderr():
    codigo, resposta, erro, linhas = rodar_cli("{isso não é json")
    assert codigo == 2
    assert resposta["ok"] is False
    assert "JSON inválido" in erro


def test_importar_nao_abre_o_menu():
    # Se o menu abrisse, o import ficaria esperando input(); aqui ele termina e não imprime nada.
    processo = subprocess.run([sys.executable, "-c", "import sadec_integracao"], cwd=PASTA,
                              input="", capture_output=True, text=True, timeout=20)
    assert processo.returncode == 0
    assert processo.stdout == ""


def executar_testes():
    nomes = []
    for nome in sorted(globals()):
        if nome.startswith("test_"):
            nomes.append(nome)
    falhas = 0
    for nome in nomes:
        try:
            globals()[nome]()
            print("ok   " + nome)
        except Exception as erro:
            falhas += 1
            print("FALHA " + nome + ": " + repr(erro))
    print(str(len(nomes) - falhas) + " de " + str(len(nomes)) + " testes passaram")
    return falhas


if __name__ == "__main__":
    sys.exit(1 if executar_testes() else 0)

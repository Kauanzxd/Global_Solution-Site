"""
SADEC - Migração 002 (reversível): contas, códigos de órgão e localizações reais.

  python migrar_002.py up   ../SADEC_Chatbot.db
  python migrar_002.py down ../SADEC_Chatbot.db

Acrescenta:
  - tbl_local: latitude, longitude, endereço e fonte; todos os hospitais do CNES listados no Python/sadec.py
  - tbl_filial: latitude e longitude
  - tbl_usuario: contas (uma conta vale para o portal, o SADEC Saúde e o SADEC Delivery)
  - tbl_sessao: sessões de login (só o hash do token é guardado)
  - tbl_codigo_orgao: código de uso único, emitido pela Central para cada transporte de órgão (P1)
  - tbl_entrega.NR_Usuario: conta dona do pedido
A distância de cada novo hospital até a filial mais próxima usa calcular_distancia() do sadec.py.
"""

import hashlib
import os
import shutil
import sqlite3
import sys
from datetime import datetime

PASTA = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(PASTA))
sys.path.insert(0, os.path.join(RAIZ, "Python"))
import sadec_integracao  # noqa: E402  (carrega as funções originais do sadec.py sem abrir o menu)

VERSAO = 2

# Filiais e bairros: coordenadas aproximadas do centro de cada região, para o mapa.
FILIAIS = {"Filial Centro": (-23.5505, -46.6333), "Filial Zona Sul": (-23.6537, -46.7095), "Filial Zona Leste": (-23.5402, -46.4560)}
APROXIMADAS = {"Capão Redondo": (-23.6714, -46.7790), "Jardim Ângela": (-23.7155, -46.7676), "Brasilândia": (-23.4686, -46.6869),
               "Paraisópolis": (-23.6167, -46.7258), "Itaquera": (-23.5402, -46.4560), "Parelheiros": (-23.8270, -46.7290),
               "Centro": (-23.5505, -46.6333), "Mooca": (-23.5606, -46.5985), "Hospital do Servidor Público": (-23.5985, -46.6440)}
# Hospitais que já estavam no banco: nome no banco -> trecho do nome no CNES
JA_EXISTENTES = {"Hospital das Clínicas": "HC da FMUSP Hospital das Clinicas", "InCor": "Instituto do Coracao Incor",
                 "Santa Casa": "Santa Casa de Sao Paulo Hospital Central", "Hospital São Paulo": "Hospital Sao Paulo Hospital de Ensino"}


# Contas fictícias para a apresentação: nome, e-mail, perfil, instituição. Senha de demonstração documentada no README.
SENHA_DEMO = "sadec2026"
CONTAS_DEMO = [["Operador da Central (demonstração)", "operador@sadec.demo", "operador", "Central SADEC"],
               ["Equipe de transplantes (demonstração)", "hospital@sadec.demo", "unidade_saude", "Hospital das Clínicas"],
               ["Cliente (demonstração)", "cliente@sadec.demo", "cliente", None]]


def hash_senha(senha):
    # Mesmo formato conferido pela API (crypto.scryptSync no Node): scrypt$N$r$p$sal$hash
    sal = os.urandom(16)
    chave = hashlib.scrypt(senha.encode("utf-8"), salt=sal, n=16384, r=8, p=1, dklen=64)
    return "scrypt$16384$8$1$" + sal.hex() + "$" + chave.hex()


def hospitais_cnes():
    # Lê as listas paralelas de hospitais do sadec.py (sem executar o menu)
    arquivo = open(os.path.join(RAIZ, "Python", "sadec.py"), encoding="utf-8")
    codigo = arquivo.read()
    arquivo.close()
    inicio = codigo.find("\nlista_hospital_rede = [")
    fim = codigo.find("\nlista_drone_codigo")
    dados = {}
    exec(codigo[inicio:fim], dados)
    lista = []
    for i in range(len(dados["lista_hospital_unidade"])):
        partes = dados["lista_hospital_unidade"][i].split(" - ", 1)
        endereco = ""
        if len(partes) > 1:
            endereco = partes[1].strip()
        lista.append([partes[0].strip(), endereco, dados["lista_hospital_latitude"][i], dados["lista_hospital_longitude"][i]])
    return lista


def distancia_filial_mais_proxima(lat, lon):
    menor = None
    for nome in FILIAIS:
        d = sadec_integracao.SADEC["calcular_distancia"](FILIAIS[nome][0], FILIAIS[nome][1], lat, lon)
        if menor is None or d < menor:
            menor = d
    return round(menor, 1)


def versao_aplicada(conexao):
    return conexao.execute("SELECT count(*) FROM tbl_migracao WHERE VERSAO = 2").fetchone()[0] > 0


def subir(caminho):
    conexao = sqlite3.connect(caminho, isolation_level=None)
    if versao_aplicada(conexao):
        print("Banco já está na versão 2.")
        return 0
    pasta = os.path.join(os.path.dirname(os.path.abspath(caminho)), "backups")
    os.makedirs(pasta, exist_ok=True)
    shutil.copyfile(caminho, os.path.join(pasta, "antes_migracao_002_" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".db"))
    conexao.execute("BEGIN IMMEDIATE")
    try:
        for coluna in ("NR_Latitude REAL", "NR_Longitude REAL", "DS_Endereco TEXT", "DS_Fonte TEXT"):
            conexao.execute("ALTER TABLE tbl_local ADD COLUMN " + coluna)
        for coluna in ("NR_Latitude REAL", "NR_Longitude REAL"):
            conexao.execute("ALTER TABLE tbl_filial ADD COLUMN " + coluna)
        conexao.execute("ALTER TABLE tbl_entrega ADD COLUMN NR_Usuario INTEGER")
        for nome in FILIAIS:
            conexao.execute("UPDATE tbl_filial SET NR_Latitude = ?, NR_Longitude = ? WHERE NM_Filial = ?", (FILIAIS[nome][0], FILIAIS[nome][1], nome))
        for nome in APROXIMADAS:
            conexao.execute("UPDATE tbl_local SET NR_Latitude = ?, NR_Longitude = ?, DS_Fonte = 'aproximada' WHERE NM_Local = ?",
                            (APROXIMADAS[nome][0], APROXIMADAS[nome][1], nome))
        usados = set()
        for h in hospitais_cnes():
            existente = None
            for nome_banco in JA_EXISTENTES:
                if JA_EXISTENTES[nome_banco] in h[0]:
                    existente = nome_banco
            if existente:
                # Mantém a distância já usada pelos testes e pela demonstração; só acrescenta a posição real
                conexao.execute("UPDATE tbl_local SET NR_Latitude = ?, NR_Longitude = ?, DS_Endereco = ?, DS_Fonte = 'CNES' WHERE NM_Local = ?",
                                (h[2], h[3], h[1], existente))
                continue
            nome = h[0]
            if nome in usados:
                nome = nome + " (" + h[1].split(" - ")[-1] + ")"
            usados.add(nome)
            conexao.execute("INSERT OR IGNORE INTO tbl_local (NM_Local, TP_Local, NR_Distancia_Km, NR_Latitude, NR_Longitude, DS_Endereco, DS_Fonte) "
                            "VALUES (?, 'hospital', ?, ?, ?, ?, 'CNES')", (nome, distancia_filial_mais_proxima(h[2], h[3]), h[2], h[3], h[1]))
        conexao.execute("""CREATE TABLE tbl_usuario (
            ID_Usuario      INTEGER PRIMARY KEY,
            NM_Nome         TEXT NOT NULL,
            DS_Email        TEXT NOT NULL UNIQUE,
            DS_Senha_Hash   TEXT NOT NULL,
            TP_Perfil       TEXT NOT NULL CHECK (TP_Perfil IN ('cliente', 'unidade_saude', 'operador')),
            NM_Instituicao  TEXT,
            DT_Criacao      TEXT NOT NULL)""")
        conexao.execute("""CREATE TABLE tbl_sessao (
            DS_Token_Hash   TEXT PRIMARY KEY,
            ID_Usuario      INTEGER NOT NULL REFERENCES tbl_usuario(ID_Usuario),
            DT_Expira       TEXT NOT NULL)""")
        conexao.execute("""CREATE TABLE tbl_codigo_orgao (
            CD_Codigo       TEXT PRIMARY KEY,
            NM_Hospital     TEXT NOT NULL,
            ID_Emissor      INTEGER NOT NULL REFERENCES tbl_usuario(ID_Usuario),
            ST_Codigo       TEXT NOT NULL CHECK (ST_Codigo IN ('ativo', 'usado')),
            CD_Rastreio     TEXT,
            DT_Emissao      TEXT NOT NULL,
            DT_Expira       TEXT NOT NULL)""")
        # Contas de demonstração (fictícias). O perfil operador não pode ser criado pelo cadastro público.
        for conta in CONTAS_DEMO:
            conexao.execute("INSERT INTO tbl_usuario (NM_Nome, DS_Email, DS_Senha_Hash, TP_Perfil, NM_Instituicao, DT_Criacao) VALUES (?, ?, ?, ?, ?, ?)",
                            (conta[0], conta[1], hash_senha(SENHA_DEMO), conta[2], conta[3], datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
        conexao.execute("INSERT INTO tbl_migracao VALUES (2, ?)", (datetime.now().strftime("%Y-%m-%d %H:%M"),))
        conexao.execute("COMMIT")
    except sqlite3.Error as erro:
        conexao.execute("ROLLBACK")
        sys.stderr.write("Migração 002 falhou e foi desfeita: " + str(erro) + "\n")
        return 1
    total = conexao.execute("SELECT count(*) FROM tbl_local WHERE TP_Local = 'hospital'").fetchone()[0]
    print("Migração 002 aplicada. Hospitais no banco: " + str(total))
    return 0


def descer(caminho):
    conexao = sqlite3.connect(caminho, isolation_level=None)
    if not versao_aplicada(conexao):
        print("Migração 002 não está aplicada.")
        return 0
    conexao.execute("BEGIN IMMEDIATE")
    try:
        for tabela in ("tbl_codigo_orgao", "tbl_sessao", "tbl_usuario"):
            conexao.execute("DROP TABLE " + tabela)
        conexao.execute("DELETE FROM tbl_local WHERE DS_Fonte = 'CNES' AND NM_Local NOT IN (?, ?, ?, ?)", tuple(JA_EXISTENTES.keys()))
        for coluna in ("NR_Latitude", "NR_Longitude", "DS_Endereco", "DS_Fonte"):
            conexao.execute("ALTER TABLE tbl_local DROP COLUMN " + coluna)
        for coluna in ("NR_Latitude", "NR_Longitude"):
            conexao.execute("ALTER TABLE tbl_filial DROP COLUMN " + coluna)
        conexao.execute("ALTER TABLE tbl_entrega DROP COLUMN NR_Usuario")
        conexao.execute("DELETE FROM tbl_migracao WHERE VERSAO = 2")
        conexao.execute("COMMIT")
    except sqlite3.Error as erro:
        conexao.execute("ROLLBACK")
        sys.stderr.write("Reversão 002 falhou e foi desfeita: " + str(erro) + "\n")
        return 1
    print("Migração 002 desfeita.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("up", "down"):
        print("Uso: python migrar_002.py up|down caminho/do/banco.db")
        sys.exit(2)
    if sys.argv[1] == "up":
        sys.exit(subir(sys.argv[2]))
    sys.exit(descer(sys.argv[2]))

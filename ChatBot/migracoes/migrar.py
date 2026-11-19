"""
SADEC - Migração 001 do banco do chatbot (SQLite), reversível.

  python migrar.py up   ../SADEC_Chatbot.db   -> aplica (faz backup antes)
  python migrar.py down ../SADEC_Chatbot.db   -> desfaz, voltando ao esquema original

O que a migração acrescenta (sem apagar os dados demonstrativos):
  - tbl_drone: novos estados atribuido, pouso_emergencia, aguardando_liberacao
  - tbl_entrega: origem, distância, peso, solicitante, motivo e novos estados
    (atribuida, outro_meio, aguardando_resgate); código no padrão SD1001
  - tbl_evento: histórico de mudanças de estado (quem, quando, de qual para qual)
  - tbl_recebimento: responsável, destinatário e estado da carga na entrega
O despacho duplo do mesmo drone é impedido pela API com UPDATE condicional em transação.
"""

import os
import shutil
import sqlite3
import sys
from datetime import datetime

VERSAO = 1

ESTADOS_DRONE = ("livre", "atribuido", "aguardando_comercial", "em_voo_comercial", "em_voo",
                 "pouso_emergencia", "manutencao", "aguardando_liberacao")
ESTADOS_ENTREGA = ("aguardando", "atribuida", "em_voo", "entregue", "reagendada",
                   "outro_meio", "aguardando_resgate")


def lista_sql(valores):
    texto = ""
    for v in valores:
        if texto != "":
            texto += ", "
        texto += "'" + v + "'"
    return texto


SUBIR = """
CREATE TABLE tbl_drone_nova (
    ID_Drone         INTEGER PRIMARY KEY,
    CD_Drone         TEXT NOT NULL UNIQUE,
    NM_Modelo        TEXT NOT NULL,
    NR_Bateria_Pct   INTEGER NOT NULL CHECK (NR_Bateria_Pct BETWEEN 0 AND 100),
    NR_Autonomia_Km  REAL NOT NULL,
    ST_Status        TEXT NOT NULL CHECK (ST_Status IN (""" + lista_sql(ESTADOS_DRONE) + """)),
    ID_Filial        INTEGER NOT NULL REFERENCES tbl_filial(ID_Filial)
);
INSERT INTO tbl_drone_nova SELECT * FROM tbl_drone;
DROP TABLE tbl_drone;
ALTER TABLE tbl_drone_nova RENAME TO tbl_drone;

CREATE TABLE tbl_entrega_nova (
    ID_Entrega       INTEGER PRIMARY KEY,
    CD_Rastreio      TEXT NOT NULL UNIQUE CHECK (CD_Rastreio GLOB 'SD[0-9][0-9][0-9][0-9]*'),
    NR_Chat          TEXT,
    NM_Destino       TEXT NOT NULL,
    TP_Carga         TEXT NOT NULL CHECK (TP_Carga IN ('orgao', 'remedio', 'kit_emergencia', 'exame', 'encomenda')),
    NR_Prioridade    INTEGER NOT NULL CHECK (NR_Prioridade BETWEEN 1 AND 4),
    ST_Status        TEXT NOT NULL CHECK (ST_Status IN (""" + lista_sql(ESTADOS_ENTREGA) + """)),
    DS_Periodo       TEXT,
    CD_Drone         TEXT,
    NR_Previsao_Min  INTEGER,
    DT_Pedido        TEXT NOT NULL,
    NM_Origem        TEXT,
    NR_Distancia_Km  REAL,
    NR_Peso_Kg       REAL,
    DS_Solicitante   TEXT,
    DS_Motivo        TEXT
);
INSERT INTO tbl_entrega_nova (ID_Entrega, CD_Rastreio, NR_Chat, NM_Destino, TP_Carga, NR_Prioridade, ST_Status,
                              DS_Periodo, CD_Drone, NR_Previsao_Min, DT_Pedido)
    SELECT ID_Entrega, CD_Rastreio, NR_Chat, NM_Destino, TP_Carga, NR_Prioridade, ST_Status,
           DS_Periodo, CD_Drone, NR_Previsao_Min, DT_Pedido FROM tbl_entrega;
DROP TABLE tbl_entrega;
ALTER TABLE tbl_entrega_nova RENAME TO tbl_entrega;
UPDATE tbl_entrega SET NR_Distancia_Km = (SELECT NR_Distancia_Km FROM tbl_local WHERE NM_Local = tbl_entrega.NM_Destino)
    WHERE NR_Distancia_Km IS NULL;

CREATE TABLE tbl_evento (
    ID_Evento        INTEGER PRIMARY KEY,
    CD_Rastreio      TEXT REFERENCES tbl_entrega(CD_Rastreio),
    CD_Drone         TEXT,
    ST_Anterior      TEXT,
    ST_Novo          TEXT NOT NULL,
    DS_Evento        TEXT NOT NULL,
    NM_Responsavel   TEXT NOT NULL,
    DT_Evento        TEXT NOT NULL
);
CREATE INDEX idx_evento_rastreio ON tbl_evento(CD_Rastreio);

CREATE TABLE tbl_recebimento (
    ID_Recebimento   INTEGER PRIMARY KEY,
    CD_Rastreio      TEXT NOT NULL UNIQUE REFERENCES tbl_entrega(CD_Rastreio),
    NM_Responsavel   TEXT NOT NULL,
    NM_Destinatario  TEXT NOT NULL,
    ST_Carga         TEXT NOT NULL CHECK (ST_Carga IN ('integra', 'avariada', 'temperatura', 'recusada')),
    DT_Recebimento   TEXT NOT NULL
);

CREATE TABLE tbl_migracao (VERSAO INTEGER PRIMARY KEY, DT_Aplicada TEXT NOT NULL);
"""

# Volta ao esquema original. Estados novos são convertidos para os mais próximos do original.
DESCER = """
DROP TABLE tbl_recebimento;
DROP TABLE tbl_evento;
DROP TABLE tbl_migracao;

CREATE TABLE tbl_entrega_antiga (
    ID_Entrega       INTEGER PRIMARY KEY,
    CD_Rastreio      TEXT NOT NULL UNIQUE,
    NR_Chat          TEXT,
    NM_Destino       TEXT NOT NULL,
    TP_Carga         TEXT NOT NULL CHECK (TP_Carga IN ('orgao', 'remedio', 'kit_emergencia', 'exame', 'encomenda')),
    NR_Prioridade    INTEGER NOT NULL CHECK (NR_Prioridade BETWEEN 1 AND 4),
    ST_Status        TEXT NOT NULL CHECK (ST_Status IN ('aguardando', 'em_voo', 'entregue', 'reagendada')),
    DS_Periodo       TEXT,
    CD_Drone         TEXT,
    NR_Previsao_Min  INTEGER,
    DT_Pedido        TEXT NOT NULL
);
INSERT INTO tbl_entrega_antiga SELECT ID_Entrega, CD_Rastreio, NR_Chat, NM_Destino, TP_Carga, NR_Prioridade,
    CASE ST_Status WHEN 'atribuida' THEN 'aguardando' WHEN 'outro_meio' THEN 'reagendada'
                   WHEN 'aguardando_resgate' THEN 'reagendada' ELSE ST_Status END,
    DS_Periodo, CD_Drone, NR_Previsao_Min, DT_Pedido FROM tbl_entrega;
DROP TABLE tbl_entrega;
ALTER TABLE tbl_entrega_antiga RENAME TO tbl_entrega;

CREATE TABLE tbl_drone_antiga (
    ID_Drone         INTEGER PRIMARY KEY,
    CD_Drone         TEXT NOT NULL UNIQUE,
    NM_Modelo        TEXT NOT NULL,
    NR_Bateria_Pct   INTEGER NOT NULL CHECK (NR_Bateria_Pct BETWEEN 0 AND 100),
    NR_Autonomia_Km  REAL NOT NULL,
    ST_Status        TEXT NOT NULL CHECK (ST_Status IN
                     ('livre', 'aguardando_comercial', 'em_voo_comercial', 'em_voo', 'manutencao')),
    ID_Filial        INTEGER NOT NULL REFERENCES tbl_filial(ID_Filial)
);
INSERT INTO tbl_drone_antiga SELECT ID_Drone, CD_Drone, NM_Modelo, NR_Bateria_Pct, NR_Autonomia_Km,
    CASE ST_Status WHEN 'atribuido' THEN 'em_voo' WHEN 'pouso_emergencia' THEN 'manutencao'
                   WHEN 'aguardando_liberacao' THEN 'manutencao' ELSE ST_Status END,
    ID_Filial FROM tbl_drone;
DROP TABLE tbl_drone;
ALTER TABLE tbl_drone_antiga RENAME TO tbl_drone;
"""


def versao_atual(conexao):
    existe = conexao.execute("SELECT count(*) FROM sqlite_master WHERE name = 'tbl_migracao'").fetchone()[0]
    if existe == 0:
        return 0
    linha = conexao.execute("SELECT max(VERSAO) FROM tbl_migracao").fetchone()
    if linha[0] is None:
        return 0
    return linha[0]


def executar(conexao, script):
    # Tudo numa transação: se algo falhar, nada muda.
    conexao.execute("PRAGMA foreign_keys = OFF")
    try:
        conexao.executescript("BEGIN IMMEDIATE;\n" + script + "\nCOMMIT;")
    except sqlite3.Error:
        if conexao.in_transaction:
            conexao.execute("ROLLBACK")
        raise


def subir(caminho):
    conexao = sqlite3.connect(caminho, isolation_level=None)
    if versao_atual(conexao) >= VERSAO:
        print("Banco já está na versão " + str(VERSAO) + ".")
        return 0
    pasta = os.path.join(os.path.dirname(os.path.abspath(caminho)), "backups")
    os.makedirs(pasta, exist_ok=True)
    copia = os.path.join(pasta, "antes_migracao_" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".db")
    shutil.copyfile(caminho, copia)
    print("Backup: " + copia)
    try:
        executar(conexao, SUBIR + "\nINSERT INTO tbl_migracao VALUES (1, '" + datetime.now().strftime("%Y-%m-%d %H:%M") + "');")
    except sqlite3.Error as erro:
        sys.stderr.write("Migração falhou e foi desfeita: " + str(erro) + "\n")
        return 1
    print("Migração 001 aplicada.")
    return 0


def descer(caminho):
    conexao = sqlite3.connect(caminho, isolation_level=None)
    if versao_atual(conexao) < VERSAO:
        print("Banco já está no esquema original.")
        return 0
    try:
        executar(conexao, DESCER)
    except sqlite3.Error as erro:
        sys.stderr.write("Reversão falhou e foi desfeita: " + str(erro) + "\n")
        return 1
    print("Migração 001 desfeita.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("up", "down"):
        print("Uso: python migrar.py up|down caminho/do/banco.db")
        sys.exit(2)
    if sys.argv[1] == "up":
        sys.exit(subir(sys.argv[2]))
    sys.exit(descer(sys.argv[2]))

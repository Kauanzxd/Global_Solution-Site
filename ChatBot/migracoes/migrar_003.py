# Migração 003: conta de administrador (perfil operador, acesso a todas as funcionalidades).
# Uso: python migrar_003.py up|down caminho/do/banco.db  (faz backup antes; roda em transação)
import os
import shutil
import sqlite3
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from migrar_002 import hash_senha, SENHA_DEMO  # noqa: E402  mesmo formato de senha e senha de demonstração

ADMIN = ("Administrador SADEC (demonstração)", "admin@sadec.demo", "operador", "Central SADEC")


def versao_aplicada(conexao):
    return conexao.execute("SELECT count(*) FROM tbl_migracao WHERE VERSAO = 3").fetchone()[0] > 0


def subir(caminho):
    conexao = sqlite3.connect(caminho, isolation_level=None)
    if versao_aplicada(conexao):
        print("Banco já está na versão 3.")
        return 0
    pasta = os.path.join(os.path.dirname(os.path.abspath(caminho)), "backups")
    os.makedirs(pasta, exist_ok=True)
    shutil.copyfile(caminho, os.path.join(pasta, "antes_migracao_003_" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".db"))
    agora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conexao.execute("BEGIN IMMEDIATE")
    try:
        conexao.execute("INSERT INTO tbl_usuario (NM_Nome, DS_Email, DS_Senha_Hash, TP_Perfil, NM_Instituicao, DT_Criacao) VALUES (?, ?, ?, ?, ?, ?)",
                        (ADMIN[0], ADMIN[1], hash_senha(SENHA_DEMO), ADMIN[2], ADMIN[3], agora))
        conexao.execute("INSERT INTO tbl_migracao VALUES (3, ?)", (agora[:16],))
        conexao.execute("COMMIT")
    except sqlite3.Error as erro:
        conexao.execute("ROLLBACK")
        sys.stderr.write("Migração 003 falhou e foi desfeita: " + str(erro) + "\n")
        return 1
    print("Migração 003 aplicada: conta " + ADMIN[1] + " criada.")
    return 0


def descer(caminho):
    conexao = sqlite3.connect(caminho, isolation_level=None)
    if not versao_aplicada(conexao):
        print("Migração 003 não está aplicada.")
        return 0
    conexao.execute("BEGIN IMMEDIATE")
    try:
        conexao.execute("DELETE FROM tbl_sessao WHERE ID_Usuario IN (SELECT ID_Usuario FROM tbl_usuario WHERE DS_Email = ?)", (ADMIN[1],))
        conexao.execute("DELETE FROM tbl_usuario WHERE DS_Email = ?", (ADMIN[1],))
        conexao.execute("DELETE FROM tbl_migracao WHERE VERSAO = 3")
        conexao.execute("COMMIT")
    except sqlite3.Error as erro:
        conexao.execute("ROLLBACK")
        sys.stderr.write("Reversão 003 falhou e foi desfeita: " + str(erro) + "\n")
        return 1
    print("Migração 003 desfeita.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("up", "down"):
        print("Uso: python migrar_003.py up|down caminho/do/banco.db")
        sys.exit(2)
    if sys.argv[1] == "up":
        sys.exit(subir(sys.argv[2]))
    sys.exit(descer(sys.argv[2]))

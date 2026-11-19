# Migração 004: perfil "governo" (envio de socorro P2) e nova senha da conta de administrador.
# - recria tbl_usuario com o perfil governo no CHECK (SQLite não altera CHECK de tabela existente);
# - cria a conta de demonstração do governo (Defesa Civil fictícia);
# - troca a senha de admin@sadec.demo.
# Uso: python migrar_004.py up|down caminho/do/banco.db  (faz backup antes; roda em transação)
import os
import shutil
import sqlite3
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from migrar_002 import hash_senha, SENHA_DEMO  # noqa: E402  mesmo formato de senha e senha de demonstração

SENHA_ADMIN = "121365"
GOVERNO = ("Defesa Civil Municipal (demonstração)", "governo@sadec.demo", "governo", "Defesa Civil Municipal (fictícia)")
COLUNAS = "ID_Usuario, NM_Nome, DS_Email, DS_Senha_Hash, TP_Perfil, NM_Instituicao, DT_Criacao"


def recriar_usuarios(conexao, perfis):
    # Copia as contas para uma tabela nova com o CHECK atualizado e troca o nome;
    # as chaves estrangeiras de tbl_sessao e tbl_codigo_orgao apontam pelo nome tbl_usuario.
    conexao.execute("""CREATE TABLE tbl_usuario_nova (
        ID_Usuario      INTEGER PRIMARY KEY,
        NM_Nome         TEXT NOT NULL,
        DS_Email        TEXT NOT NULL UNIQUE,
        DS_Senha_Hash   TEXT NOT NULL,
        TP_Perfil       TEXT NOT NULL CHECK (TP_Perfil IN (""" + ", ".join("'" + p + "'" for p in perfis) + """)),
        NM_Instituicao  TEXT,
        DT_Criacao      TEXT NOT NULL)""")
    conexao.execute("INSERT INTO tbl_usuario_nova (" + COLUNAS + ") SELECT " + COLUNAS + " FROM tbl_usuario")
    conexao.execute("DROP TABLE tbl_usuario")
    conexao.execute("ALTER TABLE tbl_usuario_nova RENAME TO tbl_usuario")


def versao_aplicada(conexao):
    return conexao.execute("SELECT count(*) FROM tbl_migracao WHERE VERSAO = 4").fetchone()[0] > 0


def em_transacao(conexao, passos, rotulo):
    conexao.execute("PRAGMA foreign_keys = OFF")
    conexao.execute("BEGIN IMMEDIATE")
    try:
        passos(conexao)
        conexao.execute("COMMIT")
        return True
    except sqlite3.Error as erro:
        conexao.execute("ROLLBACK")
        sys.stderr.write(rotulo + " falhou e foi desfeita: " + str(erro) + "\n")
        return False


def subir(caminho):
    conexao = sqlite3.connect(caminho, isolation_level=None)
    if versao_aplicada(conexao):
        print("Banco já está na versão 4.")
        return 0
    pasta = os.path.join(os.path.dirname(os.path.abspath(caminho)), "backups")
    os.makedirs(pasta, exist_ok=True)
    shutil.copyfile(caminho, os.path.join(pasta, "antes_migracao_004_" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".db"))
    agora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def passos(c):
        recriar_usuarios(c, ["cliente", "unidade_saude", "governo", "operador"])
        c.execute("INSERT INTO tbl_usuario (NM_Nome, DS_Email, DS_Senha_Hash, TP_Perfil, NM_Instituicao, DT_Criacao) VALUES (?, ?, ?, ?, ?, ?)",
                  (GOVERNO[0], GOVERNO[1], hash_senha(SENHA_DEMO), GOVERNO[2], GOVERNO[3], agora))
        c.execute("UPDATE tbl_usuario SET DS_Senha_Hash = ? WHERE DS_Email = 'admin@sadec.demo'", (hash_senha(SENHA_ADMIN),))
        c.execute("DELETE FROM tbl_sessao WHERE ID_Usuario IN (SELECT ID_Usuario FROM tbl_usuario WHERE DS_Email = 'admin@sadec.demo')")
        c.execute("INSERT INTO tbl_migracao VALUES (4, ?)", (agora[:16],))

    if not em_transacao(conexao, passos, "Migração 004"):
        return 1
    print("Migração 004 aplicada: perfil governo, conta " + GOVERNO[1] + " e nova senha do administrador.")
    return 0


def descer(caminho):
    conexao = sqlite3.connect(caminho, isolation_level=None)
    if not versao_aplicada(conexao):
        print("Migração 004 não está aplicada.")
        return 0

    def passos(c):
        c.execute("DELETE FROM tbl_sessao WHERE ID_Usuario IN (SELECT ID_Usuario FROM tbl_usuario WHERE TP_Perfil = 'governo')")
        c.execute("DELETE FROM tbl_usuario WHERE TP_Perfil = 'governo'")
        recriar_usuarios(c, ["cliente", "unidade_saude", "operador"])
        c.execute("UPDATE tbl_usuario SET DS_Senha_Hash = ? WHERE DS_Email = 'admin@sadec.demo'", (hash_senha(SENHA_DEMO),))
        c.execute("DELETE FROM tbl_migracao WHERE VERSAO = 4")

    if not em_transacao(conexao, passos, "Reversão 004"):
        return 1
    print("Migração 004 desfeita.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("up", "down"):
        print("Uso: python migrar_004.py up|down caminho/do/banco.db")
        sys.exit(2)
    if sys.argv[1] == "up":
        sys.exit(subir(sys.argv[2]))
    sys.exit(descer(sys.argv[2]))

"""
SADEC - Global Solution 2026/2 (FIAP)
Computational Thinking Using Python - 1TDSPB

Sistema de console da rede de drones SADEC.
"""

# math: usado para calcular a distância entre dois hospitais (math.sqrt)
import math

# datetime: usado para pegar a data e a hora do computador no momento do pedido
from datetime import datetime


# 1. FUNÇÕES DE VALIDAÇÃO (retornam True ou False)

def somente_numeros(texto):
    # Retorna apenas os números do texto (ex.: "01310-100" -> "01310100")
    numeros = ""
    for caractere in texto:
        if caractere in "0123456789":
            numeros += caractere
    return numeros


def contem_somente(texto, permitidos):
    # Retorna True se todos os caracteres do texto estiverem em "permitidos"
    for caractere in texto:
        if not (caractere in permitidos):
            return False
    return True


def cep_valido(cep):
    # CEP com 8 números (o traço é aceito)
    if not contem_somente(cep, "0123456789-"):
        return False
    return len(somente_numeros(cep)) == 8


def numero_decimal_valido(texto):
    # Número com no máximo uma vírgula ou um ponto (ex.: "2", "2,5" ou "2.5")
    if not contem_somente(texto, "0123456789.,"):
        return False
    quantidade_separadores = 0
    for caractere in texto:
        if caractere == "." or caractere == ",":
            quantidade_separadores += 1
    # precisa ter pelo menos um número (sozinho, "," ou "." não é um número)
    return quantidade_separadores <= 1 and len(somente_numeros(texto)) > 0


def codigo_recebimento_valido(codigo):
    # Código de recebimento com exatamente 4 números (ex.: "4821")
    return len(codigo) == 4 and contem_somente(codigo, "0123456789")


def email_valido(email):
    # Email com um único @, sem espaços e com ponto depois do @
    quantidade_arroba = 0
    tem_ponto_depois_arroba = False
    for caractere in email:
        if caractere == "@":
            quantidade_arroba += 1
        elif caractere == "." and quantidade_arroba == 1:
            tem_ponto_depois_arroba = True
    if quantidade_arroba != 1 or not tem_ponto_depois_arroba:
        return False
    return not (" " in email) and not ("@." in email) and email[0] != "@" and email[-1] != "."


# 2. FUNÇÕES DE FORMATAÇÃO

def formatar_cep(cep):
    # Retorna o CEP no padrão 00000-000
    numeros = somente_numeros(cep)
    cep_formatado = ""
    for i in range(8):
        cep_formatado += numeros[i]
        if i == 4:
            cep_formatado += "-"
    return cep_formatado


def trocar_caractere(texto, antigo, novo):
    # Retorna o texto trocando todo caractere "antigo" pelo "novo"
    # Ex.: trocar_caractere("2,5", ",", ".") -> "2.5"
    resultado = ""
    for caractere in texto:
        if caractere == antigo:
            resultado += novo
        else:
            resultado += caractere
    return resultado


def texto_para_busca(texto):
    # Retorna o texto em minúsculas e sem acentos, para a busca não depender disso.
    # Ex.: "São Luiz" -> "sao luiz" (assim quem digitar "sao" ou "São" encontra o mesmo hospital)
    com_acento = "áàâãéêíóôõúüç"
    sem_acento = "aaaaeeiooouuc"
    resultado = ""
    for caractere in texto.lower():
        trocado = caractere
        for i in range(len(com_acento)):
            if caractere == com_acento[i]:
                trocado = sem_acento[i]
        resultado += trocado
    return resultado


def formatar_decimal(numero):
    # Retorna o número com 2 casas decimais e vírgula, no padrão brasileiro (ex.: 2.5 -> "2,50")
    return trocar_caractere(f"{numero:.2f}", ".", ",")


def formatar_peso(peso):
    # Retorna o peso em kg (ex.: 2.5 -> "2,50 kg").
    # Peso 0 quer dizer que o peso não foi perguntado (transporte de órgão).
    if peso == 0:
        return "Não informado"
    return f"{formatar_decimal(peso)} kg"


def formatar_prioridade(prioridade):
    # Retorna o nível da fila de prioridade com o nome (ex.: 1 -> "1 - Órgãos")
    niveis = ["Órgãos", "Emergência", "Saúde", "Comercial"]
    return f"{prioridade} - {niveis[prioridade - 1]}"


def formatar_endereco(endereco):
    # Recebe [cep, logradouro, número, complemento, bairro, cidade, estado]
    # e retorna o endereço em uma linha só.
    # Ex.: "Av. Paulista, 1000 - Apto 12 - Bela Vista, São Paulo/SP - CEP 01310-100"
    texto = f"{endereco[1]}, {endereco[2]}"
    if endereco[3] != "":                       # o complemento só aparece se foi informado
        texto += f" - {endereco[3]}"
    texto += f" - {endereco[4]}, {endereco[5]}/{endereco[6]} - CEP {endereco[0]}"
    return texto


# 3. FUNÇÕES DE ENTRADA DE DADOS
# Repetem a pergunta até o valor ser válido.
# Se o usuário digitar 0, retornam "0" (voltar / cancelar).

def ler_email(mensagem):
    # Retorna o email em letras minúsculas
    while True:
        email = input(mensagem).lower()
        if email == "0" or email_valido(email):
            return email
        print("Email inválido. Use o formato nome@dominio.com, sem espaços.")


def ler_senha(mensagem):
    # Senha com pelo menos 6 caracteres e sem espaços
    while True:
        senha = input(mensagem)
        if senha == "0" or (len(senha) >= 6 and not (" " in senha)):
            return senha
        print("Senha inválida. Use pelo menos 6 caracteres, sem espaços.")


def ler_texto(mensagem):
    # Campo de texto obrigatório com pelo menos 3 caracteres
    while True:
        texto = input(mensagem)
        if texto == "0" or len(texto) >= 3:
            return texto
        print("Campo obrigatório. Digite pelo menos 3 caracteres.")


def ler_cep(mensagem):
    # Retorna o CEP já formatado (00000-000)
    while True:
        cep = input(mensagem)
        if cep == "0":
            return cep
        if cep_valido(cep):
            return formatar_cep(cep)
        print("CEP inválido. Informe os 8 números do CEP (ex.: 01310-100).")


def ler_numero_endereco(mensagem):
    # Número do endereço: apenas números
    while True:
        numero = input(mensagem)
        if numero == "0":
            return numero
        if len(numero) > 0 and contem_somente(numero, "0123456789"):
            return numero
        print("Número inválido. Insira um número.")


def ler_estado(mensagem):
    # Estado informado pela sigla (UF) com 2 letras. Retorna em letras maiúsculas.
    siglas = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
              "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]
    while True:
        estado = input(mensagem).upper()
        if estado == "0" or estado in siglas:
            return estado
        print("Estado inválido. Informe a sigla do estado com 2 letras (ex.: SP).")


def ler_peso(mensagem):
    # Peso em kg, aceitando vírgula ou ponto (ex.: 2,5).
    # Retorna o peso como número decimal (float), ou 0 se o usuário cancelar.
    while True:
        texto = input(mensagem)
        if texto == "0":
            return 0
        if numero_decimal_valido(texto):
            peso = float(trocar_caractere(texto, ",", "."))    # o float() só aceita ponto
            if peso > 0:
                return peso
        print("Peso inválido. Informe o peso em kg usando números maiores que zero (ex.: 2 ou 2,5).")


def ler_codigo_recebimento(mensagem):
    # Código de 4 números que quem fez o requerimento cria para receber o pedido.
    # Quem for receber a entrega vai precisar informar este código (registro de custódia).
    print("\nQuem for receber o pedido vai precisar informar este código na entrega.")
    while True:
        codigo = input(mensagem)
        if codigo == "0" or codigo_recebimento_valido(codigo):
            return codigo
        print("Código inválido. O código deve ter exatamente 4 números (ex.: 4821).")


def ler_sim_nao(mensagem):
    # Faz uma pergunta de sim/não. Retorna "s" (sim), "n" (não) ou "0" (voltar)
    respostas_sim = ["s", "sim", "si", "sin", "sum", "ss", "y", "yes"]
    respostas_nao = ["n", "nao", "não", "mao", "mão", "no"]
    while True:
        resposta = input(f"{mensagem} (s/n): ").lower()
        if resposta == "0":
            return "0"
        if resposta in respostas_sim:
            return "s"
        if resposta in respostas_nao:
            return "n"
        print('Informe uma opção válida: "s" para sim ou "n" para não.')


def esperar_voltar():
    # Usada quando a tela não tem nenhuma opção: espera o usuário digitar 0 para voltar
    while True:
        opcao = input("\nDigite 0 para voltar: ")
        if opcao == "0":
            return
        print("Opção inválida. Digite 0 para voltar.")


def escolher_numero(mensagem, quantidade):
    # Lê um número de 0 até "quantidade" e retorna como inteiro (0 = voltar)
    opcoes_validas = []
    for i in range(quantidade + 1):
        opcoes_validas.append(f"{i}")
    while True:
        escolha = input(mensagem)
        if escolha in opcoes_validas:
            return int(escolha)
        print(f"Opção inválida. Digite um número de 0 a {quantidade}.")


def escolher_da_lista(pergunta, opcoes, mensagem):
    # Mostra a pergunta e as opções numeradas e lê a escolha com a "mensagem"
    # (ex.: "Opção (0 para cancelar): " em formulários ou "Opção (0 para voltar): " em menus).
    # Retorna o texto da opção escolhida, ou "0" se o usuário digitar 0.
    print(f"\n{pergunta}")
    for i in range(len(opcoes)):
        print(f"{i + 1}. {opcoes[i]}")
    opcao = escolher_numero(mensagem, len(opcoes))
    if opcao == 0:
        return "0"
    return opcoes[opcao - 1]


# 4. FUNÇÕES DE FORMULÁRIO
# Retornam as respostas, ou "0" / lista vazia [] se o usuário
# digitar 0 em algum campo (requerimento cancelado).
#
# Os três requerimentos (drone, órgão e desastre) retornam a lista do pedido
# sempre nesta ordem:
# [uso, prioridade, peso, endereço de entrega, endereço de retirada, código de recebimento, drone]

def ler_uso_drone():
    # Pergunta para que o drone será usado. Retorna o uso, ou "0" se o usuário voltar.
    # A prioridade de cada uso é decidida pela função prioridade_do_uso.
    uso = escolher_da_lista("Qual o uso do drone?",
                            ["Entrega de comida", "Entrega de encomenda", "Entrega de remédios", "Outro"],
                            "Opção (0 para cancelar): ")
    if uso == "Outro":
        uso = ler_texto("Informe o uso do drone: ")
    return uso


def ler_endereco(titulo):
    # Usada para o endereço de entrega e para o de retirada (mesmas perguntas).
    # Retorna [cep, logradouro, número, complemento, bairro, cidade, estado].
    print(f"\n---------- {titulo} ----------")
    cep = ler_cep("Insira o CEP: ")
    if cep == "0":
        return []
    logradouro = ler_texto("Insira o logradouro (rua, avenida...): ")
    if logradouro == "0":
        return []
    numero = ler_numero_endereco("Insira o número: ")
    if numero == "0":
        return []
    complemento = input("Insira o complemento (aperte Enter se não houver): ")
    if complemento == "0":
        return []
    bairro = ler_texto("Insira o bairro: ")
    if bairro == "0":
        return []
    cidade = ler_texto("Insira a cidade: ")
    if cidade == "0":
        return []
    estado = ler_estado("Insira o estado (sigla, ex.: SP): ")
    if estado == "0":
        return []
    return [cep, logradouro, numero, complemento, bairro, cidade, estado]


def ler_requerimento_drone():
    # Formulário do Requerimento de drone (prioridade 3 = Saúde ou 4 = Comercial).
    # Retorna a lista do pedido, ou [] se o usuário cancelar.
    print("\n---------- Requerimento de drone ----------")
    print("(se digitar 0 em qualquer campo, o requerimento será cancelado)")
    uso = ler_uso_drone()
    if uso == "0":
        return []
    peso = ler_peso("\nInsira o peso aproximado da carga em kg: ")
    if peso == 0:
        return []
    entrega = ler_endereco("Endereço de entrega")
    if len(entrega) == 0:
        return []
    retirada = ler_endereco("Endereço de retirada")
    if len(retirada) == 0:
        return []
    codigo = ler_codigo_recebimento("Crie um código de 4 números para receber o pedido: ")
    if codigo == "0":
        return []
    return [uso, prioridade_do_uso(uso), peso,
            formatar_endereco(entrega), formatar_endereco(retirada), codigo, "A definir"]


def ler_transporte_orgao(redes, unidades, latitudes, longitudes, drones, baterias, autonomia_km):
    # Formulário do Transporte de órgão para transplante (prioridade 1).
    # Os hospitais são escolhidos com escolher_hospital (rede -> unidade).
    # Também escolhe o drone: ele precisa ter bateria para a rota + 30% de folga.
    # Retorna a lista do pedido, ou [] se o usuário cancelar ou se nenhum drone tiver bateria suficiente.
    print("\n---------- Transporte de órgão para transplante ----------")
    print("(se digitar 0 em qualquer campo, o requerimento será cancelado)")
    orgao = escolher_da_lista("Qual órgão será transportado?",
                              ["Coração", "Pulmão", "Fígado", "Rim", "Pâncreas", "Córneas"],
                              "Opção (0 para cancelar): ")
    if orgao == "0":
        return []
    posicao_origem = escolher_hospital("Hospital de origem (onde o órgão será retirado):", redes, unidades)
    if posicao_origem == -1:
        return []
    print(f"Origem: {unidades[posicao_origem]}")
    posicao_destino = escolher_hospital("Hospital de destino (onde o órgão será entregue):", redes, unidades)
    while posicao_destino == posicao_origem:
        print("O hospital de destino precisa ser diferente do hospital de origem.")
        posicao_destino = escolher_hospital("Hospital de destino (onde o órgão será entregue):", redes, unidades)
    if posicao_destino == -1:
        return []
    print(f"Destino: {unidades[posicao_destino]}")

    # Verificação de bateria: distância da rota -> bateria necessária -> drone que consegue fazer a rota
    distancia = calcular_distancia(latitudes[posicao_origem], longitudes[posicao_origem],
                                   latitudes[posicao_destino], longitudes[posicao_destino])
    bateria_necessaria = calcular_bateria_necessaria(distancia, autonomia_km)
    print(f"\nDistância da rota: {formatar_decimal(distancia)} km")
    print(f"Bateria necessária (ida e volta + 30% de folga): {formatar_decimal(bateria_necessaria)}%")

    posicao_drone = escolher_drone(baterias, bateria_necessaria)
    if posicao_drone == -1:
        print("Nenhum drone tem bateria suficiente para esta rota.")
        print("É necessário usar outro meio de transporte (ex.: ambulância ou helicóptero).")
        return []
    print(f"Drone escolhido: {drones[posicao_drone]} (bateria em {baterias[posicao_drone]}%)")

    codigo = ler_codigo_recebimento("Crie um código de 4 números para receber o pedido: ")
    if codigo == "0":
        return []
    # Peso 0 = não perguntado (o órgão vai em uma caixa térmica padrão).
    # Entrega = hospital de destino; retirada = hospital de origem.
    return [f"Transporte de órgão: {orgao}", 1, 0, unidades[posicao_destino], unidades[posicao_origem],
            codigo, drones[posicao_drone]]


def ler_ajuda_desastre():
    # Formulário da Ajuda em desastre - enchente ou deslizamento (prioridade 2).
    # Retorna a lista do pedido, ou [] se o usuário cancelar.
    print("\n---------- Ajuda em desastre ----------")
    print("(se digitar 0 em qualquer campo, o requerimento será cancelado)")
    desastre = escolher_da_lista("Qual o tipo de desastre?", ["Enchente", "Deslizamento"],
                                 "Opção (0 para cancelar): ")
    if desastre == "0":
        return []
    ajuda = escolher_da_lista("Qual o tipo de ajuda?",
                              ["Água potável", "Alimentos", "Remédios e primeiros socorros", "Outro"],
                              "Opção (0 para cancelar): ")
    if ajuda == "Outro":
        ajuda = ler_texto("Informe o tipo de ajuda: ")
    if ajuda == "0":
        return []
    peso = ler_peso("\nInsira o peso aproximado da carga em kg: ")
    if peso == 0:
        return []
    entrega = ler_endereco("Endereço do local afetado (entrega)")
    if len(entrega) == 0:
        return []
    retirada = ler_endereco("Endereço de retirada da ajuda")
    if len(retirada) == 0:
        return []
    codigo = ler_codigo_recebimento("Crie um código de 4 números para receber o pedido: ")
    if codigo == "0":
        return []
    return [f"Ajuda em desastre ({desastre}): {ajuda}", 2, peso,
            formatar_endereco(entrega), formatar_endereco(retirada), codigo, "A definir"]


# 5. FUNÇÕES DE CÁLCULO

def prioridade_do_uso(uso):
    # Nível da fila de prioridade de um Requerimento de drone:
    # entrega de remédios = 3 (Saúde); comida, encomenda e outros usos = 4 (Comercial)
    if uso == "Entrega de remédios":
        return 3
    return 4


def calcular_distancia(latitude1, longitude1, latitude2, longitude2):
    # Distância em linha reta (o drone voa em linha reta) entre dois pontos, em km.
    # As posições estão em graus (latitude e longitude do CNES). Na cidade de São Paulo:
    # 1 grau de latitude (norte/sul) = cerca de 110,8 km e 1 grau de longitude (leste/oeste) = cerca de 102 km.
    km_por_grau_latitude = 110.8
    km_por_grau_longitude = 102.0
    distancia_norte_sul = (latitude2 - latitude1) * km_por_grau_latitude
    distancia_leste_oeste = (longitude2 - longitude1) * km_por_grau_longitude
    # Teorema de Pitágoras: raiz quadrada de (diferença leste/oeste)² + (diferença norte/sul)²
    return math.sqrt(distancia_leste_oeste ** 2 + distancia_norte_sul ** 2)


def calcular_bateria_necessaria(distancia, autonomia_km):
    # Retorna quantos % de bateria o drone precisa para voar a distância,
    # Padrão para todas as entregas: o drone vai e volta à base (distância x 2), com 30% de folga.
    bateria_da_rota = distancia * 2 / autonomia_km * 100
    return bateria_da_rota * 1.3


def escolher_drone(baterias, bateria_necessaria):
    # Retorna a posição do drone com a MENOR bateria que ainda é suficiente para a rota.
    # Assim os drones mais carregados ficam livres para rotas mais longas.
    # Retorna -1 se nenhum drone tiver bateria suficiente.
    posicao_escolhida = -1
    for i in range(len(baterias)):
        if baterias[i] >= bateria_necessaria:
            if posicao_escolhida == -1 or baterias[i] < baterias[posicao_escolhida]:
                posicao_escolhida = i
    return posicao_escolhida


# 6. FUNÇÕES DE MENU, PESQUISA E EXIBIÇÃO

def exibir_menu(titulo, opcoes):
    # Mostra as opções numeradas e retorna a opção escolhida ("1", "2", ...)
    print(f"\n========== {titulo} ==========\n")
    opcoes_validas = []
    for i in range(len(opcoes)):
        print(f"{i + 1}. {opcoes[i]}")
        opcoes_validas.append(f"{i + 1}")
    while True:
        opcao = input("\nInsira a opção desejada: ")
        if opcao in opcoes_validas:
            return opcao
        print(f"Opção inválida. Digite um número de 1 a {len(opcoes)}.")


def exibir_dados(titulo, rotulos, valores):
    # Mostra cada informação com o seu rótulo (rotulos[i]: valores[i])
    print(f"\n---------- {titulo} ----------")
    for i in range(len(rotulos)):
        print(f"{rotulos[i]}: {valores[i]}")
    print("----------------------------------------")


def buscar_posicao(lista, valor):
    # Retorna a posição (índice) do valor na lista, ou -1 se ele não estiver na lista
    for i in range(len(lista)):
        if lista[i] == valor:
            return i
    return -1


def buscar_todas_posicoes(lista, valor):
    # Retorna todas as posições (índices) em que o valor aparece na lista.
    # Ex.: posições dos pedidos de um email ou das unidades de uma rede de hospitais.
    posicoes = []
    for i in range(len(lista)):
        if lista[i] == valor:
            posicoes.append(i)
    return posicoes


def buscar_redes(termo, redes, unidades):
    # Retorna as redes (cada uma uma vez só) em que o termo aparece no nome da rede
    # ou no nome/endereço de alguma unidade dela (assim dá para buscar pelo bairro também).
    # Se o termo for vazio (Enter), retorna todas, porque "" aparece dentro de qualquer texto.
    termo_busca = texto_para_busca(termo)
    encontradas = []
    for i in range(len(redes)):
        if termo_busca in texto_para_busca(redes[i]) or termo_busca in texto_para_busca(unidades[i]):
            if not (redes[i] in encontradas):
                encontradas.append(redes[i])
    return encontradas


def status_dos_pedidos(posicoes, status):
    # Retorna uma lista só com os status dos pedidos das posições informadas
    # (usada no Perfil para contar com .count() quantos estão confirmados, cancelados...)
    status_encontrados = []
    for posicao in posicoes:
        status_encontrados.append(status[posicao])
    return status_encontrados


def resumos_pedidos(posicoes, ids, usos, datas_horas, status):
    # Retorna uma lista de textos, um para cada pedido das posições informadas.
    # Ex.: "ID 1001 | Entrega de comida | 12/11/2026 14:30 | Confirmado"
    resumos = []
    for posicao in posicoes:
        resumos.append(f"ID {ids[posicao]} | {usos[posicao]} | {datas_horas[posicao]} | {status[posicao]}")
    return resumos


def escolher_posicao(posicoes, resumos, titulo, mensagem):
    # Mostra os resumos numerados e pede para escolher um.
    # Retorna a posição (índice) escolhida nas listas, ou -1 se o usuário digitar 0.
    print(f"\n========== {titulo} ==========\n")
    for i in range(len(resumos)):
        print(f"{i + 1}. {resumos[i]}")
    escolha = escolher_numero(mensagem, len(posicoes))
    if escolha == 0:
        return -1
    return posicoes[escolha - 1]


def escolher_hospital(pergunta, redes, unidades):
    # Escolha de um hospital em 3 passos:
    # 1. busca: a pessoa digita parte do nome ou do bairro (Enter mostra todos; 0 cancela)
    # 2. menu com os hospitais/redes encontrados (0 volta para a busca)
    # 3. se a rede escolhida tiver 2 ou mais unidades, menu com as unidades (0 volta para o passo 2)
    # Retorna a posição (índice) do hospital escolhido nas listas, ou -1 se o usuário cancelar.
    while True:
        print(f"\n{pergunta}")
        termo = input("Digite parte do nome ou do bairro do hospital (Enter para ver todos, 0 para cancelar): ")
        if termo == "0":
            return -1
        redes_encontradas = buscar_redes(termo, redes, unidades)
        if len(redes_encontradas) == 0:
            print("Nenhum hospital encontrado. Tente outro nome ou bairro.")
        else:
            posicao = escolher_rede_e_unidade(redes_encontradas, redes, unidades)
            if posicao != -1:
                return posicao


def escolher_rede_e_unidade(redes_do_menu, redes, unidades):
    # Menu com os hospitais/redes encontrados na busca (ex.: "Hospital Israelita Albert Einstein (2 unidades)").
    # Se a rede escolhida tiver 2 ou mais unidades, abre outro menu com todas as unidades dela;
    # nesse menu de unidades, o 0 volta para a lista de hospitais.
    # Retorna a posição (índice) do hospital escolhido nas listas, ou -1 se o usuário digitar 0 (nova busca).
    opcoes = []
    for rede in redes_do_menu:
        quantidade_unidades = redes.count(rede)
        if quantidade_unidades > 1:
            opcoes.append(f"{rede} ({quantidade_unidades} unidades)")
        else:
            opcoes.append(rede)

    while True:
        print(f"\nHospitais encontrados ({len(opcoes)}):")
        for i in range(len(opcoes)):
            print(f"{i + 1}. {opcoes[i]}")
        escolha = escolher_numero("Opção (0 para nova busca): ", len(opcoes))
        if escolha == 0:
            return -1

        rede_escolhida = redes_do_menu[escolha - 1]
        posicoes = buscar_todas_posicoes(redes, rede_escolhida)
        if len(posicoes) == 1:
            return posicoes[0]

        # Rede com várias unidades: mostra o endereço de cada uma
        resumos = []
        for posicao in posicoes:
            resumos.append(unidades[posicao])
        posicao_escolhida = escolher_posicao(posicoes, resumos, f"Unidades - {rede_escolhida}",
                                             "Opção (0 para voltar): ")
        if posicao_escolhida != -1:
            return posicao_escolhida


def realizar_login():
    # Pede email e senha do usuário.
    # Retorna o email de quem entrou (para saber de quem são os pedidos), ou "0" se voltou.
    print("\n---------- Login ----------")
    print("(digite 0 para voltar)")
    email = ler_email("\nInsira o seu endereço de email para login: ")
    if email == "0":
        return "0"
    senha = ler_senha("Insira a sua senha para login: ")
    if senha == "0":
        return "0"
    print(f"\nLogin realizado com sucesso. Bem-vindo(a), {email}!")
    return email


def verificar_senha_emergencia(senha_correta):
    # Pede a senha do acesso de emergência até ela estar correta.
    # Retorna True se a senha estiver correta ou False se o usuário digitar 0 (voltar).
    print("\n---------- Acesso de emergência ----------")
    print("(digite 0 para voltar)")
    while True:
        senha = input("\nInsira a senha de acesso de emergência: ")
        if senha == "0":
            return False
        if senha == senha_correta:
            print("\nAcesso de emergência liberado.")
            return True
        print("Senha incorreta. Tente novamente.")


# 7. PROGRAMA PRINCIPAL

# Senha do acesso de emergência.
# O sistema ainda não consegue verificar se o usuário logado é alguém autorizado
# a pedir emergências (hospital, Central de Transplantes, Defesa Civil).
# Por isso, o Requerimento de emergência é protegido por esta senha.
senha_emergencia = "244466666"

# ---------- HOSPITAIS (dados oficiais do CNES) ----------
# Fonte: CNES - Cadastro Nacional de Estabelecimentos de Saúde, pela API de dados abertos
# do Ministério da Saúde (apidadosabertos.saude.gov.br), baixado em 13/11/2026.
# Entraram os hospitais gerais e especializados da cidade de São Paulo que têm centro cirúrgico
# (o órgão é retirado e implantado em cirurgia). Nomes e endereços estão escritos como no CNES (sem acentos).
# Ficaram de fora 5 hospitais cuja posição cadastrada no CNES cai fora da cidade (erro do cadastro).
#
# Listas paralelas (a mesma posição é o mesmo hospital):
# - lista_hospital_rede: nome que aparece no 1º menu. Unidades da mesma rede (ex.: Einstein) têm a mesma rede.
# - lista_hospital_unidade: nome e endereço da unidade (aparece no 2º menu e no pedido).
# - lista_hospital_latitude / lista_hospital_longitude: posição do hospital em graus, como está no CNES.
lista_hospital_rede = [
    "A.C.Camargo Cancer Center",
    "A.C.Camargo Cancer Center",
    "A.C.Camargo Cancer Center",
    "Acalanto Clinica Multidisciplinar",
    "Assoc AACD V Clementino",
    "Associacao Hospitalar Platinum",
    "Associacao Nossa Senhora do Pari",
    "Benvista Oftalmologia",
    "BP - Beneficência Portuguesa",
    "BP - Beneficência Portuguesa",
    "Carvalho Sandrin Servicos Hospitalares",
    "CEMA",
    "CEMA",
    "Centro de Referencia da Saude da Mulher",
    "Centro de Referencia e Treinamento DST AIDS",
    "Centro Hospitalar do Sistema Penitenciario",
    "Centro Medico PMESP",
    "Clínica Premium Care",
    "Conjunto Hospitalar do Mandaqui",
    "Eye Clinic Ibirapuera",
    "Healthcare Hospital de Transicao",
    "Hosp 9 de Julho",
    "Hosp da Aeronautica de SPHASP",
    "Hosp da Sta Casa de Sto Amaro",
    "Hosp de Clinicas J Helena",
    "Hosp do Serv Pub Municipal HSPM",
    "Hosp Dom Alvarenga",
    "Hosp e Mat Sto Expedito",
    "Hosp Edmundo Vasconcelos",
    "Hosp Independencia",
    "Hosp Mat 8 de Maio",
    "Hosp Monumento CEHM",
    "Hosp Mun Capela do Socorro",
    "Hosp Mun Carmen Prudente",
    "Hosp Mun Dr Carmino Caricchio",
    "Hosp Mun Fernando Mauro Pires da Rocha",
    "Hosp Mun Gilson de Cassia Marques de Carvalho",
    "Hosp Mun Ignacio Proenca de Gouvea",
    "Hosp Mun Infantil Menino Jesus",
    "Hosp Mun Jabaquara Artur Ribeiro de Saboya",
    "Hosp Mun Josanias Castanha Braga",
    "Hosp Mun M Boi Mirim",
    "Hosp Mun Mat Esc Dr Mario de Moraes A Silva",
    "Hosp Mun Maternidade Professor Mario Degni",
    "Hosp Mun Pirituba Jose Soares Hungria",
    "Hosp Mun Prof Dr Waldomiro de Paula",
    "Hosp Mun Professor Doutor Alipio Correa Netto",
    "Hosp Mun Tide Setubal",
    "Hosp Mun V Nhocune Alexandre Zaio",
    "Hosp Mun Ver Jose Storopolli",
    "Hosp Ps Nova Iguatemi",
    "Hosp Sta Rita",
    "Hosp Sta Virginia",
    "Hospital Adventista de Sao Paulo",
    "Hospital Albert Sabin",
    "Hospital Alvorada Moema",
    "Hospital Amparo Maternal",
    "Hospital BDW",
    "Hospital Bosque da Saude",
    "Hospital Central do Tatuape",
    "Hospital Central Leste",
    "Hospital Central Sul",
    "Hospital da Crianca",
    "Hospital das Clínicas da FMUSP",
    "Hospital das Clínicas da FMUSP",
    "Hospital das Clínicas da FMUSP",
    "Hospital de Olhos de Sao Paulo Unidade Norte",
    "Hospital de Transp do Est de SP Euryclides de Jesus Zerbini",
    "Hospital do Coracao",
    "Hospital do Rim e Hipertensao",
    "Hospital do Serv Pub Est Fco Morato de Oliveira",
    "Hospital e Maternidade Jardins LTDA",
    "Hospital e Maternidade Leonor Mendes de Barros",
    "Hospital e Maternidade Metropolitano",
    "Hospital e Maternidade Salvalus",
    "Hospital e Maternidade Santa Maria Cruz Azul",
    "Hospital e Maternidade Sao Cristovao",
    "Hospital e Maternidade Sao Rafael",
    "Hospital e Pronto Socorro Portinari",
    "Hospital Esporte e Saude BR Surgery",
    "Hospital Estadual de Sapopemba",
    "Hospital Geral de Pedreira",
    "Hospital Geral de Sao Mateus",
    "Hospital Geral de Vila Penteado Dr Jose Pangella",
    "Hospital Geral do Grajau Prof Liber John Alphonse Di Dio",
    "Hospital Geral Henrique Altimeyer de Vila Alpina",
    "Hospital Geral Jesus Teixeira da Costa Guaianases",
    "Hospital GRAACC Instituto de Oncologia Pediatrica IOP",
    "Hospital Green Hill",
    "Hospital Heliopolis Unidade de Gestao Assistencial I",
    "Hospital Indianopolis",
    "Hospital Infantil Candido Fontoura",
    "Hospital Infantil Darcy Vargas UGA III",
    "Hospital Infantil Sabará",
    "Hospital Israelita Albert Einstein",
    "Hospital Israelita Albert Einstein",
    "Hospital Itaquera",
    "Hospital Japones Santa Cruz",
    "Hospital Katia de Souza Rodrigues Taipassp",
    "Hospital Leforte",
    "Hospital Leforte",
    "Hospital Luz",
    "Hospital Maternidade Interlagos",
    "Hospital Militar de Area de Sao Paulo",
    "Hospital Montemagno",
    "Hospital Moriah",
    "Hospital Municipal Brasilandia",
    "Hospital Municipal Dr Benedito Montenegro",
    "Hospital Nipo Brasileiro",
    "Hospital Nossa Senhora do Rosario",
    "Hospital Paulista",
    "Hospital Paulistano",
    "Hospital Presidente",
    "Hospital Previna",
    "Hospital Regional Sul",
    "Hospital Sagrada Familia",
    "Hospital Saint Patrick",
    "Hospital Saint Peter",
    "Hospital Samaritano",
    "Hospital Samaritano",
    "Hospital San Gennaro",
    "Hospital Sancta Maggiore",
    "Hospital Sancta Maggiore",
    "Hospital Sancta Maggiore",
    "Hospital Sancta Maggiore",
    "Hospital Sancta Maggiore",
    "Hospital Sancta Maggiore",
    "Hospital Sancta Maggiore",
    "Hospital Sancta Maggiore",
    "Hospital Sancta Maggiore",
    "Hospital Sancta Maggiore",
    "Hospital Santa Catarina",
    "Hospital Santa Clara",
    "Hospital Santa Isabel",
    "Hospital Santa Isabel",
    "Hospital Santa Marcelina",
    "Hospital Santa Marcelina",
    "Hospital Sao Judas",
    "Hospital Sao Luiz Gonzaga",
    "Hospital Sao Paulo Hospital de Ensino da UNIFESP",
    "Hospital SBC",
    "Hospital Sepaco",
    "Hospital Silvio Romero",
    "Hospital Sirio Libanes",
    "Hospital São Camilo",
    "Hospital São Camilo",
    "Hospital São Camilo",
    "Hospital São Luiz",
    "Hospital São Luiz",
    "Hospital São Luiz",
    "Hospital São Luiz",
    "Hospital São Miguel",
    "Hospital São Miguel",
    "Hospital São Miguel",
    "Hospital Universitario da USP",
    "Hospital Vidas Alta Complexidade",
    "Hospital Vila Nova Star",
    "Hospital Vila Nova Star",
    "Hospital Villa Lobos",
    "Hospital Vitoria Analia Franco",
    "HSANP Hospital",
    "HSM Vergueiro",
    "Humana Magna",
    "Humana Magna",
    "IBCC",
    "Icone da Visao",
    "IGESP Paulista",
    "Inst Suel Abujamra",
    "Instituto Dante Pazzanese de Cardiologia IDPC",
    "Instituto de Infectologia Emilio Ribas",
    "Instituto do Cancer Arnaldo Vieira de Carvalho",
    "Instituto do Cancer do Estado de Sao Paulo",
    "Instituto Rubem Berta",
    "Master Clin",
    "Maternidade Santa Joana",
    "Maternidade Santa Maria",
    "Monte Cristo Hospital de Multi Especialidades",
    "Pro Matre Paulista",
    "Santa Casa de Sao Paulo Hospital Central",
    "Unidade Avancada Santo Amaro",
    "Unidade de Gestao Assistencial II Hospital Ipiranga",
]
lista_hospital_unidade = [
    "A C Camargo Cancer Center - Rua Professor Antonio Prudente, 211 - Liberdade",
    "A C Camargo Cancer Center Unidade Pires da Mota - Pires da Mota, 1167 - Aclimacao",
    "Hospital A C Camargo Tamandare - Tamandare, 753 - Liberdade",
    "Acalanto Clinica Multidisciplinar - Rua Tito, 1549 - Vila Romana",
    "Assoc AACD V Clementino - Avenida Prof Ascendino Reis, 724 - Vil Clementino",
    "Associacao Hospitalar Platinum - R Guaipa, 509 - Vila Leopoldina",
    "Associacao Nossa Senhora do Pari - Rua Hanemann, 234 - Caninde",
    "Benvista Oftalmologia - Av Leoncio de Magalhaes, 683 - Jardim Sao Paulo",
    "BP Mirante - Rua Martiniano de Carvalho, 965 - Bela Vista",
    "Hospital BP - Maestro Cardim, 769 - Liberdade",
    "Carvalho Sandrin Servicos Hospitalares - Av Indianopolis, 1400 - Indianopolis",
    "CEMA Hosp Espec - Rua Padre Adelino, 333 - Quarta Parada",
    "Inst CEMA de Oftalmologia e Otorrinolaringologia - Rua Pascoal Moreira, 450 - Mooca",
    "Centro de Referencia da Saude da Mulher - Av Rio Branco, 1080 - Campos Eliseos",
    "Centro de Referencia e Treinamento DST AIDS - Rua Santa Cruz, 81 - Vila Mariana",
    "Centro Hospitalar do Sistema Penitenciario - Rua Dom Jose Mauricio, 15 - Carandiru",
    "Centro Medico PMESP - Avenida Nova Cantareira, 3659 - Tremembe",
    "Clinica Premium Care Unidade Morumbi - Av Morumbi, 3941 - Morumbi",
    "Conjunto Hospitalar do Mandaqui - Rua Voluntarios da Patria, 4301 - Santana",
    "Eye Clinic Ibirapuera - Avenida Republica do Libano, 1034 - Ibirapuera",
    "Healthcare Hospital de Transicao - Rua Dr Jambeiro Costa, 57 - Liberdade",
    "Hosp 9 de Julho - Rua Peixoto Gomide, 625 - Bela Vista",
    "Hosp da Aeronautica de SPHASP - Olavo Fontoura, 1400 - Santana",
    "Hosp da Sta Casa de Sto Amaro - Rua Isabel Schmidt, 59 - Santo Amaro",
    "Hosp de Clinicas J Helena - Rua Erva Andorinha, 123 - Jardim Helena",
    "Hosp do Serv Pub Municipal HSPM - Castro Alves, 60 - Liberdade",
    "Hosp Dom Alvarenga - Avenida Nazare, 1361 - Ipiranga",
    "Hosp e Mat Sto Expedito - Rua Tomoichi Shimizu, 201 - Itaquera",
    "Hosp Edmundo Vasconcelos - Rua Borges Lagoa, 1450 - Vil Clementino",
    "Hosp Independencia - Rua Urucurana, 01 - Jardim Pedro Jose Nu",
    "Hosp Mat 8 de Maio - Rua Rafael Monteiro Valeiro, 18 - Itaim Paulista",
    "Hosp Monumento CEHM - Rua Lima e Silva, 985 - Ipiranga",
    "Hosp Mun Capela do Socorro - Rua Cassio de Campos Nogueira, 2031 - Jardim das Imbuias",
    "Hosp Mun Carmen Prudente - Avenida dos Metalurgicos, 1797 - Cidade Tiradentes",
    "Hosp Mun Dr Carmino Caricchio - Av Celso Garcia, 4815 - Tatuape",
    "Hosp Mun Fernando Mauro Pires da Rocha - Estrada de Itapecerica, 1661 - Campo Limpo",
    "Hosp Mun Gilson de Cassia Marques de Carvalho - Avenida Santa Catarina, 2785 - Vila Mascote",
    "Hosp Mun Ignacio Proenca de Gouvea - Juventus, 562 - Parque da Mooca",
    "Hosp Mun Infantil Menino Jesus - Rua dos Ingleses, 258 - Bela Vista",
    "Hosp Mun Jabaquara Artur Ribeiro de Saboya - Avenida Francisco de Paula Quintanilha Ribeiro, 860 - Jabaquara",
    "Hosp Mun Josanias Castanha Braga - Rua Euzebio Coghi, 841 - Jardim Roschel",
    "Hosp Mun M Boi Mirim - Estrada do Mboi Mirim, 5203 - Jardim Angela",
    "Hosp Mun Mat Esc Dr Mario de Moraes A Silva - Deputado Emilio Carlos, 3100 - Vila Nova Cachoeirin",
    "Hosp Mun Maternidade Professor Mario Degni - Rua Lucas de Leyde, 257 - Vila Antonio",
    "Hosp Mun Pirituba Jose Soares Hungria - Avenida Menotti Laudisio, 100 - Pirituba",
    "Hosp Mun Prof Dr Waldomiro de Paula - Rua Augusto Carlos Baumann, 1074 - Itaquera",
    "Hosp Mun Professor Doutor Alipio Correa Netto - Alameda Rodrigo de Brum, 1989 - Vila Paranagua",
    "Hosp Mun Tide Setubal - Rua Dr Jose Guilherme Eiras, 123 - Sao Miguel Paulista",
    "Hosp Mun V Nhocune Alexandre Zaio - Rua Alves Maldonado, 128 - Vila Nhocune",
    "Hosp Mun Ver Jose Storopolli - Rua Francisco Fanganiello, 127 - Parque Novo Mundo",
    "Hosp Ps Nova Iguatemi - Avenida Ragueb Chohfi, 3315 - Sao Mateus",
    "Hosp Sta Rita - Cubatao, 1190 - Vila Mariana",
    "Hosp Sta Virginia - Celso Garcia, 2294 - Belem",
    "Hospital Adventista de Sao Paulo - Rua Rocha Pombo, 49 - Liberdade",
    "Hospital Albert Sabin - Rua Brigadeiro Gaviao Peixoto, 123 - Lapa",
    "Hospital Alvorada Moema - Avenida Ibirapuera, 1942 - Indianopolis",
    "Hospital Amparo Maternal - Rua Loefgreen, 1901 - V Clementino",
    "Hospital BDW - Av dos Bandeirantes, 679 - Vila Olimpia",
    "Hospital Bosque da Saude - Av Bosque da Saude, 1926 - Saude",
    "Hospital Central do Tatuape - Padre Adelino, 901 - Iv Parada",
    "Hospital Central Leste - Rua Cabo Jose Teixeira, 189 - Guaianases",
    "Hospital Central Sul - Estrada de Itapecerica, 4659 - Capao Redondo",
    "Hospital da Crianca - Rua das Perobas, 295 - Jabaquara",
    "Fundacao Faculdade de Medicinahcfmusp Inst de Psiquiatria - Rua Dr Ovidio Pires de Campos, 785 - Cerqueira Cesar",
    "HC da FMUSP Hospital das Clinicas - Rua Dr Ovidio Pires de Campos, 225 - Cerqueira Cesar",
    "HC da FMUSP Instituto do Coracao Incor - Avenida Dr Eneas de Carvalho Aguiar, 44 - Cerqueira Cesar",
    "Hospital de Olhos de Sao Paulo Unidade Norte - Avenida Nova Cantareira, 126 - Santana",
    "Hospital de Transp do Est de SP Euryclides de Jesus Zerbini - Av Brigadeiro Luiz Antonio, 2651 - Jardim Paulista",
    "Hospital do Coracao - Rua Desembargador Eliseu Guilherme, 123 - Paraiso",
    "Hospital do Rim e Hipertensao - Rua Borges Lagoa, 960 - Vila Clementino",
    "Hospital do Serv Pub Est Fco Morato de Oliveira - Avenida Ibirapuera, 981 - Ibirapuera",
    "Hospital e Maternidade Jardins LTDA - Rua Artur de Azevedo, 1659 - Pinheiros",
    "Hospital e Maternidade Leonor Mendes de Barros - Av Celso Garcia, 2477 - Belenzinho",
    "Hospital e Maternidade Metropolitano - Rua Marcelina, 441 - Vila Romana",
    "Hospital e Maternidade Salvalus - Rua Bresser, 1954 - Bras",
    "Hospital e Maternidade Santa Maria Cruz Azul - Lins de Vasconcelos, 356 - Cambuci",
    "Hospital e Maternidade Sao Cristovao - Rua Americo Ventura, 123 - Alto da Mooca",
    "Hospital e Maternidade Sao Rafael - Eca de Queiroz, 391 - Vila Mariana",
    "Hospital e Pronto Socorro Portinari - Praca General Guimaraes, 77 - Vila Jaguara",
    "Hospital Esporte e Saude BR Surgery - Rua Fagundes Filho, 475 - Vila Monte Alegre",
    "Hospital Estadual de Sapopemba - Rua Manoel Franca dos Santos, 174 - Jardim Sapopemba",
    "Hospital Geral de Pedreira - Rua Joao Francisco de Moura, 251 - Vila Campo Grande",
    "Hospital Geral de Sao Mateus - Rua Angelo de Candia, 540 - Sao Mateus",
    "Hospital Geral de Vila Penteado Dr Jose Pangella - Av Ministro Petronio Portela, 1642 - Jardim Iracema",
    "Hospital Geral do Grajau Prof Liber John Alphonse Di Dio - Rua Francisco Otavio Pacca, 180 - Parque das Nacoes",
    "Hospital Geral Henrique Altimeyer de Vila Alpina - Av Francisco Falconi, 1501 - Vila Alpina",
    "Hospital Geral Jesus Teixeira da Costa Guaianases - Av Miguel Achiole da Fonseca, 135 - Jardim Sao Paulo",
    "Hospital GRAACC Instituto de Oncologia Pediatrica IOP - Rua Pedro de Toledo, 572 - Vila Clementino",
    "Hospital Green Hill - Rua Bom Pastor, 905 - Ipiranga",
    "Hospital Heliopolis Unidade de Gestao Assistencial I - Con Xavier, 276 - V Heliopolis",
    "Hospital Indianopolis - Avenida Jandira, 1134 - Indianopolis",
    "Hospital Infantil Candido Fontoura - Rua Siqueira Bueno, 1757 - Agua Rasa",
    "Hospital Infantil Darcy Vargas UGA III - Rua Dr Serafico de Assis Carvalho, 34 - Jardim Guedala",
    "Hospital Infantil Sabara - Angelica, 1987 - Santa Cecilia",
    "Hospital Israelita Albert Einstein - Av Albert Einstein, 627 - Morumbi",
    "Unidade Avancada Einstein Perdizes - Rua Apiacas, 85 - Perdizes",
    "Hospital Itaquera - Rua Jose Oiticica Filho, 123 - Itaquera",
    "Hospital Japones Santa Cruz - R Santa Cruz, 398 - Vila Mariana",
    "Hospital Katia de Souza Rodrigues Taipassp - Av Elisio Teixeira Leite, 6999 - Parada de Taipas",
    "Hospital Leforte - Rua Tres Irmaos, 121 - Caxingui",
    "Hospital Leforte Liberdade - Rua Galvao Bueno, 257 - Liberdade",
    "Hospital Luz Vila Mariana - Rua Azevedo de Macedo, 113 - Jardim Zaira",
    "Hospital Maternidade Interlagos - Rua Leonor Alvim, 211 - Jd Leblon",
    "Hospital Militar de Area de Sao Paulo - Rua Ouvidor Portugal, 230 - Cambuci",
    "Hospital Montemagno - Avenida Montemagno, 241 - Vila Formosa",
    "Hospital Moriah - Avenida Moaci, 974 - Planalto Paulista",
    "Hospital Municipal Brasilandia - Michihisa Murata, 150 - Jardim Maristela",
    "Hospital Municipal Dr Benedito Montenegro - Rua Antonio Lazaro, 226 - Jardim Iva",
    "Hospital Nipo Brasileiro - Rua Pistoia, 100 - Parque Novo Mundo",
    "Hospital Nossa Senhora do Rosario - Dr Edson de Melo, 357 - Vila Maria Alta",
    "Hospital Paulista - Rua Doutor Diogo de Faria, 780 - Vila Clementino",
    "Hospital Paulistano - Rua Martiniano de Carvalho, 741 - Bela Vista",
    "Hospital Presidente - Avenida Nova Cantareira, 2398 - Tucuruvi",
    "Hospital Previna - Raimundo Pereira de Magalhaes, 12367 - Jardim Marilu",
    "Hospital Regional Sul - Rua General Roberto Alves de Carvalho Filho, 270 - Santo Amaro",
    "Hospital Sagrada Familia - Rua Arapoca, 128 - Vila Formosa",
    "Hospital Saint Patrick Portinari - Praca General Guimaraes, 77 - Vila Jaguara",
    "Hospital Saint Peter - Rua Estado de Israel, 747 - Vila Clementino",
    "Hospital Samaritano - Rua Conselheiro Brotero, 1486 - Higienopolis",
    "Hospital Samaritano Paulista - Avenida Brigadeiro Luis Antonio, 1895 - Bela Vista",
    "Hospital San Gennaro - Paes de Barros, 1327 - Mooca",
    "Hospital e Pronto Atendimento Sancta Maggiore - Rua da Figueira, 831 - Mooca",
    "Hospital e Pronto Atendimento Sancta Maggiore - Rua Maestro Cardim, 1137 - Bela Vista",
    "Hospital e Pronto Atendimento Sancta Maggiore - Rua Tamarataca, 127 - Mooca",
    "Hospital e Pronto Atendimento Sancta Maggiore Paris - Rua General Chagas Santos, 314 - Vila da Saude",
    "Hospital e Pronto Atendimento Sancta Maggiore Russia - Avenida Professor Francisco Morato, 1133 - Butanta",
    "Hospital Sancta Maggiore - Avenida Santo Amaro, 22 - Vila Nova Conceicao",
    "Hospital Sancta Maggiore - Rua Cristiano Viana, 890 - Pinheiros",
    "Hospital Sancta Maggiore - Rua Juaguaribe, 144 - Vila Buarque",
    "Hospital Sancta Maggiore - Rua Mituto Muzumoto, 596 - Liberdade",
    "Hospital Sancta Maggiore Dubai - Rua Francisco Tramontano, 100 - Real Parque",
    "Hospital Santa Catarina - Paulista, 200 - Bela Vista",
    "Hospital Santa Clara - Joaquim Marra, 138 - Vila Matilde",
    "Hospital Santa Isabel - R Dona Veridiana, 311 - Vila Buarque",
    "Hospital Santa Isabel - Rua Doutor Cesario Mota Junior, 112 - Santa Cecilia",
    "Hosp Sta Marcelina - Rua Santa Marcelina, 177 - Itaquera",
    "Hospital Geral Santa Marcelina de Itaim Paulista - Av Marechal Tito, 6035 - Itaim Paulista",
    "Hospital Sao Judas - Av Fagundes Filho, 475 - Vila Monte Alegre",
    "Hospital Sao Luiz Gonzaga - Michel Ouchana, 94 - Jacana",
    "Hospital Sao Paulo Hospital de Ensino da UNIFESP - Napoleao de Barros, 715 - Vl Clementina",
    "Hospital SBC - Rua Blumenau, 320 - Vila Leopoldina",
    "Hospital Sepaco - Vergueiro, 4210 - Vila Mariana",
    "Hospital Silvio Romero - Fernandes Pinheiro, 268 - Vila Azevedo",
    "Hospital Sirio Libanes - Rua Dona Adma Jafet, 91 - Cerqueira Cesar",
    "Hospital Sao Camilo Ipiranga - Pouso Alegre, 1 - Ipiranga",
    "Hospital Sao Camilo Pompeia - Av Pompeia, 1178 - Pompeia",
    "Hospital Sao Camilo Santana - Doutor Luis Lustosa da Silva, 33 - Santana",
    "Hosp Sao Luiz Analia Franco - Francisco Marengo, 1312 - Tatuape",
    "Hospital Sao Luiz Jabaquara - Rua das Perobas, 344 - Jabaquara",
    "Sao Luiz Unidade Itaim - Rua Doutor Alceu de Campos Rodrigues, 95 - Vila Nova Conceicao",
    "Sao Luiz Unidade Morumbi - Rua Engenheiro Oscar Americano, 840 - Morumbi",
    "Associacao Hospitalar Sao Miguel - Rua Abel Tavares, 21 - Jardim Belem",
    "Hospital Sao Miguel Unidade Ermelino Matarazzo - Rua Abel Tavares, 2576 - Jardim Belem",
    "Hospital Sao Miguel Unidade Sao Miguel Paulista - Rua Doutor Luiz Picollo, 11 - Sao Miguel Paulista",
    "Hospital Universitario da USP - Av Prof Lineu Prestes, 2565 - Butanta",
    "Hospital Vidas Alta Complexidade - Profa Maria de Lourdes de S Nogueira, 89 - Vila Gea",
    "Hospital Vila Nova Star - Rua Doutor Alceu de Campos Rodrigues, 126 - Vila Nova Conceicao",
    "Hospital Vila Nova Star II - Rua Doutor Alceu de Campos Rodrigues, 95 - Vila Nova Conceicao",
    "Hospital Villa Lobos - Rua Lituania, 260 - Mooca",
    "Hospital Vitoria Analia Franco - Avenida Vereador Abel Ferreira, 1900 - Chacara Mafalda",
    "HSANP Hospital - Rua Voluntarios da Patria, 2786 - Santana",
    "HSM Vergueiro - Vergueiro, 17 - Liberdade",
    "Humana Magna - R Verbo Divino, 1227 - Chacara Santo Antoni",
    "Rede Humana Magna de Saude LTDA - Av Pompeia, 985 - Vila Pompeia",
    "IBCC - Av Alcantara Machado, 2576 - Mooca",
    "Icone da Visao - Avenida Cidade Jardim, 163 - Itaim Bibi",
    "IGESP Paulista - Rua Silvia, 276 - Bela Vista",
    "Inst Suel Abujamra - Rua Tamandare, 693 - Aclimacao",
    "Instituto Dante Pazzanese de Cardiologia IDPC - Av Dr Dante Pazzanese, 500 - Ibirapuera",
    "Instituto de Infectologia Emilio Ribas - Dr Arnaldo, 165 - Sumare",
    "Instituto do Cancer Arnaldo Vieira de Carvalho - Rua Dr Cesario Mota Junior, 112 - Vila Buarque",
    "Instituto do Cancer do Estado de Sao Paulo - Av Dr Arnaldo, 251 - Cerqueira Cesar",
    "Instituto Rubem Berta - Rubem Berta, 1100 - Indianopolis",
    "Master Clin - Rua Dr Galvao Guimaraes, 72 - Sao Mateus",
    "Maternidade Santa Joana - Rua do Paraiso, 450 - Paraiso",
    "Maternidade Santa Maria - Rua Leoncio de Carvalho, 233 - Paraiso",
    "Monte Cristo Hospital de Multi Especialidades - Da Saudade, 218 - Cidade Mae do Ceu",
    "Pro Matre Paulista - Rua Sao Carlos do Pinhal, 139 - Bela Vista",
    "Santa Casa de Sao Paulo Hospital Central - Rua Dr Cesario Mota Junior, 112 - Vila Buarque",
    "Unidade Avancada Santo Amaro - Rua Barao do Rio Branco, 515 - Santo Amaro",
    "Unidade de Gestao Assistencial II Hospital Ipiranga - Avenida Nazare, 28 - Ipiranga",
]
lista_hospital_latitude = [
    -23.56548,
    -23.57071,
    -23.56544,
    -23.52756,
    -23.59742,
    -23.52119,
    -23.53167,
    -23.49497,
    -23.56746,
    -23.5675,
    -23.61096,
    -23.54502,
    -23.56282,
    -23.5343,
    -23.59662,
    -23.50857,
    -23.46916,
    -23.59997,
    -23.48498,
    -23.58113,
    -23.56618,
    -23.5597,
    -23.51385,
    -23.6502,
    -23.47869,
    -23.56676,
    -23.59626,
    -23.57741,
    -23.59638,
    -23.4988,
    -23.50074,
    -23.59438,
    -23.73075,
    -23.59717,
    -23.53288,
    -23.5329,
    -23.65718,
    -23.5717,
    -23.55999,
    -23.65364,
    -23.82646,
    -23.53339,
    -23.48012,
    -23.578,
    -23.48556,
    -23.53101,
    -23.4996,
    -23.49685,
    -23.543,
    -23.52218,
    -23.5945,
    -23.58222,
    -23.53686,
    -23.56348,
    -23.52568,
    -23.60158,
    -23.5996,
    -23.62472,
    -23.61329,
    -23.54409,
    -23.5379,
    -23.66014,
    -23.643,
    -23.55801,
    -23.55659,
    -23.56739,
    -23.56953,
    -23.5616,
    -23.5742,
    -23.59647,
    -23.59425,
    -23.5658,
    -23.5359,
    -23.5562,
    -23.54827,
    -23.56593,
    -23.56709,
    -23.57965,
    -23.50845,
    -23.6265,
    -23.61134,
    -23.68075,
    -23.59474,
    -23.4896,
    -23.72903,
    -23.59305,
    -23.55665,
    -23.59815,
    -23.58438,
    -23.60712,
    -23.61235,
    -23.55192,
    -23.59285,
    -23.54983,
    -23.59935,
    -23.53322,
    -23.5366,
    -23.59694,
    -23.4769,
    -23.58532,
    -23.55788,
    -23.58133,
    -23.70696,
    -23.569,
    -23.56293,
    -23.61504,
    -23.56727,
    -23.58767,
    -23.50801,
    -23.51147,
    -23.59521,
    -23.56068,
    -23.47646,
    -23.43473,
    -23.65556,
    -23.56516,
    -23.50845,
    -23.5943,
    -23.53907,
    -23.56493,
    -23.56538,
    -23.55232,
    -23.5603,
    -23.5642,
    -23.61826,
    -23.58535,
    -23.54187,
    -23.55543,
    -23.54145,
    -23.54943,
    -23.61775,
    -23.56957,
    -23.53297,
    -23.54267,
    -23.54317,
    -23.55433,
    -23.49242,
    -23.62672,
    -23.45951,
    -23.59778,
    -23.53748,
    -23.59508,
    -23.54161,
    -23.55692,
    -23.58287,
    -23.53425,
    -23.48752,
    -23.54896,
    -23.6437,
    -23.59084,
    -23.57594,
    -23.48625,
    -23.48624,
    -23.56741,
    -23.56492,
    -23.67544,
    -23.59006,
    -23.5906,
    -23.56329,
    -23.55956,
    -23.49575,
    -23.56221,
    -23.63263,
    -23.53301,
    -23.5472,
    -23.57838,
    -23.56672,
    -23.56477,
    -23.58554,
    -23.55579,
    -23.54317,
    -23.55613,
    -23.60246,
    -23.61549,
    -23.57433,
    -23.57188,
    -23.36,
    -23.56566,
    -23.54317,
    -23.65059,
    -23.58433,
]
lista_hospital_longitude = [
    -46.6379,
    -46.63849,
    -46.63593,
    -46.70684,
    -46.65112,
    -46.72712,
    -46.62093,
    -46.61585,
    -46.64285,
    -46.64154,
    -46.65163,
    -46.59073,
    -46.5909,
    -46.64375,
    -46.63581,
    -46.6201,
    -46.61835,
    -46.70858,
    -46.63143,
    -46.66328,
    -46.63797,
    -46.6557,
    -46.64491,
    -46.7052,
    -46.42321,
    -46.63902,
    -46.60967,
    -46.43965,
    -46.65124,
    -46.46311,
    -46.3995,
    -46.59694,
    -46.71364,
    -46.40343,
    -46.56638,
    -46.75968,
    -46.6538,
    -46.5901,
    -46.64686,
    -46.64505,
    -46.7306,
    -46.63997,
    -46.67261,
    -46.765,
    -46.70873,
    -46.44488,
    -46.47246,
    -46.43999,
    -46.5023,
    -46.56327,
    -46.44755,
    -46.6412,
    -46.59018,
    -46.63392,
    -46.71167,
    -46.6606,
    -46.6376,
    -46.64965,
    -46.62031,
    -46.58505,
    -46.40314,
    -46.77276,
    -46.64322,
    -46.67439,
    -46.67233,
    -46.57038,
    -46.57042,
    -46.68841,
    -46.64334,
    -46.64584,
    -46.55134,
    -46.68661,
    -46.58871,
    -46.46013,
    -46.60247,
    -46.62216,
    -46.57068,
    -46.64456,
    -46.75117,
    -46.6293,
    -46.49367,
    -46.67848,
    -46.48671,
    -46.69821,
    -46.69085,
    -46.56076,
    -46.40025,
    -46.64602,
    -46.60764,
    -46.59525,
    -46.65578,
    -46.58521,
    -46.71094,
    -46.65936,
    -46.71532,
    -46.67554,
    -46.45051,
    -46.63278,
    -46.7293,
    -46.71822,
    -46.63506,
    -46.64043,
    -46.7022,
    -46.614,
    -46.56028,
    -46.66018,
    -46.57008,
    -46.51598,
    -46.56862,
    -46.58396,
    -46.6444,
    -46.64135,
    -46.61057,
    -46.7201,
    -46.70586,
    -46.54222,
    -46.75117,
    -46.64692,
    -46.66203,
    -46.64691,
    -46.59462,
    -46.62488,
    -46.6399,
    -46.59422,
    -46.63209,
    -46.72156,
    -46.65055,
    -46.6797,
    -46.65158,
    -46.63465,
    -46.70514,
    -46.64541,
    -46.52764,
    -46.65078,
    -46.64991,
    -46.4613,
    -46.38898,
    -46.63689,
    -46.5822,
    -46.64353,
    -46.72849,
    -46.62747,
    -46.57215,
    -46.65423,
    -46.6117,
    -46.6881,
    -46.62691,
    -46.55838,
    -46.6429,
    -46.67376,
    -46.63628,
    -46.47417,
    -46.47404,
    -46.57057,
    -46.74095,
    -46.68658,
    -46.67488,
    -46.67576,
    -46.58998,
    -46.56549,
    -46.62828,
    -46.63858,
    -46.71008,
    -46.68932,
    -46.60033,
    -46.68213,
    -46.5692,
    -46.6356,
    -46.65095,
    -46.6672,
    -46.64991,
    -46.66817,
    -46.6518,
    -46.47701,
    -46.63878,
    -46.64708,
    -46.36,
    -46.64953,
    -46.64991,
    -46.70925,
    -46.61162,
]

# Frota de drones (listas paralelas): código e carga atual da bateria (%)
lista_drone_codigo = ["DR-01", "DR-02", "DR-03", "DR-04"]
lista_drone_bateria = [100, 70, 45, 20]

# Distância que um drone consegue voar com 100% de bateria (em km), já com a carga máxima.
# É o mesmo alcance usado no aplicativo SADEC e nos drones X6 do projeto Java.
autonomia_km = 40

# ID (número de identificação) que o próximo pedido vai receber.
# Começa em 1001 para todo ID ter 4 dígitos e aumenta 1 a cada pedido registrado,
# então dois pedidos nunca recebem o mesmo ID.
proximo_id_pedido = 1001

# Listas paralelas dos pedidos: a mesma posição (índice) em todas as listas
# guarda as informações de um mesmo pedido.
# Ex.: lista_id_pedido[0], lista_uso_drone[0] e lista_peso[0] são do primeiro pedido.
lista_id_pedido = []
lista_email_cliente = []         # email de quem fez o pedido (para cada pessoa ver só os seus)
lista_data_hora = []             # data e hora em que o pedido foi feito (dd/mm/aaaa hh:mm)
lista_uso_drone = []
lista_prioridade = []            # nível na fila: 1 Órgãos, 2 Emergência, 3 Saúde, 4 Comercial
lista_peso = []
lista_endereco_entrega = []      # os endereços são guardados já formatados, em uma linha de texto
lista_endereco_retirada = []
lista_codigo_recebimento = []    # código de 4 números que quem receber o pedido precisa informar
lista_drone = []                 # drone escolhido ("A definir" quando ainda não foi escolhido)
lista_status = []

# Dados de um pedido que acabou de ser preenchido e ainda vai ser salvo nas listas
# (na ordem: uso, prioridade, peso, entrega, retirada, código, drone).
# Fica vazia ([]) quando não há pedido novo para salvar.
novo_pedido = []

# Email de quem está logado no momento ("" quando ninguém está logado)
email_logado = ""

# Posição (índice nas listas) do pedido que está aberto na tela de detalhes
posicao_pedido = -1

# A variável "tela" guarda qual menu está sendo exibido:
# "login", "principal", "pedidos", "detalhe_pedido", "perfil", "emergencia" ou "sair".
tela = "login"

while tela != "sair":
    match tela:

        # ---------- TELA DE LOGIN ----------
        case "login":
            opcao = exibir_menu("Sistema SADEC", ["Login", "Fechar"])
            match opcao:
                case "1":
                    email_logado = realizar_login()
                    if email_logado != "0":
                        tela = "principal"
                case "2":
                    tela = "sair"

        # ---------- MENU PRINCIPAL ----------
        case "principal":
            opcao = exibir_menu("Menu principal SADEC", ["Requerimento de emergência",
                                                        "Requerimento de drone", "Pedidos",
                                                        "Perfil", "Encerrar sessão/logout"])
            match opcao:

                # Requerimento de emergência (só entra com a senha de emergência)
                case "1":
                    if verificar_senha_emergencia(senha_emergencia):
                        tela = "emergencia"

                # Requerimento de drone (o pedido é salvo no fim do while, em "REGISTRO DE UM NOVO PEDIDO")
                case "2":
                    novo_pedido = ler_requerimento_drone()
                    if len(novo_pedido) == 0:
                        print("\nRequerimento cancelado. Nenhum dado foi salvo.")

                # Pedidos
                case "3":
                    # Só entra na tela de pedidos se a pessoa logada já fez algum pedido
                    if len(buscar_todas_posicoes(lista_email_cliente, email_logado)) == 0:
                        print("\nVocê ainda não fez nenhum pedido.")
                    else:
                        tela = "pedidos"

                # Perfil
                case "4":
                    tela = "perfil"

                # Encerrar sessão/logout
                case "5":
                    print("\nLogout realizado. Até a próxima!")
                    email_logado = ""
                    tela = "login"

        # ---------- LISTA DE PEDIDOS (MEUS PEDIDOS) ----------
        case "pedidos":
            # Só aparecem os pedidos feitos pelo email que está logado.
            # A lista é montada de novo toda vez, para já mostrar pedidos editados ou cancelados.
            posicoes = buscar_todas_posicoes(lista_email_cliente, email_logado)
            resumos = resumos_pedidos(posicoes, lista_id_pedido, lista_uso_drone,
                                      lista_data_hora, lista_status)
            posicao_pedido = escolher_posicao(posicoes, resumos, "Meus pedidos",
                                              "\nEscolha um pedido para ver os detalhes (0 para voltar): ")
            if posicao_pedido == -1:
                tela = "principal"
            else:
                tela = "detalhe_pedido"

        # ---------- DETALHES DE UM PEDIDO ----------
        case "detalhe_pedido":
            exibir_dados(f"Pedido {lista_id_pedido[posicao_pedido]}",
                         ["ID do pedido", "Data e hora do pedido", "Status", "Prioridade",
                          "Uso do drone", "Peso aproximado da carga",
                          "Endereço de entrega", "Endereço de retirada",
                          "Código de recebimento", "Drone"],
                         [lista_id_pedido[posicao_pedido], lista_data_hora[posicao_pedido],
                          lista_status[posicao_pedido], formatar_prioridade(lista_prioridade[posicao_pedido]),
                          lista_uso_drone[posicao_pedido], formatar_peso(lista_peso[posicao_pedido]),
                          lista_endereco_entrega[posicao_pedido], lista_endereco_retirada[posicao_pedido],
                          lista_codigo_recebimento[posicao_pedido], lista_drone[posicao_pedido]])

            # As opções dependem do status do pedido:
            # - "Em análise" (ainda não confirmado): pode editar e cancelar
            # - "Confirmado": só pode cancelar
            # - "Cancelado": não tem opções, só voltar
            # Pedidos de emergência são sempre salvos como "Confirmado" (são urgentes),
            # então o Editar, que usa as perguntas do Requerimento de drone, não aparece para eles.
            status = lista_status[posicao_pedido]
            acoes = []
            if status == "Em análise":
                acoes.append("Editar pedido")
            if status == "Em análise" or status == "Confirmado":
                acoes.append("Cancelar pedido")

            if len(acoes) == 0:
                print(f"Este pedido está {status.lower()} e não pode mais ser alterado.")
                esperar_voltar()
                tela = "pedidos"
            else:
                acao = escolher_da_lista("O que deseja fazer?", acoes, "Opção (0 para voltar): ")
                match acao:

                    case "0":
                        tela = "pedidos"

                    # Cancelar: o pedido continua na lista, mas com o status "Cancelado"
                    case "Cancelar pedido":
                        resposta = ler_sim_nao(f"\nTem certeza que deseja cancelar o pedido "
                                               f"{lista_id_pedido[posicao_pedido]}?")
                        if resposta == "s":
                            lista_status[posicao_pedido] = "Cancelado"
                            print(f"\nPedido {lista_id_pedido[posicao_pedido]} cancelado com sucesso.")
                            tela = "pedidos"
                        else:
                            print("\nO pedido não foi cancelado.")

                    # Editar: troca uma informação do pedido (só pedidos ainda não confirmados)
                    case "Editar pedido":
                        campo = escolher_da_lista("Qual informação deseja editar?",
                                                  ["Uso do drone", "Peso aproximado da carga",
                                                   "Endereço de entrega", "Endereço de retirada",
                                                   "Código de recebimento"],
                                                  "Opção (0 para voltar): ")
                        if campo != "0":
                            print("(se digitar 0 em qualquer campo, a edição será cancelada)")
                            alterado = False
                            match campo:
                                case "Uso do drone":
                                    uso = ler_uso_drone()
                                    if uso != "0":
                                        lista_uso_drone[posicao_pedido] = uso
                                        # a prioridade muda junto com o uso (ex.: comida -> remédios)
                                        lista_prioridade[posicao_pedido] = prioridade_do_uso(uso)
                                        alterado = True
                                case "Peso aproximado da carga":
                                    peso = ler_peso("\nInsira o novo peso aproximado da carga em kg: ")
                                    if peso > 0:
                                        lista_peso[posicao_pedido] = peso
                                        alterado = True
                                case "Endereço de entrega":
                                    entrega = ler_endereco("Novo endereço de entrega")
                                    if len(entrega) > 0:
                                        lista_endereco_entrega[posicao_pedido] = formatar_endereco(entrega)
                                        alterado = True
                                case "Endereço de retirada":
                                    retirada = ler_endereco("Novo endereço de retirada")
                                    if len(retirada) > 0:
                                        lista_endereco_retirada[posicao_pedido] = formatar_endereco(retirada)
                                        alterado = True
                                case "Código de recebimento":
                                    codigo = ler_codigo_recebimento("Crie um novo código de 4 números: ")
                                    if codigo != "0":
                                        lista_codigo_recebimento[posicao_pedido] = codigo
                                        alterado = True

                            if alterado:
                                print(f"\n{campo} alterado com sucesso.")
                            else:
                                print("\nEdição cancelada. Nenhuma informação foi alterada.")

        # ---------- PERFIL ----------
        case "perfil":
            # Mostra o email logado e quantos pedidos a pessoa tem de cada status
            posicoes = buscar_todas_posicoes(lista_email_cliente, email_logado)
            status_da_pessoa = status_dos_pedidos(posicoes, lista_status)
            exibir_dados("Perfil",
                         ["Email", "Total de pedidos", "Pedidos em análise",
                          "Pedidos confirmados", "Pedidos cancelados"],
                         [email_logado, len(posicoes), status_da_pessoa.count("Em análise"),
                          status_da_pessoa.count("Confirmado"), status_da_pessoa.count("Cancelado")])

            acao = escolher_da_lista("O que deseja fazer?", ["Excluir conta"], "Opção (0 para voltar): ")
            match acao:

                case "0":
                    tela = "principal"

                # Excluir conta: apaga todos os pedidos da pessoa e volta para a tela de login
                case "Excluir conta":
                    print("\nAtenção: todos os seus pedidos serão apagados e isso não pode ser desfeito.")
                    resposta = ler_sim_nao("Tem certeza que deseja excluir a sua conta?")
                    if resposta == "s":
                        # Apaga os pedidos desta pessoa de todas as listas.
                        # O for vai do fim para o começo da lista: o pop() puxa uma posição para trás
                        # os itens que vêm depois do apagado, então as posições que ainda faltam
                        # olhar (que estão antes) não mudam.
                        for i in range(len(lista_email_cliente) - 1, -1, -1):
                            if lista_email_cliente[i] == email_logado:
                                lista_id_pedido.pop(i)
                                lista_email_cliente.pop(i)
                                lista_data_hora.pop(i)
                                lista_uso_drone.pop(i)
                                lista_prioridade.pop(i)
                                lista_peso.pop(i)
                                lista_endereco_entrega.pop(i)
                                lista_endereco_retirada.pop(i)
                                lista_codigo_recebimento.pop(i)
                                lista_drone.pop(i)
                                lista_status.pop(i)
                        print("\nConta excluída. Todos os seus dados foram apagados.")
                        email_logado = ""
                        tela = "login"
                    else:
                        print("\nA conta não foi excluída.")

        # ---------- MENU DE REQUERIMENTO DE EMERGÊNCIA ----------
        # Pedidos de emergência têm as prioridades mais altas da fila:
        # nível 1 = transporte de órgão e nível 2 = ajuda em desastre.
        # Os pedidos são salvos no fim do while, em "REGISTRO DE UM NOVO PEDIDO".
        case "emergencia":
            opcao = exibir_menu("Requerimento de emergência", ["Transporte de órgão para transplante",
                                                               "Ajuda em desastre (enchente ou deslizamento)",
                                                               "Retornar ao menu principal"])
            match opcao:

                # Transporte de órgão para transplante (prioridade 1)
                case "1":
                    novo_pedido = ler_transporte_orgao(lista_hospital_rede, lista_hospital_unidade,
                                                       lista_hospital_latitude, lista_hospital_longitude,
                                                       lista_drone_codigo, lista_drone_bateria, autonomia_km)
                    if len(novo_pedido) == 0:
                        print("\nRequerimento cancelado. Nenhum dado foi salvo.")

                # Ajuda em desastre (prioridade 2)
                case "2":
                    novo_pedido = ler_ajuda_desastre()
                    if len(novo_pedido) == 0:
                        print("\nRequerimento cancelado. Nenhum dado foi salvo.")

                case "3":
                    print("Retornando ao menu principal...")
                    tela = "principal"

    # ---------- REGISTRO DE UM NOVO PEDIDO ----------
    # Fica depois do "match tela" porque vale para os três requerimentos (drone, órgão e desastre):
    # quando algum deles preenche a lista "novo_pedido", o pedido é salvo aqui, em um lugar só.
    if len(novo_pedido) > 0:
        # O pedido recebe o ID atual e o contador avança para o próximo pedido
        id_pedido = proximo_id_pedido
        proximo_id_pedido += 1

        # Data e hora do computador neste momento, no formato dd/mm/aaaa hh:mm
        data_hora = datetime.now().strftime("%d/%m/%Y %H:%M")

        # Salva o pedido: um append em cada lista, assim todas as
        # informações deste pedido ficam na mesma posição
        lista_id_pedido.append(id_pedido)
        lista_email_cliente.append(email_logado)
        lista_data_hora.append(data_hora)
        lista_uso_drone.append(novo_pedido[0])
        lista_prioridade.append(novo_pedido[1])
        lista_peso.append(novo_pedido[2])
        lista_endereco_entrega.append(novo_pedido[3])
        lista_endereco_retirada.append(novo_pedido[4])
        lista_codigo_recebimento.append(novo_pedido[5])
        lista_drone.append(novo_pedido[6])
        # Emergências (prioridade 1 e 2) já entram confirmadas; o Requerimento de drone (3 e 4)
        # entra "Em análise" e ainda pode ser editado ou cancelado pelo cliente
        if novo_pedido[1] <= 2:
            lista_status.append("Confirmado")
        else:
            lista_status.append("Em análise")

        exibir_dados("Resumo do requerimento",
                     ["Uso do drone", "Prioridade", "Peso aproximado da carga",
                      "Endereço de entrega", "Endereço de retirada", "Código de recebimento", "Drone"],
                     [novo_pedido[0], formatar_prioridade(novo_pedido[1]), formatar_peso(novo_pedido[2]),
                      novo_pedido[3], novo_pedido[4], novo_pedido[5], novo_pedido[6]])

        # Emergências (prioridade 1 e 2) são confirmadas na hora; o Requerimento de drone fica em análise
        if novo_pedido[1] <= 2:
            print("O registro do pedido foi realizado com sucesso e está confirmado.")
        else:
            print("O registro do pedido foi realizado com sucesso e está em análise.")
        print(f"O ID do pedido é: {id_pedido}")

        novo_pedido = []    # esvazia a lista para o mesmo pedido não ser salvo de novo

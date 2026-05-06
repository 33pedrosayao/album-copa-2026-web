# Álbum Copa do Mundo 2026

Aplicação web para Pedro e Ana gerenciarem o álbum de figurinhas da Copa 2026 da Panini.

- Álbum compartilhado: marcar figurinhas como coladas afeta os dois
- Bolos de repetidas separados: cada um tem o seu próprio

## Rodar localmente

```bash
npm install
npm start
# Abrir http://localhost:3000
```

## Deploy no Railway

1. Crie um projeto no Railway conectando ao repositório GitHub
2. Adicione um volume persistente montado em `/data`
3. Defina a variável de ambiente `DB_PATH=/data/album.db`
4. Railway detecta Node automaticamente e executa `npm start`

> Sem o volume, o banco é apagado a cada redeploy.

## Editar a estrutura do álbum

Edite `figurinhas_album_2026.csv` e delete o arquivo `album.db` para forçar o reseed na próxima inicialização.

## Resetar dados (coladas / repetidas)

Conecte ao banco com qualquer cliente SQLite e execute:

```sql
UPDATE figurinhas SET colada = 0;
DELETE FROM repetidas;
```

Ou simplesmente delete o arquivo `album.db` para começar do zero.

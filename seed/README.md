# Seed Database & Simulador de Jornada de Esquí

Simula el comportamiento realista de una jornada de esquí y snowboard en una estación:
- Comienza siempre en la **cota baja** de la estación.
- Realiza el circuito completo: **Subida en remonte ➔ Cima ➔ Bajada de pista ➔ Cota baja / conexión ➔ Siguiente remonte**.
- Diferenciación física y conductual entre **Esquiador** (`ski`) y **Snowboarder** (`snowboard`):
  - **Esquiador**: virajes paralelos más cortos, mayor velocidad punta, bastones para deslizarse en zonas llanas, pausas de pie.
  - **Snowboarder**: giros amplios en S (talón-puntera), pausas en la cima para sentarse y abrocharse la fijación trasera, velocidad adaptada.
- Siempre baja por pistas y sube por remontes, con transiciones suaves (0 teletransporte).

### Requisitos y ejecución

```shell
python3 -m venv .venv
source .venv/bin/activate
pip install psycopg2-binary requests
```

Ejecutar ambos perfiles (esquiador y snowboarder):
```shell
python3 seed/seed-database.py --rider both --runs 8
```

Simular solo esquiador o solo snowboarder:
```shell
python3 seed/seed-database.py --rider ski --resort "Sierra Nevada" --runs 10
python3 seed/seed-database.py --rider snowboard --resort "Valdesquí" --runs 8
```

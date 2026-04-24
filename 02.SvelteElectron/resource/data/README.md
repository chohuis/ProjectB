# Data Layout

- `master/`: immutable reference data bundled with app build
- `master/players/`: player generation refs (name pools, archetypes, generation rules)
- `master/teams/`: team/school/league indexes
- `seeds/`: one-time seed data for new save creation
- runtime DB and logs are created under `%APPDATA%/<AppName>/runtime`
